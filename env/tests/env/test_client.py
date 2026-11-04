import base64
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
    from io import BytesIO

    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (width, height), (40, 120, 200)).save(buffer, format="PNG")
    return buffer.getvalue()


def header_only_png(width: int, height: int) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = (
        struct.pack(">I", len(ihdr))
        + b"IHDR"
        + ihdr
        + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr))
    )
    return b"\x89PNG\r\n\x1a\n" + chunk


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


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png_with_chunk_before_iend(kind: bytes, data: bytes) -> bytes:
    image = png(240, 160)
    iend = image.rindex(b"IEND") - 4
    return image[:iend] + chunk(kind, data) + image[iend:]


def bomb_png() -> bytes:
    ihdr = struct.pack(">IIBBBBB", 20000, 20000, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"\x00" * 10))
        + chunk(b"IEND", b"")
    )


@pytest.mark.parametrize(
    "payload",
    [
        png_with_chunk_before_iend(b"tRNS", b"\x00"),
        png_with_chunk_before_iend(b"iCCP", b""),
        bomb_png(),
        header_only_png(240, 160),
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00",
    ],
    ids=["short-tRNS", "empty-iCCP", "bomb", "header-only", "short-IHDR"],
)
def test_screenshot_without_decodable_image_data_is_rejected(payload: bytes) -> None:
    body = {"screenshot_base64": base64.b64encode(payload).decode(), "step_number": 1}
    with pytest.raises(ClientError, match="screenshot"):
        GameClient(FakeTransport({("GET", "/screenshot"): body})).screenshot()


@pytest.mark.parametrize("encoded", ["not base64!", "\u00e9"])
def test_screenshot_with_invalid_base64_is_a_client_error(encoded: str) -> None:
    body = {"screenshot_base64": encoded, "step_number": 1}
    with pytest.raises(ClientError, match="screenshot_base64"):
        GameClient(FakeTransport({("GET", "/screenshot"): body})).screenshot()


def test_press_sends_validated_buttons_and_checks_success() -> None:
    transport = FakeTransport({("POST", "/action"): {"status": "success", "actions_queued": 2}})
    GameClient(transport).press([Button.A, Button.UP])
    assert transport.requests == [("POST", "/action", {"buttons": ["A", "UP"]})]


def test_press_rejects_names_the_server_would_silently_accept() -> None:
    transport = FakeTransport({})
    with pytest.raises(ClientError, match="NOPE"):
        GameClient(transport).press(["NOPE"])  # type: ignore[list-item]
    assert transport.requests == []


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


@pytest.mark.parametrize("flag", [True, False])
def test_boolean_milestone_timestamps_are_rejected(flag: bool) -> None:
    payload = {"milestones": [{"name": "GAME_RUNNING", "completed": True, "timestamp": flag}]}
    with pytest.raises(ClientError, match="timestamp"):
        GameClient(FakeTransport({("GET", "/milestones"): payload})).milestones()


def test_healthy_requires_healthy_status() -> None:
    assert GameClient(FakeTransport({("GET", "/health"): {"status": "healthy"}})).healthy()
    assert not GameClient(FakeTransport({("GET", "/health"): {"status": "starting"}})).healthy()
