"""Screen fade/black facts for the observation settle (gPaletteFade.active)."""

import base64
import json
import threading
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import FastAPI
from PIL import Image
from pydantic import BaseModel
from test_view import get

from pokebench_env.game_state import MapNames
from pokebench_env.observation import install_observation
from pokebench_env.screen_settle import (
    BLACK_NOTE,
    FADING_NOTE,
    PALETTE_FADE,
    frame_is_black,
    palette_fade_active,
    screen_note,
)

FIXTURE = Path(__file__).parent / "fixtures" / "fade-settle-c497-410-427.json"


def png(color: tuple[int, int, int], dot: tuple[int, int, int] | None = None) -> str:
    image = Image.new("RGB", (240, 160), color)
    if dot is not None:
        image.putpixel((239, 159), dot)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def fade_memory(struct: bytes):
    def read(address: int, length: int) -> bytes:
        if PALETTE_FADE <= address < PALETTE_FADE + 8:
            start = address - PALETTE_FADE
            return struct[start : start + length]
        return bytes(length)

    return read


def test_palette_fade_address_is_the_verified_literal() -> None:
    assert PALETTE_FADE == 0x02037FD4


@pytest.mark.parametrize(
    ("byte7", "active"), [(0x80, True), (0xFF, True), (0x7F, False), (0x00, False)]
)
def test_active_is_bit_7_of_byte_7(byte7: int, active: bool) -> None:
    struct = bytes([0xFF] * 7 + [byte7])
    assert palette_fade_active(fade_memory(struct)) is active


def test_other_fade_fields_do_not_count_as_active() -> None:
    # y, targetY, blendColor and delay all set; active clear.
    assert palette_fade_active(fade_memory(bytes.fromhex("ffffffffffffff7f"))) is False


def test_frame_black_only_when_every_pixel_is_zero() -> None:
    assert frame_is_black(png((0, 0, 0))) is True
    assert frame_is_black(png((0, 0, 0), dot=(8, 0, 0))) is False
    assert frame_is_black(png((57, 57, 57))) is False


@pytest.mark.parametrize("data", ["", "iVBORw0KGgo=", "not base64 at all!"])
def test_undecodable_frame_is_not_called_black(data: str) -> None:
    assert frame_is_black(data) is False


def test_notes() -> None:
    assert screen_note(fading=False, black=False) == ""
    assert screen_note(fading=True, black=True) == FADING_NOTE
    assert screen_note(fading=True, black=False) == FADING_NOTE
    assert screen_note(fading=False, black=True) == BLACK_NOTE
    assert "still fading" in FADING_NOTE
    assert "the screen is black in this frame" in BLACK_NOTE


class Shot(BaseModel):
    screenshot_base64: str


def app_with(shot: str, struct: bytes, lock: threading.Lock | None = None) -> FastAPI:
    read = fade_memory(struct)

    def locked(address: int, length: int) -> bytes:
        if lock is not None:
            assert lock.locked()
        return read(address, length)

    app = FastAPI()
    install_observation(app, lambda: Shot(screenshot_base64=shot), locked, MapNames({}), lock)
    return app


ACTIVE = bytes(7) + b"\x80"
IDLE = bytes(8)


@pytest.mark.parametrize(
    ("shot", "struct", "expected"),
    [
        (png((0, 0, 0)), ACTIVE, {"fading": True, "black": True}),
        (png((0, 0, 0)), IDLE, {"fading": False, "black": True}),
        (png((90, 90, 90)), ACTIVE, {"fading": True, "black": False}),
        (png((90, 90, 90)), IDLE, {"fading": False, "black": False}),
    ],
)
def test_screen_route_reports_fade_and_black_under_the_frame_lock(
    shot: str, struct: bytes, expected: dict[str, bool]
) -> None:
    lock = threading.Lock()
    status, _, body = get(app_with(shot, struct, lock), "/pokebench/screen")
    assert status == 200, body
    assert json.loads(body) == expected
    assert not lock.locked()


def test_screen_route_without_a_frame_is_unavailable() -> None:
    status, _, _ = get(app_with("", IDLE), "/pokebench/screen")
    assert status == 503


@pytest.mark.parametrize(
    ("shot", "struct", "first_line"),
    [
        (png((0, 0, 0)), ACTIVE, FADING_NOTE),
        (png((40, 40, 40)), ACTIVE, FADING_NOTE),
        (png((0, 0, 0)), IDLE, BLACK_NOTE),
    ],
)
def test_observation_text_explains_a_fading_or_black_capture(
    shot: str, struct: bytes, first_line: str
) -> None:
    status, _, body = get(app_with(shot, struct), "/pokebench/observation")
    assert status == 200, body
    text = json.loads(body)["state_text"]
    assert text.split("\n")[0] == first_line
    assert text.split("\n")[1].startswith("Screen: ")


def test_settled_visible_observation_text_is_unchanged() -> None:
    status, _, body = get(app_with(png((90, 90, 90)), IDLE), "/pokebench/observation")
    assert status == 200
    text = json.loads(body)["state_text"]
    assert text.startswith("Screen: ")
    assert FADING_NOTE not in text and BLACK_NOTE not in text


def test_c497_turns_410_to_427_would_have_been_held_by_the_settle() -> None:
    """Replay shape: every recorded press capture was fading or black.

    Six captures had gPaletteFade.active set (bag fade, y 10..16); the other
    twelve were taken after the fade finished, while the next screen loaded
    with an all-zero palette. A fade-only wait would miss those, so the
    settle waits on either fact.
    """
    rows = json.loads(FIXTURE.read_text())["rows"]
    assert [row["turn"] for row in rows] == list(range(410, 428))
    fading = [palette_fade_active(fade_memory(bytes.fromhex(r["palette_fade_hex"]))) for r in rows]
    black = [r["frame_black"] for r in rows]
    assert sum(fading) == 6
    assert sum(black) == 17
    assert sum(b and not f for f, b in zip(fading, black, strict=True)) == 12
    assert all(f or b for f, b in zip(fading, black, strict=True))
    assert {r["frame_sha1"] for r in rows if r["frame_black"]} == {
        "cf21bb4a34b28cbcb7809d05703574e20284147a"
    }
    assert {r["screen"] for r, f in zip(rows, fading, strict=True) if f} == {"bag_menu"}
