"""OpenAI-compatible model endpoint that answers PokeBench harness turns with Claude Code.

The harness talks to it exactly as it talked to Astra's bridge
(runs/probes/gpt6-astra-30m-20261025/gateway.mjs): GET /v1/models, and
POST chat/completions answered as server-sent events carrying one tool call.
Each turn becomes a headless `claude -p` call that replies with one JSON object
{name, arguments, text}, validated against the request's tools.

Modes:
  stateless  every turn is one fresh call carrying the whole harness window and
             its images; no tools, no session on disk, an empty working dir.
  session    one persistent Claude Code session per run, continued with
             --resume. Each turn sends only the harness messages since the model's
             last reply and the paths of that turn's screenshots; Read, confined to the bridge's
             screens folder, is its only tool.

A usage limit or any other provider failure never reaches the harness as an
error, because five reply failures end a run. The request is held: the gateway
appends `pause` to runs/<run>/control.jsonl, retries on a fixed backoff, answers
when a call succeeds and then appends `resume`. The SSE stream opens at once and
carries keepalive comments while a request is held, so the harness's HTTP client
neither times out nor resends it.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Literal, Protocol

DESCRIPTION = (
    "OpenAI-compatible model endpoint that answers PokeBench harness turns with Claude Code."
)
Mode = Literal["stateless", "session"]
JsonObject = dict[str, object]

BACKOFF_SECONDS: tuple[float, ...] = (300.0, 600.0, 1200.0, 1800.0)
KEEPALIVE_SECONDS = 15.0
CALL_TIMEOUT_SECONDS = 900.0
# Variables the claude child inherits. Everything else (the Desktop app's injected
# CLAUDE_CODE_* and ANTHROPIC_BASE_URL, CLAUDE_CODE_SIMPLE, POKEBENCH_*) is dropped.
ENV_ALLOW = ("HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "TERM")
ENV_ALLOW_PREFIXES = ("LC_",)

REPLY_CONTRACT = """\
You are the player. Each turn, choose exactly one of the harness tools listed to \
you and reply with only one JSON object, nothing before or after it:
{"name": "<tool name>", "arguments": {<arguments matching that tool's parameters>}, \
"text": "<one or two sentences on what you are doing and why>"}
You cannot run the tools yourself; the harness runs the one you name and shows you \
the result next turn."""

SESSION_CONTRACT = """\
Each turn you receive only the newest harness messages, so keep track of the game \
in your own memory. Screenshots for the turn are saved as PNG files; read one with \
the Read tool when you want to see the screen. Read is the only tool you can call: \
the harness tools are not callable, so choose one by replying with the JSON object."""


class GatewayError(ValueError):
    pass


@dataclass(frozen=True)
class Image:
    media_type: str
    data: bytes


@dataclass(frozen=True)
class Part:
    text: str | None = None
    image: Image | None = None


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass(frozen=True)
class Message:
    role: str
    parts: tuple[Part, ...]
    tool_call_id: str | None = None
    tool_calls: tuple[ToolCall, ...] = ()


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: JsonObject


@dataclass(frozen=True)
class ChatRequest:
    model: str
    messages: tuple[Message, ...]
    tools: tuple[Tool, ...]

    @property
    def system(self) -> str:
        return "\n\n".join(_text(m.parts) for m in self.messages if m.role == "system")

    @property
    def dialogue(self) -> tuple[Message, ...]:
        return tuple(m for m in self.messages if m.role != "system")

    @property
    def current_turn(self) -> tuple[Message, ...]:
        """Everything after the model's latest reply: its tool result and every message the
        harness added since (screenshots, battle updates, supervisor and memory blocks)."""
        dialogue = self.dialogue
        last = max((i for i, m in enumerate(dialogue) if m.role == "assistant"), default=-1)
        return dialogue[last + 1 :]


@dataclass(frozen=True)
class Reply:
    name: str
    arguments: JsonObject
    text: str


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


@dataclass(frozen=True)
class CallResult:
    text: str
    session_id: str | None
    usage: Usage
    models: tuple[str, ...]
    latency_ms: int
    error: str | None = None
    # A provider failure (usage or rate limit, overload, auth, crash, timeout):
    # the request is held and retried, never answered with an error.
    provider_wait: bool = False


@dataclass(frozen=True)
class Prompt:
    system: str
    content: tuple[JsonObject, ...]


@dataclass(frozen=True)
class CallSpec:
    mode: Mode
    prompt: Prompt
    cwd: Path
    session_id: str
    resume: bool
    record: Path


@dataclass(frozen=True)
class Config:
    mode: Mode
    model: str
    effort: str
    bridge: Path
    runs_root: Path
    claude: str = "claude"
    claude_config_dir: Path | None = None
    served_model: str = ""
    context_window: int = 32768
    max_tokens: int = 4096
    run_id: str | None = None
    game_port: int | None = None
    backoff: tuple[float, ...] = BACKOFF_SECONDS
    keepalive: float = KEEPALIVE_SECONDS
    call_timeout: float = CALL_TIMEOUT_SECONDS
    # Claude Code's auto-compact window in tokens; None keeps its default (the model's window).
    autocompact: int | None = None
    # A stopped run whose Claude session a continuation run may adopt (memory carries over).
    continue_from: str | None = None
    # Session mode's current-turn delivery: "auto" follows the bound run's recorded
    # gateway-current-turn-v1; "on"/"off" is an operator override for this gateway only.
    current_turn: Literal["auto", "on", "off"] = "auto"
    # gateway-tool-schemas-v1: the full tool listing in every session system prompt.
    tool_schemas: Literal["auto", "on", "off"] = "auto"
    # gateway-schema-hint-v1: an anyOf/oneOf re-ask lists the schema's allowed forms.
    schema_hint: Literal["auto", "on", "off"] = "auto"

    @property
    def advertised(self) -> str:
        return self.served_model or self.model


# ---------------------------------------------------------------- request parsing


def _obj(value: object, where: str) -> JsonObject:
    if not isinstance(value, dict):
        raise GatewayError(f"{where} must be an object")
    return {str(k): v for k, v in value.items()}


def _list(value: object, where: str) -> list[object]:
    if not isinstance(value, list):
        raise GatewayError(f"{where} must be a list")
    return value


def _str(value: object, where: str) -> str:
    if not isinstance(value, str):
        raise GatewayError(f"{where} must be a string")
    return value


def _opt_str(value: object, where: str) -> str | None:
    return None if value is None else _str(value, where)


DATA_URL = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.S)


def _parts(content: object, where: str) -> tuple[Part, ...]:
    if content is None:
        return ()
    if isinstance(content, str):
        return (Part(text=content),)
    parts: list[Part] = []
    for index, raw in enumerate(_list(content, where)):
        part = _obj(raw, f"{where}[{index}]")
        kind = part.get("type")
        if kind == "text" or (kind is None and "text" in part):
            parts.append(Part(text=_str(part.get("text"), f"{where}[{index}].text")))
        elif kind == "image_url":
            url = _str(_obj(part.get("image_url"), "image_url").get("url"), "image_url.url")
            match = DATA_URL.match(url)
            if match is None:
                raise GatewayError(f"{where}[{index}] image is not a base64 data URL")
            try:
                data = base64.b64decode(match[2], validate=True)
            except binascii.Error as error:
                raise GatewayError(f"{where}[{index}] image is not valid base64") from error
            parts.append(Part(image=Image(match[1], data)))
        else:
            raise GatewayError(f"{where}[{index}] has unsupported type {kind!r}")
    return tuple(parts)


def parse_request(raw: bytes) -> ChatRequest:
    try:
        body = _obj(json.loads(raw), "request")
    except json.JSONDecodeError as error:
        raise GatewayError(f"request is not JSON: {error}") from error
    messages: list[Message] = []
    for index, value in enumerate(_list(body.get("messages"), "messages")):
        message = _obj(value, f"messages[{index}]")
        calls: list[ToolCall] = []
        for cindex, call_value in enumerate(_list(message.get("tool_calls") or [], "tool_calls")):
            call = _obj(call_value, f"messages[{index}].tool_calls[{cindex}]")
            function = _obj(call.get("function"), "function")
            calls.append(
                ToolCall(
                    id=_str(call.get("id", ""), "tool_call.id"),
                    name=_str(function.get("name"), "function.name"),
                    arguments=_str(function.get("arguments", "{}"), "function.arguments"),
                )
            )
        messages.append(
            Message(
                role=_str(message.get("role"), f"messages[{index}].role"),
                parts=_parts(message.get("content"), f"messages[{index}].content"),
                tool_call_id=_opt_str(message.get("tool_call_id"), "tool_call_id"),
                tool_calls=tuple(calls),
            )
        )
    tools: list[Tool] = []
    for index, value in enumerate(_list(body.get("tools") or [], "tools")):
        tool = _obj(value, f"tools[{index}]")
        function = _obj(tool.get("function", tool), f"tools[{index}].function")
        tools.append(
            Tool(
                name=_str(function.get("name"), f"tools[{index}].name"),
                description=_str(function.get("description", ""), "description"),
                parameters=_obj(function.get("parameters", {"type": "object"}), "parameters"),
            )
        )
    if not tools:
        raise GatewayError("request offers no tools")
    return ChatRequest(_str(body.get("model", ""), "model"), tuple(messages), tuple(tools))


def _text(parts: Sequence[Part]) -> str:
    return "\n".join(p.text for p in parts if p.text is not None)


# ---------------------------------------------------------------- reply validation


def _type_ok(value: object, kind: str) -> bool:
    if kind == "integer":
        whole = isinstance(value, float) and value.is_integer()
        return whole or isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, int | float) and not isinstance(value, bool)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "array":
        return isinstance(value, list)
    if kind == "object":
        return isinstance(value, dict)
    if kind == "null":
        return value is None
    return True


def schema_errors(value: object, schema: JsonObject, path: str = "arguments") -> list[str]:
    """The JSON Schema keywords the harness's tool parameters use."""
    kinds = schema.get("type")
    if isinstance(kinds, str) and not _type_ok(value, kinds):
        return [f"{path} must be {kinds}"]
    if isinstance(kinds, list) and not any(_type_ok(value, str(k)) for k in kinds):
        return [f"{path} must be one of {kinds}"]
    errors: list[str] = []
    for keyword, needed in (("anyOf", 1), ("oneOf", 1)):
        options = schema.get(keyword)
        if isinstance(options, list):
            fits = sum(not schema_errors(value, _obj(o, keyword), path) for o in options)
            if fits < needed or keyword == "oneOf" and fits > 1:
                errors.append(f"{path} matches {fits} of the {keyword} options")
    every = schema.get("allOf")
    for part in every if isinstance(every, list) else []:
        errors.extend(schema_errors(value, _obj(part, "allOf"), path))
    enum = schema.get("enum")
    if isinstance(enum, list) and value not in enum:
        errors.append(f"{path} must be one of {json.dumps(enum)}")
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path} must be {json.dumps(schema['const'])}")
    if isinstance(value, int | float) and not isinstance(value, bool):
        low, high = schema.get("minimum"), schema.get("maximum")
        if isinstance(low, int | float) and value < low:
            errors.append(f"{path} must be at least {low}")
        if isinstance(high, int | float) and value > high:
            errors.append(f"{path} must be at most {high}")
    if isinstance(value, str):
        shortest, longest = schema.get("minLength"), schema.get("maxLength")
        if isinstance(shortest, int) and len(value) < shortest:
            errors.append(f"{path} must have at least {shortest} characters")
        if isinstance(longest, int) and len(value) > longest:
            errors.append(f"{path} must have at most {longest} characters")
        pattern = schema.get("pattern")
        if isinstance(pattern, str) and re.search(pattern, value) is None:
            errors.append(f"{path} must match {pattern}")
    if isinstance(value, list):
        errors.extend(_array_errors(value, schema, path))
    if isinstance(value, dict):
        errors.extend(_object_errors({str(k): v for k, v in value.items()}, schema, path))
    return errors


def _array_errors(value: list[object], schema: JsonObject, path: str) -> list[str]:
    errors: list[str] = []
    fewest, most = schema.get("minItems"), schema.get("maxItems")
    if isinstance(fewest, int) and len(value) < fewest:
        errors.append(f"{path} must have at least {fewest} items")
    if isinstance(most, int) and len(value) > most:
        errors.append(f"{path} must have at most {most} items")
    if schema.get("uniqueItems") is True:
        seen = [json.dumps(item, sort_keys=True) for item in value]
        if len(set(seen)) < len(seen):
            errors.append(f"{path} must not repeat items")
    items = schema.get("items")
    if isinstance(items, dict):
        for index, item in enumerate(value):
            errors.extend(schema_errors(item, _obj(items, "items"), f"{path}[{index}]"))
    elif isinstance(items, list):
        for index, item in enumerate(value):
            if index < len(items):
                errors.extend(schema_errors(item, _obj(items[index], "items"), f"{path}[{index}]"))
            elif schema.get("additionalItems") is False:
                errors.append(f"{path} has too many items")
                break
    return errors


def _object_errors(value: JsonObject, schema: JsonObject, path: str) -> list[str]:
    errors: list[str] = []
    properties = schema.get("properties")
    props = _obj(properties, "properties") if isinstance(properties, dict) else {}
    required = schema.get("required")
    for name in required if isinstance(required, list) else []:
        if name not in value:
            errors.append(f"{path}.{name} is required")
    for name, item in value.items():
        patterns = schema.get("patternProperties")
        matched = [
            _obj(sub, key)
            for key, sub in (_obj(patterns, "patternProperties") if patterns else {}).items()
            if re.search(key, name)
        ]
        for sub in matched:
            errors.extend(schema_errors(item, sub, f"{path}.{name}"))
        if name in props:
            errors.extend(schema_errors(item, _obj(props[name], name), f"{path}.{name}"))
        elif matched:
            continue
        elif schema.get("additionalProperties") is False:
            errors.append(f"{path}.{name} is not a parameter")
    return errors


def _json_candidates(text: str) -> Iterator[object]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.S)
    if fenced:
        stripped = fenced[1]
    try:
        yield json.loads(stripped)
        return
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", stripped):
        try:
            value, _ = decoder.raw_decode(stripped, match.start())
        except json.JSONDecodeError:
            continue
        yield value


def parse_reply(text: str, tools: Sequence[Tool]) -> Reply:
    """The model's reply as a validated tool call, or GatewayError naming what is wrong."""
    by_name = {tool.name: tool for tool in tools}
    found: JsonObject | None = None
    for candidate in _json_candidates(text):
        if isinstance(candidate, dict) and "name" in candidate:
            found = {str(k): v for k, v in candidate.items()}
            break
    if found is None:
        raise GatewayError('the reply holds no JSON object with "name" and "arguments"')
    name = found.get("name")
    if not isinstance(name, str) or name not in by_name:
        raise GatewayError(f"name must be one of {sorted(by_name)}, got {name!r}")
    arguments = found.get("arguments", {})
    if not isinstance(arguments, dict):
        raise GatewayError("arguments must be an object")
    args = {str(k): v for k, v in arguments.items()}
    errors = schema_errors(args, by_name[name].parameters)
    if errors:
        raise GatewayError("; ".join(errors))
    note = found.get("text", "")
    return Reply(name, args, note if isinstance(note, str) else json.dumps(note))


# ---------------------------------------------------------------- prompts


def _tool_listing(tools: Sequence[Tool]) -> str:
    rows = [
        {"name": t.name, "description": t.description, "parameters": t.parameters} for t in tools
    ]
    return "Harness tools:\n" + json.dumps(rows, ensure_ascii=False, indent=1)


def _render(message: Message, image_note: Callable[[int], str] | None) -> list[JsonObject]:
    header = f"[{message.role}" + (
        f" result of {message.tool_call_id}]" if message.tool_call_id else "]"
    )
    blocks: list[JsonObject] = [{"type": "text", "text": header}]
    images = 0
    for part in message.parts:
        if part.text is not None:
            blocks.append({"type": "text", "text": part.text})
        elif part.image is not None:
            if image_note is None:
                encoded = base64.b64encode(part.image.data).decode()
                source = {"type": "base64", "media_type": part.image.media_type, "data": encoded}
                blocks.append({"type": "image", "source": source})
            else:
                blocks.append({"type": "text", "text": image_note(images)})
            images += 1
    for call in message.tool_calls:
        blocks.append({"type": "text", "text": f"(called {call.name} {call.arguments})"})
    return blocks


def _merge_text(blocks: Sequence[JsonObject]) -> tuple[JsonObject, ...]:
    merged: list[JsonObject] = []
    for block in blocks:
        last = merged[-1] if merged else None
        if block["type"] == "text" and last is not None and last["type"] == "text":
            merged[-1] = {"type": "text", "text": f"{last['text']}\n{block['text']}"}
        else:
            merged.append(block)
    return tuple(merged)


def stateless_prompt(request: ChatRequest) -> Prompt:
    system = f"{request.system}\n\n{REPLY_CONTRACT}\n\n{_tool_listing(request.tools)}"
    blocks: list[JsonObject] = []
    for message in request.dialogue:
        blocks.extend(_render(message, None))
    blocks.append({"type": "text", "text": "Reply now with the one JSON object."})
    return Prompt(system, _merge_text(blocks))


def _screenshot_note(paths: Sequence[Path]) -> Callable[[int], str]:
    def note(index: int) -> str:
        return f"(screenshot saved at {paths[index]})"

    return note


def session_prompt(
    request: ChatRequest,
    messages: Sequence[Message],
    screens: Sequence[Sequence[Path]],
    first: bool,
    tools_changed: bool,
    tool_schemas: bool = False,
) -> Prompt:
    """This turn's harness messages; screenshots appear as file paths to Read."""
    system = f"{request.system}\n\n{REPLY_CONTRACT}\n\n{SESSION_CONTRACT}"
    blocks: list[JsonObject] = []
    if tool_schemas:
        # The system prompt is re-sent every call and never compacted.
        system = f"{system}\n\n{_tool_listing(request.tools)}"
        names = ", ".join(t.name for t in request.tools)
        text = f"Harness tools: {names} (full parameter schemas are in the system prompt)."
        blocks.append({"type": "text", "text": text})
    elif first or tools_changed:
        blocks.append({"type": "text", "text": _tool_listing(request.tools)})
    else:
        names = ", ".join(t.name for t in request.tools)
        blocks.append({"type": "text", "text": f"Harness tools unchanged: {names}."})
    for message, paths in zip(messages, screens, strict=True):
        blocks.extend(_render(message, _screenshot_note(paths)))
    blocks.append({"type": "text", "text": "Reply now with the one JSON object."})
    return Prompt(system, _merge_text(blocks))


def _describe_option(option: JsonObject) -> str:
    properties = option.get("properties")
    if isinstance(properties, dict):
        props = _obj(properties, "properties")
        listed = option.get("required")
        required = [k for k in listed if isinstance(k, str)] if isinstance(listed, list) else []
        parts = []
        for key in required:
            prop = props.get(key)
            spec = _obj(prop, key) if isinstance(prop, dict) else {}
            if "const" in spec:
                parts.append(f"{key}: {json.dumps(spec['const'])}")
            elif isinstance(spec.get("enum"), list):
                parts.append(f"{key}: one of {json.dumps(spec['enum'])}")
            else:
                parts.append(f"{key} ({spec.get('type', 'any')})")
        optional = [k for k in props if k not in required]
        extra = f" optional: {', '.join(optional)}" if optional else ""
        return "{" + ", ".join(parts) + "}" + extra
    if "const" in option:
        return json.dumps(option["const"])
    if isinstance(option.get("enum"), list):
        return f"one of {json.dumps(option['enum'])}"
    return str(option.get("type", "any"))


def _alternatives(schema: JsonObject, path: str) -> Iterator[tuple[str, str, list[JsonObject]]]:
    for keyword in ("anyOf", "oneOf"):
        options = schema.get(keyword)
        if isinstance(options, list):
            parsed = [_obj(o, keyword) for o in options if isinstance(o, dict)]
            yield path, keyword, parsed
            for option in parsed:
                yield from _alternatives(option, path)
    properties = schema.get("properties")
    if isinstance(properties, dict):
        for key, sub in properties.items():
            if isinstance(sub, dict):
                yield from _alternatives(_obj(sub, str(key)), f"{path}.{key}")
    items = schema.get("items")
    if isinstance(items, dict):
        yield from _alternatives(_obj(items, "items"), f"{path}[]")


def schema_hint(reply: str, tools: Sequence[Tool], error: str) -> str:
    """For each anyOf/oneOf the error names, its allowed forms, generated from the schema."""
    by_name = {tool.name: tool for tool in tools}
    name = next(
        (c.get("name") for c in _json_candidates(reply) if isinstance(c, dict) and "name" in c),
        None,
    )
    if not isinstance(name, str) or name not in by_name:
        return ""
    lines = []
    for path, keyword, options in _alternatives(by_name[name].parameters, "arguments"):
        if f"{path} matches" in error and options:
            forms = "; ".join(_describe_option(o) for o in options)
            word = "exactly one" if keyword == "oneOf" else "one"
            lines.append(f"{path} must match {word} of these {len(options)} forms: {forms}")
    return "\n".join(lines)


def reask(prompt: Prompt, reply: str, error: str, session: bool, hint: str = "") -> Prompt:
    note = f"Your reply could not be used: {error}. Reply again with only the one JSON object."
    if hint:
        note = f"{note}\n{hint}"
    if session:
        return Prompt(prompt.system, ({"type": "text", "text": note},))
    shown = f"Your previous reply was:\n{reply}\n{note}"
    return Prompt(prompt.system, (*prompt.content, {"type": "text", "text": shown}))


# ---------------------------------------------------------------- claude runner


USAGE_LIMIT = re.compile(r"limit|\b429\b|rate|too many requests|resets?\b", re.I)
AUTH_FAILURE = re.compile(r"authenticat|log ?in\b|oauth|api key|credential", re.I)


def wait_kind(error: str | None) -> str:
    """A label for the log; every kind is held and retried the same way."""
    text = error or ""
    if USAGE_LIMIT.search(text):
        return "usage_limit"
    if AUTH_FAILURE.search(text):
        return "auth"
    return "provider"


def claude_argv(config: Config, spec: CallSpec) -> list[str]:
    argv = [
        config.claude,
        "-p",
        "--model",
        config.model,
        "--effort",
        config.effort,
        "--system-prompt",
        spec.prompt.system,
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--strict-mcp-config",
        "--setting-sources",
        "",
        "--disable-slash-commands",
        "--permission-prompts",
        "none",
        # Readable thinking summaries in the stream (not in --help on 2.1.299; live-checked).
        "--thinking-display",
        "summarized",
    ]
    if config.autocompact is not None:
        argv += ["--autocompact", str(config.autocompact)]
    if spec.mode == "stateless":
        return [*argv, "--tools", "", "--no-session-persistence"]
    # Snapshot on (the default) would keep the first system prompt across resumes.
    argv += ["--tools", "Read", "--restricted", "--system-prompt-snapshot", "off"]
    return [*argv, "--resume" if spec.resume else "--session-id", spec.session_id]


def claude_env(config: Config, source: dict[str, str]) -> dict[str, str]:
    env = {k: v for k, v in source.items() if k in ENV_ALLOW or k.startswith(ENV_ALLOW_PREFIXES)}
    if config.claude_config_dir is not None:
        env["CLAUDE_CONFIG_DIR"] = str(config.claude_config_dir)
    return env


def stdin_line(prompt: Prompt) -> str:
    message = {"role": "user", "content": list(prompt.content)}
    return json.dumps({"type": "user", "message": message}) + "\n"


def _int(value: object) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def parse_stream(stdout: str, stderr: str, exit_code: int, latency_ms: int) -> CallResult:
    """The `result` event of a stream-json run, classified."""
    result: JsonObject | None = None
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict) and event.get("type") == "result":
            result = {str(k): v for k, v in event.items()}
    if result is None:
        tail = (stderr.strip() or stdout.strip())[-500:]
        return CallResult(
            "", None, Usage(), (), latency_ms, f"claude exited {exit_code}: {tail}", True
        )
    raw_usage = result.get("usage")
    usage_obj = _obj(raw_usage, "usage") if isinstance(raw_usage, dict) else {}
    cost = result.get("total_cost_usd")
    usage = Usage(
        _int(usage_obj.get("input_tokens")),
        _int(usage_obj.get("cache_read_input_tokens")),
        _int(usage_obj.get("cache_creation_input_tokens")),
        _int(usage_obj.get("output_tokens")),
        float(cost) if isinstance(cost, int | float) else 0.0,
    )
    model_usage = result.get("modelUsage")
    models = tuple(sorted(model_usage)) if isinstance(model_usage, dict) else ()
    session = result.get("session_id")
    session_id = session if isinstance(session, str) else None
    text = result.get("result")
    body = text if isinstance(text, str) else ""
    if result.get("is_error") is True:
        status = result.get("api_error_status")
        detail = f"{result.get('subtype')}: {body}" + (f" (HTTP {status})" if status else "")
        # error_max_turns is the model looping on Read, not the provider.
        waiting = result.get("subtype") != "error_max_turns"
        return CallResult(body, session_id, usage, models, latency_ms, detail, waiting)
    return CallResult(body, session_id, usage, models, latency_ms)


class Runner(Protocol):
    def __call__(self, config: Config, spec: CallSpec) -> CallResult: ...


def run_claude(config: Config, spec: CallSpec) -> CallResult:
    spec.cwd.mkdir(parents=True, exist_ok=True)
    began = time.monotonic()
    try:
        done = subprocess.run(
            claude_argv(config, spec),
            input=stdin_line(spec.prompt),
            capture_output=True,
            text=True,
            cwd=spec.cwd,
            env=claude_env(config, dict(os.environ)),
            timeout=config.call_timeout,
            check=False,
        )
        stdout, stderr, code = done.stdout, done.stderr, done.returncode
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode() if isinstance(error.stdout, bytes) else ""
        stderr, code = f"timed out after {config.call_timeout:.0f}s", -1
    latency = int((time.monotonic() - began) * 1000)
    # The complete native stream, thinking blocks included, for forensics.
    spec.record.write_text(stdout + ("" if not stderr else f"\n# stderr\n{stderr}"))
    return parse_stream(stdout, stderr, code, latency)


# ---------------------------------------------------------------- run binding and control


def iso_now(clock: Callable[[], float]) -> str:
    stamp = datetime.fromtimestamp(clock(), UTC)
    return stamp.strftime("%Y-%m-%dT%H:%M:%S.") + f"{stamp.microsecond // 1000:03d}Z"


@dataclass
class RunBinder:
    """Which run this gateway serves: --run-id, else the one run whose run_start
    names --game-port and was written after the gateway started."""

    runs_root: Path
    started: float
    run_id: str | None = None
    game_port: int | None = None
    how: str = ""

    def resolve(self) -> str | None:
        if self.run_id is not None:
            self.how = self.how or "--run-id"
            return self.run_id
        if self.game_port is None:
            return None
        matches = [
            path.parent.name
            for path in sorted(self.runs_root.glob("*/events.jsonl"))
            if self._started_here(path)
        ]
        if len(matches) == 1:
            self.run_id, self.how = matches[0], f"run_start on port {self.game_port}"
            return self.run_id
        return None

    def recorded_feature(self, name: str) -> bool:
        """Read the actual recorded FeatureSet for this bound run, never today's defaults."""
        run = self.resolve()
        if run is None:
            return False
        path = self.runs_root / run / "events.jsonl"
        if not path.exists():
            return False
        try:
            with path.open(encoding="utf8") as handle:
                start = _obj(json.loads(handle.readline()), "run_start")
        except (OSError, ValueError) as error:
            raise GatewayError(f"run_start unreadable: {error}") from error
        if start.get("type") != "run_start":
            raise GatewayError(f"the first event is {start.get('type')!r}, not run_start")
        evaluation = _obj(start.get("evaluation") or {}, "evaluation")
        features = _obj(evaluation.get("features") or {}, "features")
        enabled = features.get(name, False)
        if not isinstance(enabled, bool):
            raise GatewayError(f"{name} must be a boolean")
        return enabled

    def _started_here(self, path: Path) -> bool:
        try:
            if path.stat().st_mtime < self.started:
                return False
            with path.open(encoding="utf8") as handle:
                start = _obj(json.loads(handle.readline()), "run_start")
            isolation = _obj(start.get("isolation"), "isolation")
            at = datetime.fromisoformat(_str(start.get("t"), "t")).timestamp()
        except (OSError, ValueError):
            return False
        return (
            start.get("type") == "run_start"
            and isolation.get("port") == self.game_port
            and at >= self.started
        )


def append_control(runs_root: Path, run_id: str, action: str, at: str) -> int:
    """The viewer's appendControl: seq is the count of existing lines plus one."""
    path = runs_root / run_id / "control.jsonl"
    lines = path.read_text(encoding="utf8").splitlines() if path.exists() else []
    seq = sum(1 for line in lines if line) + 1
    line = json.dumps({"v": 1, "seq": seq, "at": at, "action": action}, separators=(",", ":"))
    with path.open("a", encoding="utf8") as handle:
        handle.write(line + "\n")
    return seq


# ---------------------------------------------------------------- the gateway


@dataclass
class SessionState:
    session_id: str | None = None
    tools_sha: str = ""
    run_id: str | None = None
    # claude -p reports total_cost_usd for the whole session, across resumes.
    cost_total: float = 0.0

    @staticmethod
    def load(path: Path) -> SessionState:
        if not path.exists():
            return SessionState()
        data = _obj(json.loads(path.read_text(encoding="utf8")), "session")
        cost = data.get("cost_total", 0.0)
        return SessionState(
            session_id=_opt_str(data.get("session_id"), "session_id"),
            tools_sha=_str(data.get("tools_sha"), "sha"),
            run_id=_opt_str(data.get("run_id"), "run_id"),
            cost_total=float(cost) if isinstance(cost, int | float) else 0.0,
        )

    def save(self, path: Path) -> None:
        state = {
            "session_id": self.session_id,
            "tools_sha": self.tools_sha,
            "cost_total": self.cost_total,
            "run_id": self.run_id,
        }
        path.write_text(json.dumps(state) + "\n", encoding="utf8")


@dataclass
class Outcome:
    reply: Reply | None
    error: str | None
    paused: bool = False


@dataclass
class Gateway:
    config: Config
    runner: Runner = run_claude
    clock: Callable[[], float] = time.time
    sleep: Callable[[float], None] = time.sleep
    seq: int = 0
    binder: RunBinder = field(init=False)
    session: SessionState = field(init=False)
    lock: threading.Lock = field(default_factory=threading.Lock)
    bound_logged: bool = field(default=False, init=False)
    holding: bool = field(default=False, init=False)

    def __post_init__(self) -> None:
        bridge = self.config.bridge
        for sub in ("requests", "screens", "calls", "empty"):
            (bridge / sub).mkdir(parents=True, exist_ok=True)
        self.binder = RunBinder(
            self.config.runs_root, self.clock(), self.config.run_id, self.config.game_port
        )
        self.session = SessionState.load(bridge / "session.json")
        self.seq = len(list((bridge / "requests").glob("request-*.json")))
        self.event(
            "gateway_start",
            mode=self.config.mode,
            model=self.config.model,
            effort=self.config.effort,
            autocompact=self.config.autocompact,
            continue_from=self.config.continue_from,
            current_turn=self.config.current_turn,
            tool_schemas=self.config.tool_schemas,
            schema_hint=self.config.schema_hint,
            session_id=self.session.session_id,
            run_id=self.config.run_id,
            game_port=self.config.game_port,
        )

    def event(self, kind: str, **fields: object) -> None:
        row = {"at": iso_now(self.clock), "event": kind, **fields}
        with (self.config.bridge / "gateway.jsonl").open("a", encoding="utf8") as handle:
            handle.write(json.dumps(row) + "\n")

    def run_id(self) -> str | None:
        bound = self.binder.resolve()
        if bound is not None and not self.bound_logged:
            self.bound_logged = True
            self.event("run_bound", run_id=bound, how=self.binder.how)
        return bound

    def control(self, action: str) -> None:
        run = self.run_id()
        if run is None:
            self.event("control_skipped", action=action, reason="no run bound")
            return
        seq = append_control(self.config.runs_root, run, action, iso_now(self.clock))
        self.event("control", action=action, run_id=run, seq=seq)

    def answer(
        self,
        raw: bytes,
        deliver: Callable[[int, Outcome], None] | None = None,
        gone: Callable[[], bool] = lambda: False,
    ) -> tuple[int, Outcome]:
        """Answer one request; `resume` follows any `pause`, even when delivery fails."""
        with self.lock:
            self.seq += 1
            seq = self.seq
            (self.config.bridge / "requests" / f"request-{seq}.json").write_bytes(raw)
            self.run_id()
            self.holding = False
            try:
                outcome = self._answer(seq, parse_request(raw), gone)
                if deliver is not None:
                    deliver(seq, outcome)
                return seq, outcome
            finally:
                if self.holding:
                    self.control("resume")

    def _save_screens(self, seq: int, messages: Sequence[Message]) -> list[list[Path]]:
        screens: list[list[Path]] = []
        for index, message in enumerate(messages):
            paths: list[Path] = []
            for part in message.parts:
                if part.image is None:
                    continue
                ext = "jpg" if part.image.media_type == "image/jpeg" else "png"
                path = self.config.bridge / "screens" / f"turn-{seq}-{index}-{len(paths)}.{ext}"
                path.write_bytes(part.image.data)
                paths.append(path)
            screens.append(paths)
        return screens

    def _decide(self, seq: int, feature: str, override: str, invalid: str) -> tuple[bool, str]:
        """A session-mode gateway switch: the run's recorded feature, or an operator override."""
        source = "run_features" if override == "auto" else "operator_override"
        try:
            recorded = override == "auto" and self.binder.recorded_feature(feature)
        except GatewayError as error:
            # Fail safe to the legacy behavior rather than killing a request whose stream is open.
            self.event(invalid, request=seq, error=str(error))
            recorded = False
        chosen = recorded if override == "auto" else override == "on"
        return self.config.mode == "session" and chosen, source

    def _first_prompt(self, seq: int, request: ChatRequest) -> Prompt:
        enabled, source = self._decide(
            seq, "gateway-current-turn-v1", self.config.current_turn, "current_turn_feature_invalid"
        )
        messages = request.current_turn if enabled else request.dialogue[-2:]
        screens = self._save_screens(seq, messages)
        if self.config.mode == "stateless":
            return stateless_prompt(request)
        schemas, schemas_source = self._decide(
            seq, "gateway-tool-schemas-v1", self.config.tool_schemas, "tool_schemas_feature_invalid"
        )
        self.event(
            "session_input",
            request=seq,
            current_turn=enabled,
            source=source,
            tool_schemas=schemas,
            tool_schemas_source=schemas_source,
            messages=len(messages),
            run_id=self.binder.run_id,
        )
        bound = self.binder.run_id
        known = self.session.run_id
        # A session belongs to exactly one run; unknown ownership never carries over, except
        # the named parent run's session, adopted once by its bound continuation.
        continuing = known is not None and known == self.config.continue_from and bound is not None
        if self.session.session_id is not None and bound != known and continuing:
            self.event(
                "session_continued", old_run=known, run_id=bound, session=self.session.session_id
            )
            self.session.run_id = bound
        elif self.session.session_id is not None and bound != known:
            self.event(
                "session_reset", old_run=known, run_id=bound, old_session=self.session.session_id
            )
            self.session = SessionState()
        sha = hashlib.sha256(_tool_listing(request.tools).encode()).hexdigest()
        changed = sha != self.session.tools_sha
        self.session.tools_sha = sha
        first = self.session.session_id is None
        return session_prompt(request, messages, screens, first, changed, schemas)

    def _spec(self, seq: int, attempt: int, prompt: Prompt) -> CallSpec:
        bridge = self.config.bridge
        record = bridge / "calls" / f"call-{seq}-{attempt}.jsonl"
        if self.config.mode == "stateless":
            return CallSpec("stateless", prompt, bridge / "empty", "", False, record)
        started = self.session.session_id
        # Until a call has succeeded there is no session to resume: a fresh id each time.
        session_id = started if started is not None else str(uuid.uuid4())
        return CallSpec(
            "session", prompt, bridge / "screens", session_id, started is not None, record
        )

    def _answer(self, seq: int, request: ChatRequest, gone: Callable[[], bool]) -> Outcome:
        prompt = self._first_prompt(seq, request)
        reasked = False
        waits = 0
        waited_ms = 0
        attempt = 0
        while True:
            attempt += 1
            spec = self._spec(seq, attempt, prompt)
            result = self.runner(self.config, spec)
            session_total = result.usage.cost_usd
            if spec.mode == "session":
                result = self._per_call_cost(spec, result)
            self._log_call(seq, attempt, spec, result, waited_ms, session_total)
            if result.provider_wait:
                if waits == 0:
                    self.control("pause")
                    self.holding = True
                if gone():
                    self.event("client_gone", request=seq, attempt=attempt)
                    return Outcome(None, "the client disconnected", True)
                delay = self.config.backoff[min(waits, len(self.config.backoff) - 1)]
                self.event(
                    "provider_wait",
                    wait=wait_kind(result.error),
                    request=seq,
                    attempt=attempt,
                    error=result.error,
                    retry_in_s=delay,
                )
                waits += 1
                self.sleep(delay)
                waited_ms += int(delay * 1000)
                continue
            if self.config.mode == "session" and result.session_id is not None:
                self.session.session_id = result.session_id
                self.session.run_id = self.binder.run_id
                if not spec.resume:
                    self.session.cost_total = session_total
                self.session.save(self.config.bridge / "session.json")
            try:
                if result.error is not None:
                    raise GatewayError(result.error)
                return Outcome(parse_reply(result.text, request.tools), None, waits > 0)
            except GatewayError as error:
                if reasked:
                    self.event("invalid_reply", request=seq, error=str(error))
                    return Outcome(None, f"invalid reply after one re-ask: {error}", waits > 0)
                reasked = True
                hint = ""
                hinting, hint_source = self._decide(
                    seq, "gateway-schema-hint-v1", self.config.schema_hint,
                    "schema_hint_feature_invalid",
                )  # fmt: skip
                if hinting:
                    hint = schema_hint(result.text, request.tools, str(error))
                self.event(
                    "reask", request=seq, schema_hint=hinting, source=hint_source,
                    hint_chars=len(hint), error=str(error),
                )  # fmt: skip
                session = self.config.mode == "session"
                prompt = reask(prompt, result.text, str(error), session, hint)

    def _per_call_cost(self, spec: CallSpec, result: CallResult) -> CallResult:
        """A resumed session's cost is its new total minus the total already logged."""
        if not spec.resume:
            return result
        total = result.usage.cost_usd
        cost = max(0.0, total - self.session.cost_total)
        self.session.cost_total = max(self.session.cost_total, total)
        return replace(result, usage=replace(result.usage, cost_usd=cost))

    def _log_call(
        self,
        seq: int,
        attempt: int,
        spec: CallSpec,
        result: CallResult,
        waited_ms: int,
        session_total: float,
    ) -> None:
        outcome = "provider_wait" if result.provider_wait else "error" if result.error else "ok"
        row = {
            "at": iso_now(self.clock),
            "request": seq,
            "attempt": attempt,
            "run_id": self.binder.run_id,
            "mode": spec.mode,
            "model": self.config.model,
            "models_used": list(result.models),
            "effort": self.config.effort,
            "autocompact": self.config.autocompact,
            "session_id": result.session_id or (spec.session_id or None),
            "input_tokens": result.usage.input_tokens,
            "cache_read_tokens": result.usage.cache_read_tokens,
            "cache_creation_tokens": result.usage.cache_creation_tokens,
            "output_tokens": result.usage.output_tokens,
            "cost_usd": result.usage.cost_usd,
            "session_cost_total_usd": session_total if spec.mode == "session" else None,
            "latency_ms": result.latency_ms,
            "provider_wait_ms": waited_ms,
            "outcome": outcome,
            "error": result.error,
            "record": spec.record.name,
        }
        with (self.config.bridge / "calls.jsonl").open("a", encoding="utf8") as handle:
            handle.write(json.dumps(row) + "\n")


# ---------------------------------------------------------------- HTTP


def sse_chunk(seq: int, model: str, delta: JsonObject, finish: str | None, now: float) -> bytes:
    chunk = {
        "id": f"chatcmpl-{seq}",
        "object": "chat.completion.chunk",
        "created": int(now),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    return f"data: {json.dumps(chunk)}\n\n".encode()


def sse_reply(seq: int, model: str, reply: Reply, now: float) -> bytes:
    call = {
        "index": 0,
        "id": f"call_{seq}",
        "type": "function",
        "function": {"name": reply.name, "arguments": json.dumps(reply.arguments)},
    }
    delta: JsonObject = {"role": "assistant", "content": reply.text, "tool_calls": [call]}
    return (
        sse_chunk(seq, model, delta, None, now)
        + sse_chunk(seq, model, {}, "tool_calls", now)
        + b"data: [DONE]\n\n"
    )


def sse_error(message: str) -> bytes:
    # The OpenAI client raises on a data frame with an `error`: one reply failure.
    error = {"error": {"message": message, "type": "invalid_reply"}}
    return f"data: {json.dumps(error)}\n\n".encode()


def make_handler(gateway: Gateway) -> type[BaseHTTPRequestHandler]:
    config = gateway.config

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            return

        def _json(self, status: int, body: JsonObject) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802
            if self.path not in ("/v1/models", "/models"):
                self._json(404, {"error": f"no route GET {self.path}"})
                return
            model = {
                "id": config.advertised,
                "context_window": config.context_window,
                "max_tokens": config.max_tokens,
                "metadata": {"observed": {"capabilities": ["multimodal"]}},
            }
            self._json(200, {"object": "list", "data": [model]})

        def do_POST(self) -> None:  # noqa: N802
            if "chat/completions" not in self.path:
                self._json(404, {"error": f"no route POST {self.path}"})
                return
            raw = self.rfile.read(int(self.headers.get("content-length") or 0))
            try:
                parse_request(raw)
            except GatewayError as error:
                self._json(400, {"error": str(error)})
                return
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("cache-control", "no-cache")
            self.send_header("connection", "close")
            self.end_headers()
            self.close_connection = True
            done = threading.Event()
            lost = threading.Event()
            write = threading.Lock()

            def keepalive() -> None:
                while not done.wait(config.keepalive):
                    with write:
                        if done.is_set():
                            return
                        try:
                            self.wfile.write(b": waiting\n\n")
                            self.wfile.flush()
                        except OSError:
                            lost.set()
                            return

            def deliver(seq: int, outcome: Outcome) -> None:
                with write:
                    done.set()
                    if outcome.reply is not None:
                        now = gateway.clock()
                        self.wfile.write(sse_reply(seq, config.advertised, outcome.reply, now))
                    else:
                        self.wfile.write(sse_error(outcome.error or "no reply"))
                    self.wfile.flush()

            threading.Thread(target=keepalive, daemon=True).start()
            try:
                gateway.answer(raw, deliver, lost.is_set)
            except OSError:
                gateway.event("client_gone", request=gateway.seq, attempt=None)
            finally:
                done.set()

    return Handler


def serve(gateway: Gateway, port: int) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(gateway))
    server.daemon_threads = True
    return server


def _backoff(text: str) -> tuple[float, ...]:
    values = tuple(float(v) for v in text.split(","))
    if not values or any(v < 0 for v in values):
        raise argparse.ArgumentTypeError("backoff is comma-separated non-negative seconds")
    return values


def _autocompact(text: str) -> int:
    """Tokens, as claude 2.1.299 accepts them: 100k to 1M ("258k" or "258000")."""
    match = re.fullmatch(r"(\d+)(k?)", text.strip().lower())
    tokens = 0 if match is None else int(match[1]) * (1000 if match[2] else 1)
    if not 100_000 <= tokens <= 1_000_000:
        raise argparse.ArgumentTypeError("autocompact is 100k to 1M tokens, e.g. 258k")
    return tokens


def parse_args(argv: Sequence[str]) -> tuple[Config, int]:
    parser = argparse.ArgumentParser(prog="claude-gateway", description=DESCRIPTION)
    parser.add_argument("--mode", choices=("stateless", "session"), required=True)
    parser.add_argument("--model", required=True, help="claude --model id, e.g. claude-opus-5-5")
    parser.add_argument(
        "--effort", default="medium", choices=("low", "medium", "high", "xhigh", "max")
    )
    parser.add_argument("--bridge", type=Path, required=True, help="folder for logs and screens")
    parser.add_argument("--runs-root", type=Path, default=Path("runs"))
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--run-id")
    parser.add_argument("--game-port", type=int, help="bind to the run started on this port")
    parser.add_argument("--claude", default="claude", help="claude executable")
    parser.add_argument(
        "--claude-config-dir",
        type=Path,
        help="CLAUDE_CONFIG_DIR for the claude child (a dedicated login)",
    )
    parser.add_argument("--served-model", default="", help="model id advertised to the harness")
    parser.add_argument("--context-window", type=int, default=32768)
    parser.add_argument("--max-tokens", type=int, default=4096)
    parser.add_argument("--backoff", type=_backoff, default=BACKOFF_SECONDS)
    parser.add_argument("--keepalive", type=float, default=KEEPALIVE_SECONDS)
    parser.add_argument(
        "--autocompact",
        type=_autocompact,
        help="Claude Code auto-compact window, 100k-1M tokens (default: the model's window)",
    )
    parser.add_argument(
        "--continue-session-from",
        metavar="RUN_ID",
        help="a stopped run whose session (in this --bridge) the newly bound run continues",
    )
    parser.add_argument(
        "--current-turn",
        choices=("auto", "on", "off"),
        default="auto",
        help="session input: auto follows the run's recorded gateway-current-turn-v1; "
        "on/off overrides it for this gateway (logged as operator_override)",
    )
    parser.add_argument(
        "--tool-schemas",
        choices=("auto", "on", "off"),
        default="auto",
        help="full tool listing in every session system prompt: auto follows the run's "
        "recorded gateway-tool-schemas-v1; on/off overrides it (logged as operator_override)",
    )
    parser.add_argument(
        "--schema-hint",
        choices=("auto", "on", "off"),
        default="auto",
        help="anyOf/oneOf re-ask lists the schema's forms: auto follows the run's recorded "
        "gateway-schema-hint-v1; on/off overrides it (logged as operator_override)",
    )
    parser.add_argument(
        "--preflight-receipt",
        type=Path,
        help="a passing gateway-preflight receipt for this gateway build and these overrides "
        "(required in session mode)",
    )
    args = parser.parse_args(argv)
    if args.run_id is None and args.game_port is None:
        parser.error("give --run-id or --game-port so pauses reach the right run")
    config = Config(
        mode=args.mode,
        model=args.model,
        effort=args.effort,
        bridge=args.bridge.resolve(),
        runs_root=args.runs_root.resolve(),
        claude=args.claude,
        claude_config_dir=args.claude_config_dir,
        served_model=args.served_model,
        context_window=args.context_window,
        max_tokens=args.max_tokens,
        run_id=args.run_id,
        game_port=args.game_port,
        backoff=args.backoff,
        keepalive=args.keepalive,
        autocompact=args.autocompact,
        continue_from=args.continue_session_from,
        current_turn=args.current_turn,
        tool_schemas=args.tool_schemas,
        schema_hint=args.schema_hint,
    )
    if config.mode == "session":
        import preflight  # noqa: PLC0415 (imports this module)

        if args.preflight_receipt is None:
            parser.error("session mode needs --preflight-receipt (run just gateway-preflight)")
        problem = preflight.receipt_problem(args.preflight_receipt, config, Path(__file__))
        if problem is not None:
            parser.error(problem)
    return config, args.port


def main(argv: Sequence[str] | None = None) -> int:
    config, port = parse_args(sys.argv[1:] if argv is None else argv)
    server = serve(Gateway(config), port)
    print(f"claude-gateway {config.mode} {config.model} http://127.0.0.1:{port}/v1", flush=True)
    server.serve_forever()
    return 0  # pragma: no cover


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
