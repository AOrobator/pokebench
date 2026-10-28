"""The gateway against a fake `claude` executable, over real HTTP where it matters."""

import base64
import http.client
import json
import os
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

import claude_gateway as cg

FAKE = Path(__file__).with_name("fake_claude.py").resolve()
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
GOOD = json.dumps({"name": "press", "arguments": {"buttons": ["A"]}, "text": "talk"})


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


def make(
    tmp_path: Path, plan: list[dict[str, object]], mode: cg.Mode = "stateless", **extra: object
) -> cg.Gateway:
    home = tmp_path / "claude-home"
    home.mkdir(exist_ok=True)
    (home / "plan.json").write_text(json.dumps(plan))
    os.chmod(FAKE, 0o755)
    fields: dict[str, object] = {
        "mode": mode,
        "model": "claude-opus-5-5",
        "effort": "medium",
        "bridge": tmp_path / "bridge",
        "runs_root": tmp_path / "runs",
        "claude": str(FAKE),
        "claude_config_dir": home,
        "run_id": "run-a",
        "backoff": (0.01, 0.02),
        "keepalive": 0.01,
    }
    sleep = extra.pop("sleep_fn", time.sleep)
    fields.update(extra)
    (tmp_path / "runs" / "run-a").mkdir(parents=True, exist_ok=True)
    return cg.Gateway(cg.Config(**fields), sleep=sleep)  # type: ignore[arg-type]


def fake_calls(tmp_path: Path) -> list[dict[str, object]]:
    lines = (tmp_path / "claude-home" / "calls.jsonl").read_text().splitlines()
    return [json.loads(line) for line in lines]


def jsonl(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line]


class Server:
    def __init__(self, gateway: cg.Gateway) -> None:
        self.server = cg.serve(gateway, 0)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def call(self, method: str, path: str, body: bytes | None = None) -> tuple[int, str]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        connection.request(method, path, body=body)
        response = connection.getresponse()
        return response.status, response.read().decode()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def served(tmp_path: Path):  # type: ignore[no-untyped-def]
    servers: list[Server] = []

    def start(gateway: cg.Gateway) -> Server:
        servers.append(Server(gateway))
        return servers[-1]

    yield start
    for server in servers:
        server.close()


def sse_data(body: str) -> list[object]:
    rows = [line[6:] for line in body.split("\n") if line.startswith("data: ")]
    return [json.loads(row) if row != "[DONE]" else "[DONE]" for row in rows]


def test_stateless_success_over_http(tmp_path: Path, served) -> None:  # type: ignore[no-untyped-def]
    server = served(make(tmp_path, [{"result": f"Sure.\n```json\n{GOOD}\n```"}]))
    status, body = server.call("POST", "/v1/chat/completions", request(5))
    assert status == 200
    frames = sse_data(body)
    first = frames[0]
    assert isinstance(first, dict)
    call = first["choices"][0]["delta"]["tool_calls"][0]
    assert call["function"] == {"name": "press", "arguments": '{"buttons": ["A"]}'}
    assert first["choices"][0]["delta"]["content"] == "talk"
    assert frames[-1] == "[DONE]"

    (sent,) = fake_calls(tmp_path)
    argv = sent["argv"]
    assert isinstance(argv, list)
    assert argv[argv.index("--tools") + 1] == ""
    assert "--no-session-persistence" in argv and "--resume" not in argv
    assert argv[argv.index("--model") + 1] == "claude-opus-5-5"
    assert argv[argv.index("--effort") + 1] == "medium"
    assert argv[argv.index("--setting-sources") + 1] == ""
    assert argv[argv.index("--thinking-display") + 1] == "summarized"
    assert "--autocompact" not in argv
    system = argv[argv.index("--system-prompt") + 1]
    assert system.startswith("You play Emerald.") and '"name": "press"' in system
    assert sent["cwd"] == str((tmp_path / "bridge" / "empty").resolve())
    env = sent["env"]
    assert isinstance(env, list)
    assert "CLAUDE_CONFIG_DIR" in env
    assert not any(name.startswith(("CLAUDE_CODE_", "ANTHROPIC_", "POKEBENCH_")) for name in env)
    message = json.loads(str(sent["stdin"]))["message"]
    kinds = [block["type"] for block in message["content"]]
    assert kinds.count("image") == 2
    images = [b for b in message["content"] if b["type"] == "image"]
    assert base64.b64decode(images[0]["source"]["data"]) == PNG
    text = " ".join(b["text"] for b in message["content"] if b["type"] == "text")
    assert "(called observe {})" in text and "[tool result of c1]" in text

    (row,) = jsonl(tmp_path / "bridge" / "calls.jsonl")
    assert row["outcome"] == "ok" and row["model"] == "claude-opus-5-5"
    assert row["models_used"] == ["claude-opus-5-5"]
    assert (row["input_tokens"], row["cache_read_tokens"], row["output_tokens"]) == (100, 50, 20)
    assert row["cost_usd"] == 0.01 and row["provider_wait_ms"] == 0
    stream = (tmp_path / "bridge" / "calls" / str(row["record"])).read_text()
    assert "consider the screen" in stream
    assert (tmp_path / "bridge" / "requests" / "request-1.json").read_bytes() == request(5)
    events = jsonl(tmp_path / "bridge" / "gateway.jsonl")
    assert [e["event"] for e in events] == ["gateway_start", "run_bound"]
    assert events[1]["how"] == "--run-id"


def test_models_routes_and_bad_requests(tmp_path: Path, served) -> None:  # type: ignore[no-untyped-def]
    server = served(make(tmp_path, [{"result": GOOD}], served_model="claude-opus-5-5-medium"))
    status, body = server.call("GET", "/v1/models")
    assert status == 200
    model = json.loads(body)["data"][0]
    assert model["id"] == "claude-opus-5-5-medium" and model["context_window"] == 32768
    assert server.call("GET", "/nope")[0] == 404
    assert server.call("POST", "/v1/embeddings", b"{}")[0] == 404
    status, body = server.call("POST", "/v1/chat/completions", b"{not json")
    assert status == 400 and "not JSON" in body
    assert not (tmp_path / "claude-home" / "calls.jsonl").exists()


def test_malformed_reply_is_reasked_once(tmp_path: Path, served) -> None:  # type: ignore[no-untyped-def]
    bad = json.dumps({"name": "press", "arguments": {"buttons": ["Z"]}})
    server = served(make(tmp_path, [{"result": bad}, {"result": GOOD}]))
    status, body = server.call("POST", "/v1/chat/completions", request(1))
    assert status == 200 and sse_data(body)[-1] == "[DONE]"
    first, second = fake_calls(tmp_path)
    retry = json.loads(str(second["stdin"]))["message"]["content"]
    assert retry[:-1] == json.loads(str(first["stdin"]))["message"]["content"]
    assert bad in retry[-1]["text"] and "arguments.buttons[0] must be one of" in retry[-1]["text"]
    outcomes = [row["outcome"] for row in jsonl(tmp_path / "bridge" / "calls.jsonl")]
    assert outcomes == ["ok", "ok"]


def test_second_malformed_reply_is_one_reply_failure(tmp_path: Path, served) -> None:  # type: ignore[no-untyped-def]
    server = served(make(tmp_path, [{"result": "I will press A."}]))
    status, body = server.call("POST", "/v1/chat/completions", request(1))
    assert status == 200
    (frame,) = sse_data(body)
    assert isinstance(frame, dict)
    assert frame["error"]["type"] == "invalid_reply"
    assert "no JSON object" in frame["error"]["message"]
    assert len(fake_calls(tmp_path)) == 2
    assert not (tmp_path / "runs" / "run-a" / "control.jsonl").exists()
    assert jsonl(tmp_path / "bridge" / "gateway.jsonl")[-1]["event"] == "invalid_reply"


def test_usage_limit_holds_the_request_and_pauses_the_run(tmp_path: Path, served) -> None:  # type: ignore[no-untyped-def]
    limit = {"error": "You've hit your session limit · resets 9pm", "status": 429}
    plan = [limit, {"crash": "socket hang up"}, limit, {"result": GOOD}]
    gateway = make(tmp_path, plan, backoff=(0.05, 0.1))
    control = tmp_path / "runs" / "run-a" / "control.jsonl"
    control.write_text('{"v":1,"seq":1,"at":"2026-10-27T20:00:00.000Z","action":"extend_30m"}\n')
    server = served(gateway)
    status, body = server.call("POST", "/v1/chat/completions", request(1))
    assert status == 200
    assert ": waiting" in body
    assert sse_data(body)[-1] == "[DONE]"
    rows = [json.loads(line) for line in control.read_text().splitlines()]
    assert [(r["seq"], r["action"]) for r in rows] == [
        (1, "extend_30m"),
        (2, "pause"),
        (3, "resume"),
    ]
    assert all(set(r) == {"v", "seq", "at", "action"} and r["v"] == 1 for r in rows)
    assert datetime.fromisoformat(str(rows[1]["at"])) <= datetime.fromisoformat(str(rows[2]["at"]))
    calls = jsonl(tmp_path / "bridge" / "calls.jsonl")
    assert [c["outcome"] for c in calls] == ["provider_wait"] * 3 + ["ok"]
    assert [c["provider_wait_ms"] for c in calls] == [0, 50, 150, 250]
    assert "HTTP 429" in str(calls[0]["error"])
    waits = [
        e for e in jsonl(tmp_path / "bridge" / "gateway.jsonl") if e["event"] == "provider_wait"
    ]
    assert [w["wait"] for w in waits] == ["usage_limit", "provider", "usage_limit"]
    assert [w["retry_in_s"] for w in waits] == [0.05, 0.1, 0.1]


def test_wait_then_invalid_still_resumes(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"error": "Overloaded"}, {"result": "no"}], sleep_fn=lambda s: None)
    seq, outcome = gateway.answer(request(1))
    assert outcome.reply is None and outcome.paused and seq == 1
    actions = [r["action"] for r in jsonl(tmp_path / "runs" / "run-a" / "control.jsonl")]
    assert actions == ["pause", "resume"]


def test_session_mode_resumes_one_session(tmp_path: Path) -> None:
    plan = [{"error": "rate limited"}, {"result": GOOD}, {"error": "usage limit"}, {"result": GOOD}]
    gateway = make(tmp_path, plan, mode="session", sleep_fn=lambda s: None)
    assert gateway.answer(request(1))[1].reply == cg.Reply("press", {"buttons": ["A"]}, "talk")
    assert gateway.answer(request(2))[1].reply is not None
    calls = fake_calls(tmp_path)
    flags = [
        next(
            (a, c["argv"][i + 1])
            for i, a in enumerate(c["argv"])
            if a in ("--session-id", "--resume")
        )  # type: ignore[union-attr,index,arg-type]
        for c in calls
    ]
    assert [f[0] for f in flags] == ["--session-id", "--session-id", "--resume", "--resume"]
    assert flags[0][1] != flags[1][1]
    session = flags[1][1]
    assert flags[2][1] == flags[3][1] == session
    state = json.loads((tmp_path / "bridge" / "session.json").read_text())
    assert state["session_id"] == session
    argv = calls[1]["argv"]
    assert isinstance(argv, list)
    assert argv[argv.index("--tools") + 1] == "Read" and "--restricted" in argv
    assert argv[argv.index("--system-prompt-snapshot") + 1] == "off"
    assert "--no-session-persistence" not in argv
    screens = (tmp_path / "bridge" / "screens").resolve()
    assert calls[1]["cwd"] == str(screens)
    first = json.loads(str(calls[1]["stdin"]))["message"]["content"]
    assert [b["type"] for b in first] == ["text"]
    text = first[0]["text"]
    assert "Harness tools:" in text and "Start." not in text
    assert f"(screenshot saved at {screens}/turn-1-1-0.png)" in text
    assert (screens / "turn-1-1-0.png").read_bytes() == b"jpg"
    later = json.loads(str(calls[3]["stdin"]))["message"]["content"][0]["text"]
    assert later.startswith("Harness tools unchanged: press, observe.")
    assert "result 2" in later
    reloaded = cg.Gateway(gateway.config, sleep=lambda s: None)
    assert reloaded.session.session_id == session and reloaded.seq == 2


def test_session_reask_sends_only_the_error_and_tool_change_resends_tools(tmp_path: Path) -> None:
    plan = [{"result": "{}"}, {"result": GOOD}, {"result": GOOD}]
    gateway = make(tmp_path, plan, mode="session")
    assert gateway.answer(request(1))[1].reply is not None
    assert gateway.answer(request(2, tools=[OBSERVE, PRESS]))[1].reply is not None
    calls = fake_calls(tmp_path)
    reask = json.loads(str(calls[1]["stdin"]))["message"]["content"]
    assert len(reask) == 1 and reask[0]["text"].startswith("Your reply could not be used:")
    assert "--resume" in calls[1]["argv"]  # type: ignore[operator]
    assert "Harness tools:" in json.loads(str(calls[2]["stdin"]))["message"]["content"][0]["text"]


def test_max_turns_is_a_model_error_not_a_wait(tmp_path: Path) -> None:
    plan = [{"error": "Reached max turns", "subtype": "error_max_turns"}, {"result": GOOD}]
    gateway = make(tmp_path, plan, mode="session")
    assert gateway.answer(request(1))[1].reply is not None
    assert not (tmp_path / "runs" / "run-a" / "control.jsonl").exists()


def test_call_timeout_is_a_provider_wait(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"sleep": 5}, {"result": GOOD}], call_timeout=0.5)
    gateway.sleep = lambda s: None
    assert gateway.answer(request(1))[1].reply is not None
    first = jsonl(tmp_path / "bridge" / "calls.jsonl")[0]
    assert first["outcome"] == "provider_wait" and "timed out" in str(first["error"])


def write_start(runs: Path, run: str, port: int, at: datetime) -> Path:
    path = runs / run / "events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    start = {"type": "run_start", "t": at.isoformat(), "isolation": {"port": port}}
    path.write_text(json.dumps(start) + "\n")
    return path


def test_run_binding_by_game_port(tmp_path: Path) -> None:
    runs = tmp_path / "runs"
    started = datetime.now(UTC)
    binder = cg.RunBinder(runs, started.timestamp(), game_port=8087)
    assert binder.resolve() is None
    old = write_start(runs, "old", 8087, started - timedelta(hours=1))
    os.utime(old, (started.timestamp() - 3600, started.timestamp() - 3600))
    write_start(runs, "late-but-old-start", 8087, started - timedelta(minutes=1))
    write_start(runs, "other-port", 8090, started + timedelta(seconds=2))
    (runs / "broken").mkdir()
    (runs / "broken" / "events.jsonl").write_text("{")
    assert binder.resolve() is None
    write_start(runs, "mine", 8087, started + timedelta(seconds=1))
    assert binder.resolve() == "mine" and binder.how == "run_start on port 8087"
    write_start(runs, "second", 8087, started + timedelta(seconds=3))
    assert binder.resolve() == "mine"
    ambiguous = cg.RunBinder(runs, started.timestamp(), game_port=8087)
    assert ambiguous.resolve() is None
    assert cg.RunBinder(runs, started.timestamp()).resolve() is None


def test_unbound_pause_is_logged_not_written(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"error": "limit"}, {"result": GOOD}], run_id=None, game_port=9999)
    gateway.sleep = lambda s: None
    assert gateway.answer(request(1))[1].paused
    skipped = [
        e for e in jsonl(tmp_path / "bridge" / "gateway.jsonl") if e["event"] == "control_skipped"
    ]
    assert [e["action"] for e in skipped] == ["pause", "resume"]


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


def test_parse_args(tmp_path: Path) -> None:
    config, port = cg.parse_args(
        [
            "--mode",
            "session",
            "--model",
            "claude-fable-5-1",
            "--bridge",
            str(tmp_path),
            "--port",
            "8117",
            "--game-port",
            "8088",
            "--backoff",
            "1,2.5",
        ]
    )
    assert port == 8117 and config.mode == "session" and config.backoff == (1.0, 2.5)
    assert config.effort == "medium" and config.advertised == "claude-fable-5-1"
    with pytest.raises(SystemExit):
        cg.parse_args(["--mode", "stateless", "--model", "m", "--bridge", "b", "--port", "1"])
    with pytest.raises(SystemExit):
        cg.parse_args(
            [
                "--mode",
                "stateless",
                "--model",
                "m",
                "--bridge",
                "b",
                "--port",
                "1",
                "--run-id",
                "r",
                "--backoff",
                "-1",
            ]
        )


def test_main_serves(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[int] = []

    def fake_serve(gateway: cg.Gateway, port: int) -> object:
        started.append(port)

        class Stub:
            def serve_forever(self) -> None:
                raise KeyboardInterrupt

        return Stub()

    monkeypatch.setattr(cg, "serve", fake_serve)
    with pytest.raises(KeyboardInterrupt):
        cg.main(
            [
                "--mode",
                "stateless",
                "--model",
                "m",
                "--bridge",
                str(tmp_path / "b"),
                "--port",
                "8120",
                "--run-id",
                "r",
            ]
        )
    assert started == [8120]


def test_session_cost_is_logged_per_call(tmp_path: Path) -> None:
    plan = [
        {"result": GOOD, "cost": 0.05},
        {"error": "usage limit", "cost": 0.05},
        {"result": GOOD, "cost": 0.08},
    ]
    gateway = make(tmp_path, plan, mode="session", sleep_fn=lambda s: None)
    assert gateway.answer(request(1))[1].reply is not None
    assert gateway.answer(request(2))[1].reply is not None
    rows = jsonl(tmp_path / "bridge" / "calls.jsonl")
    assert [round(float(str(r["cost_usd"])), 6) for r in rows] == [0.05, 0.0, 0.03]
    assert [r["session_cost_total_usd"] for r in rows] == [0.05, 0.05, 0.08]
    state = json.loads((tmp_path / "bridge" / "session.json").read_text())
    assert state["cost_total"] == 0.08
    assert cg.Gateway(gateway.config).session.cost_total == 0.08


def test_resume_follows_pause_when_delivery_fails(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"error": "limit"}, {"result": GOOD}], sleep_fn=lambda s: None)

    def broken(seq: int, outcome: cg.Outcome) -> None:
        raise BrokenPipeError

    with pytest.raises(BrokenPipeError):
        gateway.answer(request(1), broken)
    actions = [r["action"] for r in jsonl(tmp_path / "runs" / "run-a" / "control.jsonl")]
    assert actions == ["pause", "resume"]


def test_client_disconnect_ends_the_hold(tmp_path: Path, served) -> None:  # type: ignore[no-untyped-def]
    import socket

    gateway = make(tmp_path, [{"error": "You've hit your limit"}], backoff=(0.05,))
    server = served(gateway)
    client = socket.create_connection(("127.0.0.1", server.port))
    body = request(1)
    head = f"POST /v1/chat/completions HTTP/1.1\r\nHost: x\r\nContent-Length: {len(body)}\r\n\r\n"
    client.sendall(head.encode() + body)
    control = tmp_path / "runs" / "run-a" / "control.jsonl"
    deadline = time.time() + 5
    while not control.exists() and time.time() < deadline:
        time.sleep(0.01)
    client.close()
    while len(control.read_text().splitlines()) < 2 and time.time() < deadline:
        time.sleep(0.01)
    assert [r["action"] for r in jsonl(control)] == ["pause", "resume"]
    events = [e["event"] for e in jsonl(tmp_path / "bridge" / "gateway.jsonl")]
    assert "client_gone" in events


def test_session_starts_fresh_for_a_different_run(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"result": GOOD}], mode="session")
    assert gateway.answer(request(1))[1].reply is not None
    first = json.loads((tmp_path / "bridge" / "session.json").read_text())
    assert first["run_id"] == "run-a"
    (tmp_path / "runs" / "run-b").mkdir()
    other = cg.Gateway(cg.replace(gateway.config, run_id="run-b"))
    assert other.answer(request(2))[1].reply is not None
    last = fake_calls(tmp_path)[-1]["argv"]
    assert isinstance(last, list) and "--session-id" in last and "--resume" not in last
    assert last[last.index("--session-id") + 1] != first["session_id"]
    events = [
        e for e in jsonl(tmp_path / "bridge" / "gateway.jsonl") if e["event"] == "session_reset"
    ]
    assert events[0]["old_run"] == "run-a" and events[0]["run_id"] == "run-b"
    same = cg.Gateway(other.config)
    assert same.answer(request(3))[1].reply is not None
    assert "--resume" in fake_calls(tmp_path)[-1]["argv"]  # type: ignore[operator]


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


def test_session_of_unknown_run_is_not_adopted(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"result": GOOD}], mode="session")
    legacy = {"session_id": "00000000-0000-4000-8000-75e45e416143", "tools_sha": ""}
    (tmp_path / "bridge" / "session.json").write_text(json.dumps(legacy))
    bound = cg.Gateway(gateway.config)
    assert bound.answer(request(1))[1].reply is not None
    argv = fake_calls(tmp_path)[-1]["argv"]
    assert isinstance(argv, list) and "--resume" not in argv
    assert legacy["session_id"] not in argv
    assert json.loads((tmp_path / "bridge" / "session.json").read_text())["run_id"] == "run-a"


def test_session_started_before_binding_is_not_adopted(tmp_path: Path) -> None:
    runs = tmp_path / "runs"
    gateway = make(tmp_path, [{"result": GOOD}], mode="session", run_id=None, game_port=8089)
    assert gateway.answer(request(1))[1].reply is not None
    write_start(runs, "late", 8089, datetime.now(UTC) + timedelta(seconds=1))
    assert gateway.answer(request(2))[1].reply is not None
    argv = fake_calls(tmp_path)[-1]["argv"]
    assert isinstance(argv, list) and "--session-id" in argv and "--resume" not in argv


def test_autocompact_reaches_claude_and_the_logs(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"result": GOOD}], mode="session", autocompact=258_000)
    assert gateway.answer(request(1))[1].reply is not None
    argv = fake_calls(tmp_path)[-1]["argv"]
    assert isinstance(argv, list) and argv[argv.index("--autocompact") + 1] == "258000"
    assert jsonl(tmp_path / "bridge" / "calls.jsonl")[0]["autocompact"] == 258_000
    start = jsonl(tmp_path / "bridge" / "gateway.jsonl")[0]
    assert start["event"] == "gateway_start" and start["autocompact"] == 258_000


@pytest.mark.parametrize(
    ("text", "tokens"), [("258k", 258_000), ("258000", 258_000), ("1000K", 1_000_000)]
)
def test_autocompact_argument(tmp_path: Path, text: str, tokens: int) -> None:
    base = [
        "--mode",
        "session",
        "--model",
        "m",
        "--bridge",
        str(tmp_path),
        "--port",
        "1",
        "--run-id",
        "r",
    ]
    assert cg.parse_args([*base, "--autocompact", text])[0].autocompact == tokens
    assert cg.parse_args(base)[0].autocompact is None


@pytest.mark.parametrize("text", ["50k", "2m", "auto", "1001k", ""])
def test_autocompact_argument_rejects(tmp_path: Path, text: str) -> None:
    base = [
        "--mode",
        "session",
        "--model",
        "m",
        "--bridge",
        str(tmp_path),
        "--port",
        "1",
        "--run-id",
        "r",
    ]
    with pytest.raises(SystemExit):
        cg.parse_args([*base, "--autocompact", text])


def test_continuation_adopts_the_named_parent_session(tmp_path: Path) -> None:
    gateway = make(
        tmp_path, [{"result": GOOD, "cost": 0.05}, {"result": GOOD, "cost": 0.08}], mode="session"
    )
    assert gateway.answer(request(1))[1].reply is not None
    parent = json.loads((tmp_path / "bridge" / "session.json").read_text())
    (tmp_path / "runs" / "run-b").mkdir()
    child = cg.Gateway(cg.replace(gateway.config, run_id="run-b", continue_from="run-a"))
    assert child.answer(request(2))[1].reply is not None
    argv = fake_calls(tmp_path)[-1]["argv"]
    assert isinstance(argv, list) and argv[argv.index("--resume") + 1] == parent["session_id"]
    state = json.loads((tmp_path / "bridge" / "session.json").read_text())
    assert state["session_id"] == parent["session_id"] and state["run_id"] == "run-b"
    events = jsonl(tmp_path / "bridge" / "gateway.jsonl")
    continued = [e for e in events if e["event"] == "session_continued"]
    assert continued == [{**continued[0], "old_run": "run-a", "run_id": "run-b"}]
    assert not any(e["event"] == "session_reset" for e in events)
    assert [e["continue_from"] for e in events if e["event"] == "gateway_start"] == [None, "run-a"]
    assert round(float(str(jsonl(tmp_path / "bridge" / "calls.jsonl")[-1]["cost_usd"])), 6) == 0.03
    again = cg.Gateway(child.config)
    assert again.answer(request(3))[1].reply is not None
    assert "--resume" in fake_calls(tmp_path)[-1]["argv"]  # type: ignore[operator]
    assert (
        sum(e["event"] == "session_continued" for e in jsonl(tmp_path / "bridge" / "gateway.jsonl"))
        == 1
    )


def test_continuation_never_adopts_another_runs_session(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"result": GOOD}], mode="session")
    assert gateway.answer(request(1))[1].reply is not None
    (tmp_path / "runs" / "run-b").mkdir()
    child = cg.Gateway(cg.replace(gateway.config, run_id="run-b", continue_from="run-x"))
    assert child.answer(request(2))[1].reply is not None
    argv = fake_calls(tmp_path)[-1]["argv"]
    assert isinstance(argv, list) and "--resume" not in argv
    assert [e["event"] for e in jsonl(tmp_path / "bridge" / "gateway.jsonl")].count(
        "session_reset"
    ) == 1


def test_continue_session_argument(tmp_path: Path) -> None:
    base = [
        "--mode",
        "session",
        "--model",
        "m",
        "--bridge",
        str(tmp_path),
        "--port",
        "1",
        "--game-port",
        "2",
    ]
    assert cg.parse_args([*base, "--continue-session-from", "r0"])[0].continue_from == "r0"
    assert cg.parse_args(base)[0].continue_from is None


FIXTURES = Path(__file__).with_name("fixtures")


@pytest.mark.parametrize(
    ("name", "roles"),
    [
        ("bundle-d06b9f4db-request-601.json", ["tool", "user", "user"]),
        ("aacff2371-request-145-battle-update.json", ["tool", "user", "user"]),
        ("aacff2371-request-400.json", ["tool", "user"]),
    ],
)
def test_current_turn_keeps_the_tool_result_and_every_trailing_message(
    name: str, roles: list[str]
) -> None:
    parsed = cg.parse_request((FIXTURES / name).read_bytes())
    turn = parsed.current_turn
    assert [m.role for m in turn] == roles
    assert turn[0].tool_call_id is not None


def test_assistant_terminal_request_resends_no_reply(tmp_path: Path) -> None:
    body = {
        "messages": [
            {"role": "user", "content": "go"},
            {"role": "assistant", "content": "MY OWN REPLY"},
        ],
        "tools": [PRESS, OBSERVE],
    }
    raw = json.dumps(body).encode()
    assert cg.parse_request(raw).current_turn == ()
    gateway = make(tmp_path, [{"result": GOOD}], mode="session")
    assert gateway.answer(raw)[1].reply is not None
    text = json.loads(str(fake_calls(tmp_path)[-1]["stdin"]))["message"]["content"][0]["text"]
    assert "MY OWN REPLY" not in text and "[assistant" not in text


def test_bundle_request_delivers_its_tool_result_in_session_mode(tmp_path: Path) -> None:
    gateway = make(tmp_path, [{"result": GOOD}], mode="session")
    raw = (FIXTURES / "bundle-d06b9f4db-request-601.json").read_bytes()
    assert gateway.answer(raw)[1].reply is not None
    text = json.loads(str(fake_calls(tmp_path)[-1]["stdin"]))["message"]["content"][0]["text"]
    assert "[tool result of call_600]" in text and "Gym progress (game memory)" in text
    assert "OBSERVED INSTRUCTION MEMORY" in text
    assert "MAY's pre-battle line is showing" not in text
    screens = sorted(p.name for p in (tmp_path / "bridge" / "screens").iterdir())
    assert screens and all(n.startswith("turn-1-1-") for n in screens)
    assert text.count("(screenshot saved at") == len(screens)
