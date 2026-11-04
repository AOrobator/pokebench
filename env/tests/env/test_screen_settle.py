"""Frame-driven observation settle: capture on the first emulated frame after a
screen fade (gPaletteFade.active) and its black loading frames end."""

from __future__ import annotations

import base64
import threading
from collections.abc import Callable
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from pydantic import BaseModel

from pokebench_env.screen_settle import (
    BLACK_NOTE,
    FADING_NOTE,
    PALETTE_FADE,
    PALETTE_RAM,
    SETTLE_BOUND_FRAMES,
    FrameSettle,
    frame_is_black,
    install_frame_settle,
    palette_black,
    palette_fade_active,
    screen_note,
    transitioning,
)

FIXTURE = Path(__file__).parent / "fixtures" / "fade-settle-c497-410-427.json"
ACTIVE = bytes(7) + b"\x80"
IDLE = bytes(8)
LIT = b"\xff\x7f" + bytes(0x3FE)
DARK = bytes(0x400)


def png(color: tuple[int, int, int], dot: tuple[int, int, int] | None = None) -> str:
    image = Image.new("RGB", (240, 160), color)
    if dot is not None:
        image.putpixel((239, 159), dot)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class Game:
    """Fake emulator memory: the fade struct and palette RAM, plus a frame count."""

    def __init__(self, fade: bytes = IDLE, palette: bytes = LIT) -> None:
        self.fade = fade
        self.palette = palette
        self.frame = 0
        self.reads: list[int] = []

    def read(self, address: int, length: int) -> bytes:
        self.reads.append(address)
        if PALETTE_FADE <= address < PALETTE_FADE + 8:
            start = address - PALETTE_FADE
            return self.fade[start : start + length]
        if address == PALETTE_RAM:
            return self.palette[:length]
        return bytes(length)


def test_verified_addresses() -> None:
    assert PALETTE_FADE == 0x02037FD4
    assert PALETTE_RAM == 0x05000000


@pytest.mark.parametrize(
    ("byte7", "active"), [(0x80, True), (0xFF, True), (0x7F, False), (0x00, False)]
)
def test_active_is_bit_7_of_byte_7(byte7: int, active: bool) -> None:
    assert palette_fade_active(Game(fade=bytes([0xFF] * 7 + [byte7])).read) is active


def test_palette_black_only_when_every_colour_is_zero() -> None:
    assert palette_black(Game(palette=DARK).read) is True
    assert palette_black(Game(palette=bytes(0x3FF) + b"\x01").read) is False


def test_transitioning_is_fading_or_a_black_palette() -> None:
    assert transitioning(Game(ACTIVE, LIT).read) is True
    assert transitioning(Game(IDLE, DARK).read) is True
    assert transitioning(Game(IDLE, LIT).read) is False


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
    assert screen_note(fading=False, black=True) == BLACK_NOTE
    assert "still fading" in FADING_NOTE
    assert "the screen is black in this frame" in BLACK_NOTE


def test_bound_is_a_full_fade_at_delay_15_in_frames() -> None:
    # BeginNormalPaletteFade: deltaY 2, so 0->16 is 8 steps of (delay + 1)
    # frames plus finishing frames; delay 15 -> 16 * 9 + 2.
    assert SETTLE_BOUND_FRAMES == 146


Capture = Callable[[], object]


def waiting(settle: FrameSettle, capture: Capture, lock: threading.Lock):
    out: dict[str, object] = {}
    registered = threading.Event()

    def worker() -> None:
        try:
            out["result"] = settle.settle(capture, lock, on_wait=registered.set)
        except RuntimeError as error:
            out["error"] = str(error)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    assert registered.wait(5)
    return out, thread


def frames(
    game: Game,
    settle: FrameSettle,
    lock: threading.Lock,
    thread: threading.Thread,
    change: dict[int, tuple[bytes, bytes]],
    limit: int = 1000,
) -> int:
    """The vendor loop: each frame under the memory lock, then the hook."""
    stepped = 0
    while thread.is_alive() and stepped < limit:
        with lock:
            game.frame += 1
            if game.frame in change:
                game.fade, game.palette = change[game.frame]
            settle.on_frame()
        stepped += 1
        thread.join(0.001)
    thread.join(5)
    return stepped


def at_once(settle: FrameSettle, capture: Capture, lock: threading.Lock) -> object:
    """settle() on a daemon thread with no frame source: it must return without
    waiting for a frame (a broken guard fails here instead of hanging pytest)."""
    out: dict[str, object] = {}
    waited: list[bool] = []

    def worker() -> None:
        out["r"] = settle.settle(capture, lock, on_wait=lambda: waited.append(True))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    thread.join(5)
    assert not thread.is_alive(), "captured without waiting for a frame"
    assert waited == []
    return out["r"]


def test_settled_screen_captures_at_once_without_waiting_for_a_frame() -> None:
    game = Game()
    settle = FrameSettle(game.read)
    assert at_once(settle, lambda: game.frame, threading.Lock()) == 0


def test_captures_on_the_first_emulated_frame_after_the_fade_ends() -> None:
    game = Game(ACTIVE, LIT)
    lock = threading.Lock()
    settle = FrameSettle(game.read)
    out, thread = waiting(settle, lambda: (game.frame, palette_fade_active(game.read)), lock)
    # Frames 1-3 fade out, 4-6 black loading palette, 7 fade in, 8 visible.
    frames(game, settle, lock, thread, {4: (IDLE, DARK), 7: (ACTIVE, LIT), 8: (IDLE, LIT)})
    assert out["result"] == (8, False)


def test_bound_hit_captures_while_still_fading_after_the_bound_in_frames() -> None:
    game = Game(ACTIVE, DARK)
    lock = threading.Lock()
    settle = FrameSettle(game.read, bound_frames=5)
    out, thread = waiting(settle, lambda: (game.frame, palette_fade_active(game.read)), lock)
    assert frames(game, settle, lock, thread, {}) == 5
    assert out["result"] == (5, True)


def test_capture_errors_reach_the_caller_and_not_the_game_thread() -> None:
    game = Game(ACTIVE, LIT)
    lock = threading.Lock()
    settle = FrameSettle(game.read)

    def broken() -> object:
        raise RuntimeError("native memory unavailable")

    out, thread = waiting(settle, broken, lock)
    frames(game, settle, lock, thread, {1: (IDLE, LIT)})
    assert out == {"error": "native memory unavailable"}


def test_a_parked_frame_loop_releases_waiters_and_later_observations_capture_at_once() -> None:
    game = Game(ACTIVE, LIT)
    lock = threading.Lock()
    settle = FrameSettle(game.read)
    out, thread = waiting(settle, lambda: game.frame, lock)
    settle.park()
    thread.join(5)
    assert out["result"] == 0
    assert at_once(settle, lambda: "parked", lock) == "parked"
    # Resuming (before any frame has run) makes observations wait again.
    settle.resume()
    out, thread = waiting(settle, lambda: game.frame, lock)
    frames(game, settle, lock, thread, {2: (IDLE, LIT)})
    assert out["result"] == 2


def test_a_failing_fade_read_reaches_the_waiters_and_not_the_game_thread() -> None:
    game = Game(ACTIVE, LIT)
    lock = threading.Lock()
    settle = FrameSettle(game.read)
    out, thread = waiting(settle, lambda: game.frame, lock)

    def broken(address: int, length: int) -> bytes:
        raise RuntimeError("native memory unavailable")

    settle.read = broken
    with lock:
        settle.on_frame()  # does not raise into the vendor frame loop
    thread.join(5)
    assert out == {"error": "native memory unavailable"}


def test_no_frame_work_while_nobody_waits() -> None:
    game = Game(ACTIVE, DARK)
    settle = FrameSettle(game.read)
    for _ in range(10):
        settle.on_frame()
    assert game.reads == []


def test_frame_hook_runs_after_every_emulated_frame() -> None:
    order: list[str] = []

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            order.append(f"frame {buttons}")

    class Spy(FrameSettle):
        def on_frame(self) -> None:
            order.append("settle")

    install_frame_settle(Emulator, Spy(Game().read))
    Emulator().run_frame_with_buttons(["A"])
    Emulator().run_frame_with_buttons([])
    assert order == ["frame ['A']", "settle", "frame []", "settle"]


class Shot(BaseModel):
    screenshot_base64: str
