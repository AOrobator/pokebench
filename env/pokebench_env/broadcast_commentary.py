"""`just broadcast-commentary`: one short spoken line per turn, then its voice.

Lines go to runs/broadcast/<run>/commentary.jsonl (or --out) with the wavs beside them. Nothing is
written under runs/<run>/. With --writer claude, headless Claude writes the lines for batches of
turns and may leave routine ones silent. The file is rewritten every few lines and on any stop,
so a stopped job keeps its work and the next one carries on from it. With --follow it tails a
live run instead, saying each thought as it finishes and dropping turns it can no longer say on
time.
"""

import argparse
import functools
import importlib
import io
import json
import os
import pwd
import re
import socket
import subprocess
import tempfile
import time
import urllib.request
import wave
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import asdict, dataclass, replace
from datetime import datetime
from pathlib import Path
from typing import cast
from urllib.parse import urlsplit

MAX_WORDS = 19
SAVE_EVERY = 25
TRIES = 3
STALE_TURNS = 2
POLL_S = 0.5
# A run that dies without a run_end line leaves its log silent; a live one is never quiet this long.
IDLE_END_S = 1800.0
LIVE_TIMEOUT_S = 30.0
CHUNK_BYTES = 1024 * 1024
# Words a viewer should not hear, which the model sometimes keeps despite the prompt.
JARGON = re.compile(r"\b(press(es|ed|ing)?|OHKO(s|'d)?|KO(s|'d)?|HP)\b", re.IGNORECASE)
VOICE = "af_heart"
VOICE_LANG = "en-us"
VOICE_SPEED = 1.05
BATCH = 25
CONTEXT_LINES = 4
CLAUDE_TIMEOUT_S = 600.0
ENV_ALLOW = ("HOME", "PATH", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "TERM")
ENV_ALLOW_PREFIXES = ("LC_",)
PRIVATE = (
    ("a url", re.compile(r"\b[a-z][a-z0-9+.-]*://|\bwww\.", re.IGNORECASE)),
    ("an e-mail address", re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")),
    (
        "an ip address",
        re.compile(r"\b\d{1,3}(\.\d{1,3}){3}\b|\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){3,}\b"),
    ),
    (
        "a hostname",
        re.compile(
            r"\blocalhost\b|\b[\w-]+(\.[\w-]+)*\.(com|net|org|io|ai|dev|app|local|lan|internal|"
            r"home|arpa|co|uk|us|gov|edu)\b",
            re.IGNORECASE,
        ),
    ),
    ("a file path", re.compile(r"(?<![\w/])(~|\.{1,2})?/[\w.-]+|\b[a-z]:\\\\?", re.IGNORECASE)),
    (
        "a file name",
        re.compile(r"\b[\w-]+\.(py|ts|js|json|jsonl|wav|mp4|md|sh|gba|sav|log|txt|png)\b", re.I),
    ),
)
SYSTEM = (
    "You turn a game-playing AI's private thinking into one line it says aloud to a live "
    "audience watching it play Pokemon. First person, present or near future. Under 20 words. "
    "The decision is in the last lines of the thinking: earlier parts are often ideas it dropped. "
    "Say that decision and the reason given next to it. Use only what the thinking says: add no "
    "reason, plan, outcome or fact of your own, and never say a move wins or ends something "
    "unless the thinking does. Plain spoken English: never name a button or say press; no "
    "coordinates, tool names, damage numbers or abbreviations like OHKO or HP. If the thinking "
    "only answers a game prompt, say what the answer means, such as keeping my Pokemon in or "
    "not learning a move. Reply with the line alone."
)

BATCH_SYSTEM = (
    "You voice a game-playing AI as it plays Pokemon Emerald for a live audience. You get a batch "
    "of consecutive turns. For each: `at` (time into the run), `thinking` (its private thinking, "
    "often empty), `said` (its own short note on the turn) and `did` (the action it took). Write "
    "what the AI says aloud: first person as the AI playing (I), present or near future, plain "
    "spoken English, at most 19 words. Most turns need no line. Leave routine turns empty, such as "
    "advancing dialogue, scrolling a menu, walking or surfing on, or running from a wild Pokemon, "
    "so that by the `at` times the audience hears one line every 20 to 40 seconds on average. "
    "Always give a line for key moments: a badge, a rival, gym leader, team leader, Elite Four or "
    "Champion fight, a catch, Rayquaza, the Hall of Fame. Use only what the turn data says: add no "
    "fact, reason, plan or outcome of your own. Never name a button or say press; no coordinates, "
    "map numbers, tool names, damage numbers or abbreviations like KO or HP. Do not repeat the "
    'earlier lines. Reply with only a JSON array of objects {"turn": <number>, "line": '
    '"<text, or empty>"} for turns in this batch.'
)

DENSE_SYSTEM = (
    "You voice a game-playing AI as it plays Pokemon Emerald for a live audience. You get a batch "
    "of consecutive turns. For each: `at` (time into the run), `thinking` (its private thinking, "
    "often empty), `said` (its own short note on the turn), `did` (the action it took), `seconds` "
    "(time until its next turn) and `max_words`. Write what the AI says aloud: first person as the "
    "AI playing (I), present or near future, plain spoken English. Give a line on every turn that "
    "has thinking or a meaningful action, so the audience follows along turn by turn; leave a turn "
    "empty only when it repeats the turn before it, such as advancing the same dialogue again, or "
    "when its max_words is under 3. A line has at most max_words words so it ends before the next "
    "turn. Use only what the turn data says: add no fact, reason, plan or outcome of your own. "
    "Never name a button or say press; no coordinates, map numbers, tool names, damage numbers or "
    "abbreviations like KO or HP. Do not repeat the earlier lines or the line before. Reply with "
    'only a JSON array of objects {"turn": <number>, "line": "<text, or empty>"} for turns in '
    "this batch."
)
# Kokoro bm_lewis at speed 0.95 on 67d7's 1,222 lines: seconds = 0.77 + 0.306 x words.
LINE_LEAD_S = 1.0
WORD_S = 0.31
LAST_ROOM_S = 10.0

WANTED = ("run_start", "run_end", "turn_start", "assistant")
STEP_KINDS = ("run_start", "turn_start", "assistant", "tool_call")

Json = dict[str, object]
Post = Callable[[str, Json], Json]


@dataclass(frozen=True)
class Turn:
    turn: int
    t: float
    thinking: str
    said: float | None = None


@dataclass(frozen=True)
class Line:
    turn: int
    t: float
    text: str
    wav: str
    seconds: float | None = None
    said: float | None = None


@dataclass(frozen=True)
class Voiced:
    pcm: bytes
    rate: int


class TurnReader:
    """Reads log lines in order. Each thought is timed from the start of its turn, so the line
    plays while the model thinks; `said` is when the thought finished."""

    def __init__(self) -> None:
        self.started: float | None = None
        self.turn_began: dict[int, float] = {}
        self.newest = 0
        self.ended = False

    def feed(self, line: str) -> Turn | None:
        if not any(f'"type":"{kind}"' in line[:300] for kind in WANTED):
            return None
        try:
            event = json.loads(line)
            at = datetime.fromisoformat(event["t"]).timestamp()
            kind = event.get("type")
            if kind == "run_start":
                self.started = at
                return None
            if self.started is None:
                return None
            if kind == "run_end":
                self.ended = True
                return None
            number = int(event["turn"])
        except (ValueError, KeyError, TypeError):
            return None
        self.newest = max(self.newest, number)
        if kind == "turn_start":
            self.turn_began[number] = at
            return None
        thinking = event.get("thinking")
        if not isinstance(thinking, str) or thinking.strip() == "":
            return None
        t = round(self.turn_began.get(number, at) - self.started, 2)
        return Turn(turn=number, t=t, thinking=thinking, said=round(at - self.started, 2))


def read_turns(lines: Iterable[str], start: float = 0, end: float = float("inf")) -> list[Turn]:
    reader = TurnReader()
    found = (reader.feed(line) for line in lines)
    return [turn for turn in found if turn is not None and start <= turn.t < end]


def local_endpoint(url: str) -> bool:
    """Lines come from a model on this machine; a remote endpoint would be a paid or shared one."""
    parts = urlsplit(url)
    return parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost")


def clean_line(reply: str) -> str | None:
    text = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL)
    text = " ".join(text.split()).strip("\"'“”‘’ ")
    spoken = text != "" and len(text.split()) <= MAX_WORDS and JARGON.search(text) is None
    return text if spoken else None


def ask_model(endpoint: str, model: str, post: Post, thinking: str) -> str:
    answer = post(
        f"{endpoint.rstrip('/')}/chat/completions",
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": thinking},
            ],
            "temperature": 0.4,
            "max_tokens": 200,
            "chat_template_kwargs": {"enable_thinking": False},
        },
    )
    try:
        content = cast(list[dict[str, dict[str, object]]], answer["choices"])[0]["message"][
            "content"
        ]
    except (KeyError, IndexError, TypeError):
        return ""
    return content if isinstance(content, str) else ""


def write_lines(
    turns: Sequence[Turn],
    existing: Sequence[Line],
    ask: Callable[[str], str],
    save: Callable[[list[Line]], None],
    log: Callable[[str], None],
) -> list[Line]:
    lines = list(existing)
    done = {line.turn for line in lines}
    try:
        for turn in turns:
            if turn.turn in done:
                continue
            text = next(filter(None, (clean_line(ask(turn.thinking)) for _ in range(TRIES))), None)
            if text is None:
                log(f"turn {turn.turn}: no usable line")
                continue
            lines.append(Line(turn=turn.turn, t=turn.t, text=text, wav=f"t{turn.turn:06d}.wav"))
            if len(lines) % SAVE_EVERY == 0:
                save(sorted(lines, key=lambda line: line.t))
    finally:
        lines.sort(key=lambda line: line.t)
        save(lines)
    return lines


def wav_bytes(voiced: Voiced) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(voiced.rate)
        wav.writeframes(voiced.pcm)
    return out.getvalue()


def load_lexicon(text: str) -> dict[str, str]:
    """Spoken names: `name<TAB>phonemes<TAB>respelling<TAB>source` rows; `#` lines are comments."""
    lexicon: dict[str, str] = {}
    for raw in text.splitlines():
        if raw.startswith("#"):
            continue
        cells = raw.split("\t")
        if len(cells) >= 2 and cells[0].strip() and cells[1].strip():
            lexicon[cells[0].strip()] = cells[1].strip()
    return lexicon


def to_phonemes(text: str, lexicon: dict[str, str], phonemize: Callable[[str], str]) -> str:
    """The line's phonemes: listed names from the lexicon, everything else from espeak."""
    if not lexicon:
        return phonemize(text)
    names = "|".join(re.escape(name) for name in sorted(lexicon, key=len, reverse=True))
    pattern = re.compile(rf"(?<![\w'])({names})('s)?(?!\w)")
    parts: list[str] = []
    last = 0
    for match in pattern.finditer(text):
        parts.append(phonemize(text[last : match.start()]))
        parts.append(lexicon[match[1]] + ("z" if match[2] else ""))
        last = match.end()
    parts.append(phonemize(text[last:]))
    return " ".join(part for part in parts if part)


def voice_lines(
    lines: Sequence[Line],
    synth: Callable[[str], Voiced],
    write: Callable[[str, bytes], None],
    save: Callable[[list[Line]], None],
) -> list[Line]:
    out = list(lines)
    try:
        for index, line in enumerate(out):
            if line.seconds is not None:
                continue
            voiced = synth(line.text)
            write(line.wav, wav_bytes(voiced))
            out[index] = replace(line, seconds=round(len(voiced.pcm) / 2 / voiced.rate, 3))
            if index % SAVE_EVERY == 0:
                save(out)
    finally:
        save(out)
    return out


class LogTail:
    """Finished lines from a file still being written; a partial last line waits for its end."""

    def __init__(self, read: Callable[[int, int], bytes], chunk: int = CHUNK_BYTES) -> None:
        self.read = read
        self.chunk = chunk
        self.offset = 0
        self.rest = b""

    def lines(self) -> Iterator[str]:
        while True:
            data = self.read(self.offset, self.chunk)
            if data == b"":
                return
            self.offset += len(data)
            *whole, self.rest = (self.rest + data).split(b"\n")
            for line in whole:
                yield line.decode("utf-8", "replace")


@dataclass(frozen=True)
class Follow:
    read: Callable[[int, int], bytes]
    ask: Callable[[str], str]
    synth: Callable[[str], Voiced]
    write_wav: Callable[[str, bytes], None]
    save: Callable[[list[Line]], None]
    wait: Callable[[float], None]
    now: Callable[[], float]
    log: Callable[[str], None]


def say_turn(turn: Turn, deps: Follow) -> Line | None:
    """The wav lands before its line can, so a reader of the file never meets a missing sound."""
    try:
        text = next(filter(None, (clean_line(deps.ask(turn.thinking)) for _ in range(TRIES))), None)
        if text is None:
            deps.log(f"turn {turn.turn}: no usable line")
            return None
        voiced = deps.synth(text)
        wav = f"t{turn.turn:06d}.wav"
        deps.write_wav(wav, wav_bytes(voiced))
    except Exception as error:  # one bad turn must never end the follower
        deps.log(f"turn {turn.turn}: skipped: {error}")
        return None
    seconds = round(len(voiced.pcm) / 2 / voiced.rate, 3)
    return Line(turn.turn, turn.t, text, wav, seconds, turn.said)


def follow(deps: Follow, existing: Sequence[Line]) -> list[Line]:
    lines = list(existing)
    done = {line.turn for line in lines}
    reader = TurnReader()
    tail = LogTail(deps.read)
    waiting: list[Turn] = []
    heard = deps.now()
    unsaved = False
    while True:
        for raw in tail.lines():
            heard = deps.now()
            turn = reader.feed(raw)
            if turn is not None and turn.turn not in done:
                done.add(turn.turn)
                waiting.append(turn)
        current = [turn for turn in waiting if turn.turn >= reader.newest - STALE_TURNS]
        if len(current) < len(waiting):
            deps.log(f"dropped {len(waiting) - len(current)} stale turns")
        waiting = current
        if waiting:
            line = say_turn(waiting.pop(0), deps)
            if line is not None:
                lines.append(line)
                # A restart can recover turns older than ones already saved.
                lines.sort(key=lambda saved: saved.t)
                unsaved = True
            if unsaved:
                try:
                    deps.save(lines)
                    unsaved = False
                except OSError as error:
                    deps.log(f"lines not saved yet: {error}")
        elif reader.ended or deps.now() - heard >= IDLE_END_S:
            deps.log("run ended" if reader.ended else "run log silent, stopping")
            if unsaved:
                deps.save(lines)
            return lines
        else:
            deps.wait(POLL_S)


# ---------------------------------------------------------------- Claude-written lines


@dataclass(frozen=True)
class Step:
    """One assistant turn as Claude sees it: the thinking, the model's own note and its actions."""

    turn: int
    t: float
    thinking: str
    text: str
    tools: tuple[str, ...] = ()


def tool_summary(name: str, args: object) -> str:
    if args is None:
        return name
    return f"{name} {json.dumps(args, separators=(',', ':'), ensure_ascii=False)}"


def read_steps(lines: Iterable[str], start: float = 0, end: float = float("inf")) -> list[Step]:
    started: float | None = None
    began: dict[int, float] = {}
    steps: dict[int, Step] = {}
    for line in lines:
        if not any(f'"type":"{kind}"' in line[:300] for kind in STEP_KINDS):
            continue
        try:
            event = json.loads(line)
            at = datetime.fromisoformat(event["t"]).timestamp()
            kind = event["type"]
            if kind == "run_start":
                started = at
                continue
            number = int(event["turn"])
        except (ValueError, KeyError, TypeError):
            continue
        if started is None:
            continue
        if kind == "turn_start":
            began[number] = at
        elif kind == "assistant":
            thinking, text = event.get("thinking"), event.get("text")
            steps[number] = Step(
                turn=number,
                t=round(began.get(number, at) - started, 2),
                thinking=thinking if isinstance(thinking, str) else "",
                text=text if isinstance(text, str) else "",
            )
        elif number in steps:
            name = event.get("name")
            call = tool_summary(name if isinstance(name, str) else "?", event.get("args"))
            steps[number] = replace(steps[number], tools=(*steps[number].tools, call))
    return [step for step in steps.values() if start <= step.t < end]


GatewayCall = tuple[int, str, str]


def _json_candidates(text: str) -> Iterator[object]:
    """The session gateway's reading of a reply: the whole text, unfenced, or each object in it."""
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.S)
    if fenced:
        stripped = fenced[1]
    try:
        yield json.loads(stripped)
        return
    except ValueError:
        pass
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", stripped):
        try:
            value, _ = decoder.raw_decode(stripped, match.start())
        except ValueError:
            continue
        yield value


def _reply_text(result: str) -> str | None:
    """The `text` the gateway put on the assistant event, or None when it found no reply."""
    for candidate in _json_candidates(result):
        if isinstance(candidate, dict) and "name" in candidate:
            note = candidate.get("text", "")
            return note if isinstance(note, str) else json.dumps(note)
    return None


def _record_reply(record: str) -> tuple[str, str] | None:
    """A gateway call record's reply text and its thinking, or None without a reply object."""
    thinking: list[str] = []
    text: str | None = None
    for raw in record.splitlines():
        try:
            event = json.loads(raw)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        if event.get("type") == "assistant":
            content = event.get("message", {}).get("content")
            for block in content if isinstance(content, list) else []:
                if isinstance(block, dict) and block.get("type") == "thinking":
                    part = block.get("thinking")
                    thinking.append(part if isinstance(part, str) else "")
        elif event.get("type") == "result":
            result = event.get("result")
            text = _reply_text(result) if isinstance(result, str) else None
    return None if text is None else (text, "".join(thinking))


def gateway_calls(log: str, read: Callable[[str], str | None]) -> list[GatewayCall]:
    """Each request's reply text and thinking from a session gateway's bridge; a request tried
    more than once keeps its last reply."""
    calls: dict[int, GatewayCall] = {}
    for raw in log.splitlines():
        try:
            call = json.loads(raw)
            request, name = call["request"], call["record"]
        except (ValueError, KeyError, TypeError):
            continue
        if type(request) is not int or not isinstance(name, str) or Path(name).name != name:
            continue
        record = read(name)
        reply = None if record is None else _record_reply(record)
        if reply is not None:
            calls[request] = (request, *reply)
    return list(calls.values())


def join_thinking(
    steps: Sequence[Step], calls: Iterable[GatewayCall]
) -> tuple[list[Step], int, int]:
    """A step takes a call's thinking only when the call's request is the turn and its reply
    text is the step's text, so a renumbered or retried request never lends the wrong thought."""
    found = {request: (text, thinking) for request, text, thinking in calls}
    out: list[Step] = []
    matched = mismatched = 0
    for step in steps:
        call = found.get(step.turn)
        if step.thinking == "" and call is not None:
            if call[0] == step.text:
                matched += call[1] != ""
                step = replace(step, thinking=call[1])
            else:
                mismatched += 1
        out.append(step)
    return out, matched, mismatched


# PRIVATE finds a URL or path by its start. Its end cannot be told (spaces, quotes, parentheses),
# so blanking runs from its start to the end of its line.
WHOLE = {
    "a url": re.compile(r"\b[a-z][a-z0-9+.-]*://[^\n]*|\bwww\.[^\n]*", re.IGNORECASE),
    "a file path": re.compile(
        r"(?<![\w/])(~|\.{1,2})?/[\w.-]+[^\n]*|\b[a-z]:\\[^\n]*", re.IGNORECASE
    ),
}


def scrub_private(text: str, names: Sequence[str]) -> str:
    """The text with every private span the lines are refused for blanked to an ellipsis."""
    for reason, found in PRIVATE:
        pattern = WHOLE.get(reason, found)
        text = pattern.sub("…", text)
    for name in names:
        if name:
            text = re.sub(rf"\b{re.escape(name)}\b", "…", text, flags=re.IGNORECASE)
    return text


def thinking_rows(steps: Sequence[Step], names: Sequence[str]) -> list[dict[str, object]]:
    """thinking.jsonl for /broadcast: each turn's thinking, scrubbed."""
    return [
        {"turn": step.turn, "thinking": scrub_private(step.thinking, names)}
        for step in steps
        if step.thinking != ""
    ]


def cost_rows(log: str) -> list[dict[str, object]]:
    """cost.jsonl for /broadcast: the running dollar total after each request's last try."""
    totals: dict[int, float] = {}
    for raw in log.splitlines():
        try:
            call = json.loads(raw)
            request, total = call["request"], call["session_cost_total_usd"]
        except (ValueError, KeyError, TypeError):
            continue
        if type(request) is not int or type(total) not in (int, float):
            continue
        totals[request] = float(total)
    return [{"turn": turn, "usd": totals[turn]} for turn in sorted(totals)]


def clock(seconds: float) -> str:
    whole = int(seconds)
    return f"{whole // 3600}:{whole // 60 % 60:02d}:{whole % 60:02d}"


def word_budget(seconds: float) -> int:
    """Words a line can have and still end before the next turn begins."""
    return max(0, min(MAX_WORDS, int((seconds - LINE_LEAD_S) / WORD_S)))


def turn_rooms(steps: Sequence[Step]) -> dict[int, float]:
    """Seconds from each turn to the next; the run's last turn gets a default."""
    ordered = sorted(steps, key=lambda step: step.t)
    rooms = {a.turn: round(b.t - a.t, 2) for a, b in zip(ordered, ordered[1:], strict=False)}
    if ordered:
        rooms[ordered[-1].turn] = LAST_ROOM_S
    return rooms


def _turn_entry(step: Step, rooms: dict[int, float] | None) -> Json:
    entry: Json = {
        "turn": step.turn,
        "at": clock(step.t),
        "thinking": step.thinking,
        "said": step.text,
        "did": list(step.tools),
    }
    if rooms is not None:
        room = rooms.get(step.turn, LAST_ROOM_S)
        entry["seconds"] = room
        entry["max_words"] = word_budget(room)
    return entry


def batch_prompt(
    steps: Sequence[Step], earlier: Sequence[str], rooms: dict[int, float] | None = None
) -> str:
    said = "\n".join(f"- {line}" for line in earlier) or "(none)"
    turns = [_turn_entry(step, rooms) for step in steps]
    return (
        f"Earlier lines, already spoken:\n{said}\n\nTurns:\n"
        f"{json.dumps(turns, ensure_ascii=False)}\n\n"
        "Reply with only the JSON array."
    )


def parse_batch(reply: str, turns: set[int]) -> dict[int, str] | None:
    """The batch's lines by turn, or None when the reply must be asked for again."""
    begin, finish = reply.find("["), reply.rfind("]")
    try:
        items = json.loads(reply[begin : finish + 1]) if begin >= 0 else None
    except ValueError:
        return None
    if not isinstance(items, list):
        return None
    out: dict[int, str] = {}
    for item in items:
        if not isinstance(item, dict):
            return None
        turn, line = item.get("turn"), item.get("line")
        if type(turn) is not int or turn not in turns or turn in out or not isinstance(line, str):
            return None
        out[turn] = line
    return out


def private_reason(line: str, names: Sequence[str]) -> str | None:
    for reason, pattern in PRIVATE:
        if pattern.search(line):
            return reason
    for name in names:
        if name and re.search(rf"\b{re.escape(name)}\b", line, re.IGNORECASE):
            return "the operator's name"
    return None


@dataclass(frozen=True)
class ClaudeReply:
    text: str
    cost: float
    error: str | None = None


@dataclass(frozen=True)
class Batch:
    first: int
    last: int
    turns: int
    lines: int
    tries: int
    cost_usd: float
    ok: bool
    covered: list[int]
    dense: bool = False


@dataclass(frozen=True)
class Done:
    lines: list[Line]
    calls: int
    cost: float
    retries: int
    refused: int
    failed: int

    @property
    def complete(self) -> bool:
        return self.failed == 0


def covered_turns(log: str) -> set[int]:
    """Turns a finished batch already judged, said or silent; a failed batch is asked again."""
    covered: set[int] = set()
    for raw in log.splitlines():
        try:
            record = json.loads(raw)
            if record["ok"] is True:
                covered.update(int(turn) for turn in record["covered"])
        except (ValueError, KeyError, TypeError):
            continue
    return covered


def resume_mode_problem(log: str, dense: bool) -> str | None:
    """Why a folder's earlier batches cannot be resumed in this mode, or None."""
    for raw in log.splitlines():
        try:
            record = json.loads(raw)
        except ValueError:
            continue
        if isinstance(record, dict) and record.get("ok") is True:
            if (record.get("dense") is True) != dense:
                written = "with" if record.get("dense") is True else "without"
                return f"this folder's lines were written {written} --dense: use a new --out"
    return None


def write_claude_lines(
    steps: Sequence[Step],
    existing: Sequence[Line],
    covered: set[int],
    ask: Callable[[str], ClaudeReply],
    save: Callable[[list[Line]], None],
    record: Callable[[Batch], None],
    log: Callable[[str], None],
    names: Sequence[str],
    size: int = BATCH,
    dense: bool = False,
) -> Done:
    rooms = turn_rooms(steps) if dense else None
    lines = sorted(existing, key=lambda line: line.t)
    done = {line.turn for line in lines} | covered
    todo = [step for step in steps if step.turn not in done]
    calls = retries = refused = failed = 0
    cost = 0.0
    try:
        for index in range(0, len(todo), size):
            batch = todo[index : index + size]
            first = batch[0]
            earlier = [line.text for line in lines if line.t < first.t][-CONTEXT_LINES:]
            prompt = batch_prompt(batch, earlier, rooms)
            wanted = {step.turn for step in batch}
            got: dict[int, str] | None = None
            spent = 0.0
            errors: list[str] = []
            tries = 0
            while got is None and tries < TRIES:
                tries += 1
                answer = ask(prompt)
                spent += answer.cost
                if answer.error is not None:
                    errors.append(answer.error)
                    log(f"turns {first.turn}-{batch[-1].turn}: claude failed: {answer.error}")
                    continue
                got = parse_batch(answer.text, wanted)
                if got is None:
                    log(f"turns {first.turn}-{batch[-1].turn}: unusable reply, asking again")
            calls += tries
            retries += tries - 1
            cost += spent
            if got is None and len(errors) == TRIES:
                raise RuntimeError(f"claude failed {TRIES} times: {errors[-1]}")
            kept = 0
            for step in batch:
                text = (got or {}).get(step.turn, "")
                if text.strip() == "":
                    continue
                spoken = clean_line(text)
                reason = "too long or jargon" if spoken is None else private_reason(spoken, names)
                if spoken is None or reason is not None:
                    refused += 1
                    log(f"turn {step.turn}: refused ({reason}): {text!r}")
                    continue
                lines.append(Line(step.turn, step.t, spoken, f"t{step.turn:06d}.wav"))
                kept += 1
            if got is None:
                failed += 1
                log(f"turns {first.turn}-{batch[-1].turn}: no usable reply, skipped")
            lines.sort(key=lambda line: line.t)
            save(lines)
            record(
                Batch(
                    first=first.turn,
                    last=batch[-1].turn,
                    turns=len(batch),
                    lines=kept,
                    tries=tries,
                    cost_usd=round(spent, 6),
                    ok=got is not None,
                    covered=sorted(wanted),
                    dense=dense,
                )
            )
    finally:
        save(lines)
    return Done(lines, calls, round(cost, 6), retries, refused, failed)


def claude_argv(claude: str, model: str, dense: bool = False) -> list[str]:
    return [
        claude,
        "-p",
        "--model",
        model,
        "--output-format",
        "json",
        "--system-prompt",
        DENSE_SYSTEM if dense else BATCH_SYSTEM,
        "--tools",
        "",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--setting-sources",
        "",
        "--disable-slash-commands",
    ]


def claude_env(source: dict[str, str], config_dir: str | None) -> dict[str, str]:
    env = {k: v for k, v in source.items() if k in ENV_ALLOW or k.startswith(ENV_ALLOW_PREFIXES)}
    if config_dir is not None:
        env["CLAUDE_CONFIG_DIR"] = config_dir
    return env


def parse_claude(stdout: str, stderr: str, code: int) -> ClaudeReply:
    try:
        result = json.loads(stdout)
    except ValueError:
        result = None
    if not isinstance(result, dict):
        tail = (stderr.strip() or stdout.strip())[-500:]
        return ClaudeReply("", 0.0, f"claude exited {code}: {tail}")
    cost = result.get("total_cost_usd")
    spent = float(cost) if isinstance(cost, int | float) else 0.0
    text = result.get("result")
    body = text if isinstance(text, str) else ""
    if result.get("is_error") is True:
        return ClaudeReply("", spent, body or f"claude exited {code}")
    if code != 0:
        return ClaudeReply("", spent, f"claude exited {code}: {stderr.strip()[-500:]}")
    return ClaudeReply(body, spent)


Runner = Callable[[list[str], str, str, dict[str, str]], tuple[str, str, int]]


def run_claude(
    runner: Runner, argv: list[str], cwd: str, env: dict[str, str], prompt: str
) -> ClaudeReply:
    try:
        stdout, stderr, code = runner(argv, prompt, cwd, env)
    except (OSError, TimeoutError, subprocess.SubprocessError) as error:
        return ClaudeReply("", 0.0, str(error))
    return parse_claude(stdout, stderr, code)


@dataclass(frozen=True)
class Options:
    run: str
    start: float = 0.0
    end: float = float("inf")
    writer: str = "local"
    endpoint: str | None = None
    model: str | None = None
    claude_model: str | None = None
    claude: str = "claude"
    claude_config_dir: str | None = None
    thinking_from: Path | None = None
    side_only: bool = False
    dense: bool = False
    follow: bool = False
    lines_only: bool = False
    voice_only: bool = False
    lexicon: Path | None = None
    voice: str = VOICE
    lang: str = VOICE_LANG
    speed: float = VOICE_SPEED
    out: Path | None = None
    runs: Path = Path("runs")
    kokoro: Path = Path("~/.cache/pokebench/kokoro")


def options_problem(options: Options) -> str | None:
    writing = not options.voice_only and not options.side_only
    if Path(options.run).name != options.run:
        return "run must be a run id"
    if options.writer not in ("local", "claude"):
        return "--writer must be local or claude"
    if not 0 < options.speed <= 4:
        return "--speed must be above 0 and at most 4"
    if options.lines_only and options.voice_only:
        return "--lines-only and --voice-only exclude each other"
    if options.lexicon is not None and options.lines_only:
        return "--lexicon is for voicing; --lines-only makes no voice"
    if options.dense and options.writer != "claude":
        return "--dense needs --writer claude"
    if options.side_only and options.thinking_from is None:
        return "--side-only needs --thinking-from"
    if options.side_only and (options.start != 0.0 or options.end != float("inf")):
        return "--side-only covers the whole run"
    if options.side_only and (options.lines_only or options.voice_only or options.follow):
        return "--side-only writes only the side files"
    if options.follow and (options.start != 0.0 or options.end != float("inf")):
        return "--follow takes no time range"
    if options.follow and (options.writer == "claude" or options.lines_only or options.voice_only):
        return "--follow uses the local writer and voices each line itself"
    if writing and options.writer == "local":
        if options.endpoint is None or not local_endpoint(options.endpoint):
            return "--endpoint must be a loopback http address"
    if writing and options.writer == "claude" and not options.claude_model:
        return "--writer claude needs --claude-model"
    return None


def build_parser() -> argparse.ArgumentParser:  # pragma: no cover - argparse reads gettext files
    parser = argparse.ArgumentParser(prog="just broadcast-commentary")
    parser.add_argument("run")
    parser.add_argument("start", nargs="?", type=float, default=0.0)
    parser.add_argument("end", nargs="?", type=float, default=float("inf"))
    parser.add_argument("--writer", choices=("local", "claude"), default="local")
    parser.add_argument("--endpoint", help="the local writer's OpenAI-style /v1 loopback address")
    parser.add_argument("--model", help="local writer; default: the endpoint's first model")
    parser.add_argument("--claude-model", help="claude writer: a model id `claude --model` takes")
    parser.add_argument("--claude", default="claude", help="the claude CLI")
    parser.add_argument(
        "--claude-config-dir",
        default=os.environ.get("CLAUDE_CONFIG_DIR"),
        help="the claude login to use (CLAUDE_CONFIG_DIR)",
    )
    parser.add_argument(
        "--thinking-from",
        type=Path,
        help="claude writer: a session gateway's --bridge folder holding the run's thinking",
    )
    parser.add_argument(
        "--dense",
        action="store_true",
        help="claude writer: a line on nearly every turn, sized to the time until the next",
    )
    parser.add_argument(
        "--side-only",
        action="store_true",
        help="write thinking.jsonl and cost.jsonl for /broadcast from --thinking-from, only",
    )
    parser.add_argument("--follow", action="store_true", help="tail a live run until it ends")
    parser.add_argument("--lines-only", action="store_true", help="write lines, make no voice")
    parser.add_argument("--voice-only", action="store_true", help="voice the lines on file")
    parser.add_argument("--voice", default=VOICE)
    parser.add_argument("--lang", default=VOICE_LANG)
    parser.add_argument("--speed", type=float, default=VOICE_SPEED)
    parser.add_argument("--out", type=Path, help="default: <runs>/broadcast/<run>")
    parser.add_argument("--runs", type=Path, default=Path("runs"))
    parser.add_argument(
        "--lexicon",
        type=Path,
        help="voicing: a TSV of names and the phonemes to speak them with",
    )
    parser.add_argument(
        "--kokoro",
        type=Path,
        default=Path(os.environ.get("KOKORO_MODELS", "~/.cache/pokebench/kokoro")).expanduser(),
    )
    return parser


def private_names() -> list[str]:  # pragma: no cover - the account database
    """The login, the words of its full name and this machine's name, so no line says them."""
    user = pwd.getpwuid(os.getuid())
    host = socket.gethostname()
    words = [word for word in user.pw_gecos.split() if len(word) > 2]
    return [user.pw_name, *words, host, host.split(".")[0]]


def _subprocess_runner(  # pragma: no cover - a process
    argv: list[str], stdin: str, cwd: str, env: dict[str, str]
) -> tuple[str, str, int]:
    try:
        done = subprocess.run(  # noqa: S603 - argv list
            argv,
            input=stdin,
            capture_output=True,
            text=True,
            cwd=cwd,
            env=env,
            timeout=CLAUDE_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise TimeoutError(f"timed out after {CLAUDE_TIMEOUT_S:.0f}s") from error
    return done.stdout, done.stderr, done.returncode


def load_lines(text: str) -> list[Line]:
    lines: list[Line] = []
    for raw in text.splitlines():
        try:
            lines.append(Line(**json.loads(raw)))
        except (ValueError, TypeError):
            continue
    return lines


def dump_lines(lines: Sequence[Line]) -> str:  # pragma: no cover - the disk
    return "".join(json.dumps(asdict(line)) + "\n" for line in lines)


def _post(url: str, body: Json, timeout: float = 300) -> Json:  # pragma: no cover - the network
    request = urllib.request.Request(  # noqa: S310 - local_endpoint
        url, json.dumps(body).encode(), {"content-type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - local_endpoint
        return cast(Json, json.load(response))


def _served_model(endpoint: str) -> str:  # pragma: no cover - the network
    url = f"{endpoint.rstrip('/')}/models"
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 - local_endpoint
        return str(json.load(response)["data"][0]["id"])


def _read_at(path: Path, offset: int, length: int) -> bytes:  # pragma: no cover - the disk
    with path.open("rb") as log:
        log.seek(offset)
        return log.read(length)


def _read_text(path: Path) -> str | None:  # pragma: no cover - the disk
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def _log_lines(path: Path) -> Iterator[str]:  # pragma: no cover - the disk
    with path.open(encoding="utf-8") as lines:
        yield from lines


def _synth(  # pragma: no cover - the voice model
    models: Path,
    voice: str = VOICE,
    lang: str = VOICE_LANG,
    speed: float = VOICE_SPEED,
    lexicon: dict[str, str] | None = None,
) -> Callable[[str], Voiced]:
    kokoro = importlib.import_module("kokoro_onnx").Kokoro(
        str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin")
    )
    numpy = importlib.import_module("numpy")

    def speak(text: str) -> Voiced:
        if lexicon:
            phonemes = to_phonemes(
                text, lexicon, lambda part: kokoro.tokenizer.phonemize(part, lang)
            )
            audio, rate = kokoro.create(
                phonemes, voice=voice, speed=speed, lang=lang, is_phonemes=True
            )
        else:
            audio, rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
        pcm = (numpy.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        return Voiced(pcm=pcm, rate=int(rate))

    return speak


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - entrypoint
    parser = build_parser()
    args = Options(**vars(parser.parse_args(argv)))
    problem = options_problem(args)
    if problem is not None:
        parser.error(problem)
    # options_problem has made sure the writer in use has these.
    endpoint, claude_model = args.endpoint or "", args.claude_model or ""
    folder = args.out or args.runs / "broadcast" / args.run
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "commentary.jsonl"

    def save(lines: list[Line]) -> None:
        scratch = target.with_suffix(".tmp")
        scratch.write_text(dump_lines(lines), encoding="utf-8")
        scratch.replace(target)

    def write_wav(name: str, data: bytes) -> None:
        (folder / name).write_bytes(data)

    def synth() -> Callable[[str], Voiced]:
        lexicon = load_lexicon(args.lexicon.read_text(encoding="utf-8")) if args.lexicon else None
        return _synth(args.kokoro, args.voice, args.lang, args.speed, lexicon)

    log_path = args.runs / args.run / "events.jsonl"
    if args.side_only and args.thinking_from is not None:
        source: Path = args.thinking_from
        steps, matched, _ = join_thinking(
            read_steps(_log_lines(log_path)),
            gateway_calls(
                (source / "calls.jsonl").read_text(encoding="utf-8"),
                lambda name: _read_text(source / "calls" / name),
            ),
        )
        costs = cost_rows((source / "calls.jsonl").read_text(encoding="utf-8"))
        for name, rows in (
            ("thinking.jsonl", thinking_rows(steps, private_names())),
            ("cost.jsonl", costs),
        ):
            scratch = folder / f"{name}.tmp"
            scratch.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
            scratch.replace(folder / name)
        last = f"${costs[-1]['usd']:.2f}" if costs else "none"
        print(f"{matched} turns of thinking, {len(costs)} costs (last {last}) in {folder}")
        return 0
    existing = load_lines(target.read_text(encoding="utf-8")) if target.exists() else []
    if args.follow:
        model = args.model or _served_model(endpoint)
        post = functools.partial(_post, timeout=LIVE_TIMEOUT_S)
        lines = follow(
            Follow(
                read=functools.partial(_read_at, log_path),
                ask=lambda thinking: ask_model(endpoint, model, post, thinking),
                synth=synth(),
                write_wav=write_wav,
                save=save,
                wait=time.sleep,
                now=time.monotonic,
                log=functools.partial(print, flush=True),
            ),
            existing,
        )
        print(f"{len(lines)} lines in {target}")
        return 0
    lines = existing
    complete = True
    if not args.voice_only and args.writer == "claude":
        batches = folder / "claude-batches.jsonl"
        log = batches.read_text(encoding="utf-8") if batches.exists() else ""
        mode = resume_mode_problem(log, args.dense)
        if mode is not None:
            parser.error(mode)
        covered = covered_turns(log)

        def record(batch: Batch) -> None:
            with batches.open("a", encoding="utf-8") as out:
                out.write(json.dumps(asdict(batch)) + "\n")

        argv_ = claude_argv(args.claude, claude_model, args.dense)
        env = claude_env(dict(os.environ), args.claude_config_dir)
        steps = read_steps(_log_lines(log_path), args.start, args.end)
        if args.thinking_from is not None:
            bridge: Path = args.thinking_from
            calls = gateway_calls(
                (bridge / "calls.jsonl").read_text(encoding="utf-8"),
                lambda name: _read_text(bridge / "calls" / name),
            )
            steps, matched, mismatched = join_thinking(steps, calls)
            print(
                f"thinking: {matched} turns joined, {mismatched} replies did not match", flush=True
            )
        print(f"{len(steps)} turns", flush=True)
        with tempfile.TemporaryDirectory(prefix="broadcast-claude-") as empty:
            done = write_claude_lines(
                steps,
                existing,
                covered,
                lambda prompt: run_claude(_subprocess_runner, argv_, empty, env, prompt),
                save,
                record,
                functools.partial(print, flush=True),
                private_names(),
                dense=args.dense,
            )
        lines = done.lines
        complete = done.complete
        print(
            f"claude: {done.calls} calls, ${done.cost:.4f}, {done.retries} retries, "
            f"{done.refused} lines refused, {done.failed} batches skipped",
            flush=True,
        )
    elif not args.voice_only:
        model = args.model or _served_model(endpoint)
        turns = read_turns(_log_lines(log_path), args.start, args.end)
        lines = write_lines(
            turns,
            existing,
            lambda thinking: ask_model(endpoint, model, _post, thinking),
            save,
            print,
        )
    if not args.lines_only:
        lines = voice_lines(lines, synth(), write_wav, save)
    print(f"{len(lines)} lines in {target}")
    if not complete:
        print("some batches were skipped: run again to retry them", flush=True)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
