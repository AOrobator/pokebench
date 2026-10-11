import base64
import json
import struct
import zlib

import pytest

from pokebench_env.client import (
    Button,
    ClientError,
    GameClient,
    GameState,
    Milestone,
    Screenshot,
)


def png(width: int, height: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IEND", b"")


class FakeTransport:
    def __init__(self, responses: dict[tuple[str, str], object]) -> None:
        self.responses = responses
        self.requests: list[tuple[str, str, object]] = []

    def __call__(self, method: str, path: str, body: object | None) -> object:
        self.requests.append((method, path, body))
        return self.responses[(method, path)]


STATE = {
    "player": {"position": {"x": 7, "y": 12}, "location": "LITTLEROOT TOWN", "name": "MAY"},
    "game": {"money": 3000, "is_in_battle": False, "badges": [], "game_state": "overworld"},
    "step_number": 42,
    "status": "running",
}


def test_state_is_parsed_into_typed_fields() -> None:
    client = GameClient(FakeTransport({("GET", "/state"): STATE}))
    assert client.state() == GameState(
        location="LITTLEROOT TOWN", x=7, y=12, in_battle=False, badges=0, money=3000, step=42
    )


@pytest.mark.parametrize(
    "broken",
    [
        {},
        {**STATE, "player": {"position": {"x": "7", "y": 12}, "location": "X"}},
        {**STATE, "game": {**STATE["game"], "is_in_battle": "no"}},
        {**STATE, "step_number": None},
    ],
)
def test_malformed_state_is_rejected(broken: dict[str, object]) -> None:
    with pytest.raises(ClientError):
        GameClient(FakeTransport({("GET", "/state"): broken})).state()


def test_screenshot_decodes_a_240x160_png() -> None:
    image = png(240, 160)
    payload = {"screenshot_base64": base64.b64encode(image).decode(), "step_number": 3}
    shot = GameClient(FakeTransport({("GET", "/screenshot"): payload})).screenshot()
    assert shot == Screenshot(png=image, width=240, height=160, step=3)


def test_screenshot_with_wrong_dimensions_or_not_png_is_rejected() -> None:
    wrong = {"screenshot_base64": base64.b64encode(png(100, 100)).decode(), "step_number": 1}
    with pytest.raises(ClientError, match="240x160"):
        GameClient(FakeTransport({("GET", "/screenshot"): wrong})).screenshot()
    junk = {"screenshot_base64": base64.b64encode(b"GIF89a").decode(), "step_number": 1}
    with pytest.raises(ClientError, match="PNG"):
        GameClient(FakeTransport({("GET", "/screenshot"): junk})).screenshot()


def test_press_sends_validated_buttons_and_checks_success() -> None:
    transport = FakeTransport({("POST", "/action"): {"status": "success", "actions_queued": 2}})
    GameClient(transport).press([Button.A, Button.UP])
    assert transport.requests == [("POST", "/action", {"buttons": ["A", "UP"]})]


def test_press_rejects_names_the_server_would_silently_accept() -> None:
    with pytest.raises(ValueError):
        GameClient(FakeTransport({})).press([Button("NOPE")])


def test_press_requires_at_least_one_button() -> None:
    with pytest.raises(ClientError, match="at least one"):
        GameClient(FakeTransport({})).press([])


def test_press_surfaces_server_failure() -> None:
    transport = FakeTransport({("POST", "/action"): {"status": "error", "message": "queue full"}})
    with pytest.raises(ClientError, match="queue full"):
        GameClient(transport).press([Button.B])


def test_milestones_are_typed() -> None:
    payload = {
        "milestones": [
            {"id": 1, "name": "GAME_RUNNING", "completed": True, "timestamp": 1.5},
            {"id": 2, "name": "LITTLEROOT_TOWN", "completed": False, "timestamp": None},
        ],
        "completed": 1,
        "total": 2,
    }
    milestones = GameClient(FakeTransport({("GET", "/milestones"): payload})).milestones()
    assert milestones == [
        Milestone(name="GAME_RUNNING", completed=True, timestamp=1.5),
        Milestone(name="LITTLEROOT_TOWN", completed=False, timestamp=None),
    ]


def test_healthy_requires_healthy_status() -> None:
    assert GameClient(FakeTransport({("GET", "/health"): {"status": "healthy"}})).healthy()
    assert not GameClient(FakeTransport({("GET", "/health"): {"status": "starting"}})).healthy()


def test_http_transport_round_trips_json_against_a_local_server() -> None:
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from pokebench_env.client import http_transport

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self._reply({"echo": body, "path": self.path})

        def do_GET(self) -> None:
            self._reply({"path": self.path})

        def _reply(self, payload: object) -> None:
            data = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args: object) -> None:
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        transport = http_transport(f"http://127.0.0.1:{server.server_port}")
        assert transport("GET", "/state", None) == {"path": "/state"}
        assert transport("POST", "/action", {"buttons": ["A"]}) == {
            "echo": {"buttons": ["A"]},
            "path": "/action",
        }
    finally:
        server.shutdown()
        server.server_close()


def test_http_transport_wraps_connection_errors() -> None:
    from pokebench_env.client import http_transport

    with pytest.raises(ClientError, match="127.0.0.1:9"):
        http_transport("http://127.0.0.1:9", timeout=0.5)("GET", "/health", None)
