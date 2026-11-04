"""The gateway against a fake `claude` executable, over real HTTP where it matters."""

import base64
import functools
import json
from pathlib import Path

import pytest

import claude_gateway as cg
import preflight


@pytest.fixture(autouse=True)
def cleared_preflight(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Argument tests run as if a passing receipt exists; enforcement has its own tests."""
    if "enforce_preflight" not in request.keywords:
        monkeypatch.setattr(preflight, "receipt_problem", lambda *a: None)


PNG = b"\x89PNG fake screen"
PRESS = {
    "type": "function",
    "function": {
        "name": "press",
        "description": "Press buttons.",
        "parameters": {
            "type": "object",
            "required": ["buttons"],
            "properties": {
                "buttons": {
                    "type": "array",
                    "items": {"enum": ["A", "B", "UP"]},
                    "minItems": 1,
                    "maxItems": 8,
                },
                "walking": {"type": "boolean"},
            },
        },
    },
}
OBSERVE = {"type": "function", "function": {"name": "observe", "parameters": {"type": "object"}}}


def image(data: bytes = PNG) -> dict[str, object]:
    url = "data:image/png;base64," + base64.b64encode(data).decode()
    return {"type": "image_url", "image_url": {"url": url}}


def request(turn: int, tools: list[object] | None = None) -> bytes:
    messages = [
        {"role": "system", "content": "You play Emerald."},
        {"role": "user", "content": [{"type": "text", "text": "Start."}, image()]},
        {
            "role": "assistant",
            "content": f"turn {turn - 1}",
            "tool_calls": [
                {"id": "c1", "type": "function", "function": {"name": "observe", "arguments": "{}"}}
            ],
        },
        {"role": "tool", "tool_call_id": "c1", "content": f"result {turn}"},
        {"role": "user", "content": [{"type": "text", "text": "Screens:"}, image(b"jpg")]},
    ]
    body = {"model": "x", "messages": messages, "tools": tools or [PRESS, OBSERVE], "stream": True}
    return json.dumps(body).encode()


@pytest.mark.parametrize(
    ("value", "schema", "error"),
    [
        (1, {"type": "integer", "minimum": 2}, "at least 2"),
        (9, {"type": "number", "maximum": 2}, "at most 2"),
        (True, {"type": "integer"}, "must be integer"),
        (True, {"type": "number"}, "must be number"),
        ("x", {"type": "boolean"}, "must be boolean"),
        (3, {"type": "string"}, "must be string"),
        ({}, {"type": "array"}, "must be array"),
        ([], {"type": "object"}, "must be object"),
        (1, {"type": "null"}, "must be null"),
        (1, {"type": ["string", "null"]}, "one of"),
        (2, {"const": 1}, "must be 1"),
        ("", {"minLength": 1}, "at least 1 characters"),
        ("abc", {"maxLength": 2}, "at most 2 characters"),
        ([1, 2, 3], {"items": [{"type": "integer"}], "additionalItems": False}, "too many"),
        ([1, "a"], {"items": [{}, {"type": "integer"}]}, "[1] must be integer"),
        ({"x": 1}, {"properties": {}, "additionalProperties": False}, "not a parameter"),
        ({}, {"required": ["x"]}, ".x is required"),
    ],
)
def test_schema_errors(value: object, schema: dict[str, object], error: str) -> None:
    errors = cg.schema_errors(value, schema)
    assert errors and error in errors[0]


def test_schema_accepts_valid_values() -> None:
    schema = {
        "type": "object",
        "properties": {"map_id": {"type": "array", "items": [{"type": "integer"}] * 2}},
    }
    assert cg.schema_errors({"map_id": [1, 2], "x": 3}, schema) == []
    assert cg.schema_errors(None, {"type": ["null"]}) == []
    assert cg.schema_errors("x", {"type": "custom"}) == []


def test_parse_reply_edge_cases() -> None:
    tools = cg.parse_request(request(1)).tools
    observed = cg.parse_reply('noise {"x": 1} then {"name": "observe", "text": 7} {', tools)
    assert observed == cg.Reply("observe", {}, "7")
    with pytest.raises(cg.GatewayError, match="name must be one of"):
        cg.parse_reply('{"name": "run", "arguments": {}}', tools)
    with pytest.raises(cg.GatewayError, match="arguments must be an object"):
        cg.parse_reply('{"name": "observe", "arguments": []}', tools)


@pytest.mark.parametrize(
    ("body", "error"),
    [
        ({"messages": [], "tools": []}, "no tools"),
        ({"messages": {}}, "messages must be a list"),
        ({"messages": [1]}, "must be an object"),
        ({"messages": [{"role": 1}], "tools": [OBSERVE]}, "role must be a string"),
        ({"messages": [{"role": "user", "content": [{"type": "audio"}]}]}, "unsupported type"),
        (
            {"messages": [{"role": "user", "content": [image()], "tool_call_id": 3}]},
            "tool_call_id must be a string",
        ),
        (
            {
                "messages": [
                    {"role": "user", "content": [{"type": "image_url", "image_url": {"url": "x"}}]}
                ]
            },
            "not a base64 data URL",
        ),
    ],
)
def test_parse_request_rejects(body: dict[str, object], error: str) -> None:
    with pytest.raises(cg.GatewayError, match=error):
        cg.parse_request(json.dumps(body).encode())


def test_parse_request_accepts_plain_text_parts_and_bare_tools() -> None:
    body = {
        "messages": [
            {"role": "user", "content": None},
            {"role": "user", "content": [{"text": "bare"}]},
        ],
        "tools": [{"name": "observe"}],
    }
    parsed = cg.parse_request(json.dumps(body).encode())
    assert parsed.messages[0].parts == () and parsed.messages[1].parts[0].text == "bare"
    assert parsed.tools[0].parameters == {"type": "object"} and parsed.system == ""


def test_parse_stream_without_result_is_a_wait() -> None:
    result = cg.parse_stream("", "boom", 2, 7)
    assert result.provider_wait and result.error == "claude exited 2: boom"
    odd = json.dumps({"type": "result", "is_error": False, "usage": None, "result": None})
    parsed = cg.parse_stream(odd, "", 0, 1)
    assert parsed.text == "" and parsed.usage == cg.Usage() and parsed.models == ()


def test_wait_kind_labels() -> None:
    assert cg.wait_kind("Failed to authenticate: OAuth session expired") == "auth"
    assert cg.wait_kind("You've hit your limit") == "usage_limit"
    assert cg.wait_kind(None) == "provider"


@pytest.mark.parametrize(
    ("value", "schema", "error"),
    [
        (
            {"kind": "bogus"},
            {
                "anyOf": [
                    {"properties": {"kind": {"const": "a"}}},
                    {"properties": {"kind": {"const": "b"}}},
                ]
            },
            "0 of the anyOf",
        ),
        (1, {"oneOf": [{"type": "integer"}, {"type": "number"}]}, "2 of the oneOf"),
        (5, {"allOf": [{"maximum": 3}]}, "at most 3"),
        ("ab", {"pattern": "^[0-9]+$"}, "must match"),
        ([1, 1], {"uniqueItems": True}, "must not repeat"),
        (
            {"x1": "a"},
            {"patternProperties": {"^x": {"type": "integer"}}, "additionalProperties": False},
            ".x1 must be integer",
        ),
    ],
)
def test_schema_combinators(value: object, schema: dict[str, object], error: str) -> None:
    errors = cg.schema_errors(value, schema)
    assert errors and error in errors[0]


def test_schema_combinators_accept() -> None:
    assert cg.schema_errors(3.0, {"type": "integer"}) == []
    assert (
        cg.schema_errors(
            {"x1": 2},
            {"patternProperties": {"^x": {"type": "integer"}}, "additionalProperties": False},
        )
        == []
    )
    assert cg.schema_errors("7", {"anyOf": [{"pattern": "^7$"}], "oneOf": [{}]}) == []
    assert cg.schema_errors([1, 2], {"uniqueItems": True}) == []


def test_invalid_base64_image_is_a_request_error() -> None:
    body = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,@@@"}}
                ],
            }
        ],
        "tools": [OBSERVE],
    }
    with pytest.raises(cg.GatewayError, match="not valid base64"):
        cg.parse_request(json.dumps(body).encode())


FIXTURES = Path(__file__).with_name("fixtures")


@functools.cache
def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_schema_hint_describes_options_from_the_schema() -> None:
    tool = cg.Tool(
        "pick",
        "",
        {
            "type": "object",
            "properties": {
                "mode": {"oneOf": [{"const": "fast"}, {"enum": ["a", "b"]}, {"type": "integer"}]},
                "list": {
                    "type": "array",
                    "items": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                },
                "pair": {
                    "anyOf": [
                        {"type": "object", "required": ["k"], "properties": {"k": {}, "note": {}}},
                    ]
                },
            },
        },
    )
    reply = json.dumps({"name": "pick", "arguments": {}})
    hint = cg.schema_hint(reply, [tool], "arguments.mode matches 2 of the oneOf options")
    assert (
        hint
        == "arguments.mode must match exactly one of these 3 forms: "
        + '"fast"; one of ["a", "b"]; integer'
    )
    assert "string; null" in cg.schema_hint(
        reply, [tool], "arguments.list[] matches 0 of the anyOf options"
    )
    assert "{k (any)} optional: note" in cg.schema_hint(
        reply, [tool], "arguments.pair matches 0 of the anyOf options"
    )
    assert cg.schema_hint('{"name": "other"}', [tool], "arguments.mode matches") == ""
    assert cg.schema_hint("not json", [tool], "x") == ""
