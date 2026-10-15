"""Frame-driven observation settle: capture on the first emulated frame after a
screen fade (gPaletteFade.active) and its black loading frames end."""

import base64
import json
import threading
import types
from collections.abc import Callable
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import FastAPI
from PIL import Image
from pydantic import BaseModel
from test_pause import FrameLoop, post
from test_view import get

from pokebench_env.game_state import MapNames
from pokebench_env.observation import install_observation
from pokebench_env.pause import install_pause
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

    thread = threading.Thread(target=worker)
    thread.start()
    assert registered.wait(5)
    return out, thread


def frames(game: Game, settle: FrameSettle, lock: threading.Lock, thread: threading.Thread,
           change: dict[int, tuple[bytes, bytes]], limit: int = 1000) -> int:
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


def test_settled_screen_captures_at_once_without_waiting_for_a_frame() -> None:
    game = Game()
    settle = FrameSettle(game.read)
    waited: list[bool] = []
    assert settle.settle(lambda: game.frame, threading.Lock(), on_wait=lambda: waited.append(True)) == 0
    assert waited == []


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
    settle.release()
    thread.join(5)
    assert out["result"] == 0
    waited: list[bool] = []
    assert settle.settle(lambda: "parked", lock, on_wait=lambda: waited.append(True)) == "parked"
    assert waited == []
    with lock:
        settle.on_frame()
    out, thread = waiting(settle, lambda: game.frame, lock)
    assert frames(game, settle, lock, thread, {2: (IDLE, LIT)}) == 1
    assert out["result"] == 2


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


def test_pause_parking_releases_the_settle() -> None:
    parked = threading.Event()
    app = FastAPI()
    module = types.SimpleNamespace(step_environment=lambda actions: None)
    install_pause(app, module, on_park=parked.set)
    with FrameLoop(module):
        assert post(app, "/pokebench/pause", b'{"paused": true}') == (200, b'{"paused":true}')
        assert parked.is_set()
        assert post(app, "/pokebench/pause", b'{"paused": false}')[0] == 200


class Shot(BaseModel):
    screenshot_base64: str


def observation_app(game: Game, shot: str, settle: FrameSettle | None,
                    lock: threading.Lock | None = None) -> FastAPI:
    app = FastAPI()
    install_observation(
        app, lambda: Shot(screenshot_base64=shot), game.read, MapNames({}),
        lock or threading.Lock(), settle=settle,
    )
    return app


@pytest.mark.parametrize(
    ("fade", "shot", "first_line"),
    [
        (ACTIVE, png((0, 0, 0)), FADING_NOTE),
        (ACTIVE, png((40, 40, 40)), FADING_NOTE),
        (IDLE, png((0, 0, 0)), BLACK_NOTE),
    ],
)
def test_observation_text_explains_a_fading_or_black_capture(
    fade: bytes, shot: str, first_line: str
) -> None:
    status, _, body = get(observation_app(Game(fade, LIT), shot, None), "/pokebench/observation")
    assert status == 200, body
    lines = json.loads(body)["state_text"].split("\n")
    assert lines[0] == first_line
    assert lines[1].startswith("Screen: ")


def test_settled_visible_observation_text_is_unchanged() -> None:
    game = Game(IDLE, LIT)
    app = observation_app(game, png((90, 90, 90)), FrameSettle(game.read))
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200
    assert json.loads(body)["state_text"].startswith("Screen: ")


def test_observation_route_captures_on_the_first_frame_after_the_fade() -> None:
    game = Game(ACTIVE, LIT)
    lock = threading.Lock()
    settle = FrameSettle(game.read)
    app = observation_app(game, png((90, 90, 90)), settle, lock)
    result: dict[str, object] = {}
    thread = threading.Thread(target=lambda: result.update(r=get(app, "/pokebench/observation")))
    thread.start()
    thread.join(0.2)
    assert thread.is_alive(), "the observation waits for emulated frames, not for time"
    assert frames(game, settle, lock, thread, {3: (IDLE, LIT)}) == 3
    status, _, body = result["r"]  # type: ignore[misc]
    assert status == 200
    assert json.loads(body)["state_text"].startswith("Screen: ")


def test_c497_turns_410_to_427_would_each_have_been_held_by_the_settle() -> None:
    """Replay shape: every recorded press capture was fading or black-paletted.

    Six captures had gPaletteFade.active set (bag fade, y 10..16); twelve
    were taken after the fade finished while the next screen loaded with an
    all-zero palette. A fade-only wait would have missed those twelve.
    """
    rows = json.loads(FIXTURE.read_text())["rows"]
    assert [row["turn"] for row in rows] == list(range(410, 428))
    games = [
        Game(bytes.fromhex(r["palette_fade_hex"]), DARK if r["palette_ram_zero"] else LIT)
        for r in rows
    ]
    fading = [palette_fade_active(g.read) for g in games]
    black = [bool(r["palette_ram_zero"]) for r in rows]
    assert sum(fading) == 6
    assert sum(b and not f for f, b in zip(fading, black, strict=True)) == 12
    assert all(transitioning(g.read) for g in games)
    assert black == [r["frame_black"] for r in rows]
    assert {r["frame_sha1"] for r in rows if r["frame_black"]} == {
        "cf21bb4a34b28cbcb7809d05703574e20284147a"
    }
    assert {r["screen"] for r, f in zip(rows, fading, strict=True) if f} == {"bag_menu"}


def test_production_run_wires_the_frame_settle_into_the_observation_and_pause() -> None:
    from pokebench_env.serve import run

    game = Game(ACTIVE, LIT)
    lock = threading.Lock()
    app = FastAPI()
    module = types.SimpleNamespace(step_environment=lambda actions: None)

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            game.frame += 1

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(app, lambda: Shot(screenshot_base64=png((9, 9, 9))), game.read,
                     MapNames({}), lock),
        pause=(app, module),
        frames=Emulator,
    )
    result: dict[str, object] = {}
    thread = threading.Thread(target=lambda: result.update(r=get(app, "/pokebench/observation")))
    thread.start()
    thread.join(0.2)
    assert thread.is_alive()
    with lock:
        Emulator().run_frame_with_buttons([])
    thread.join(0.2)
    assert thread.is_alive(), "still fading after one frame"
    game.fade = IDLE
    with lock:
        Emulator().run_frame_with_buttons([])
    thread.join(5)
    assert not thread.is_alive()
    assert game.frame == 2

    game.fade = ACTIVE
    thread = threading.Thread(target=lambda: result.update(r=get(app, "/pokebench/observation")))
    thread.start()
    thread.join(0.2)
    assert thread.is_alive()
    with FrameLoop(module):
        assert post(app, "/pokebench/pause", b'{"paused": true}')[0] == 200
        thread.join(5)
        assert not thread.is_alive(), "parking the frame loop releases the waiting observation"
        assert FADING_NOTE in json.loads(result["r"][2])["state_text"]  # type: ignore[index]
        post(app, "/pokebench/pause", b'{"paused": false}')
