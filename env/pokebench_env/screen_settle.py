"""Capture observations on the first emulated frame after a screen transition.

A transition is a palette fade (`gPaletteFade.active`) or the black loading
frames between a fade-out and the next screen's fade-in, when every palette
colour is zero. pret include/palette.h `struct PaletteFadeControl`: u32
multipurpose1, u8 delayCounter:6 / u16 y:5, targetY:5 / u16 blendColor:15,
active:1, so `active` is bit 7 of byte 7. Address receipt:
docs/findings/2026-10-15_fade-settle.md.

The settle is driven by the vendor's own frame stepping: the hook runs after
each emulated frame (under the vendor memory lock) and only does work while an
observation is waiting. The bound is in emulated frames.
"""

import base64
import binascii
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from io import BytesIO
from typing import Generic, Protocol, TypeVar

from PIL import Image, UnidentifiedImageError

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import PALETTE_FADE

PALETTE_RAM = 0x05000000
PALETTE_SIZE = 0x400
# BeginNormalPaletteFade: deltaY 2, so 0->16 takes 8 steps of (delay + 1)
# frames plus the finishing frames. Bound: a full fade at delay 15.
SETTLE_BOUND_FRAMES = (15 + 1) * 9 + 2

FADING_NOTE = (
    "Frame: captured while the screen was still fading (palette fade active); "
    "the image may be dark or black. Observe again before trusting it."
)
BLACK_NOTE = (
    "Frame: the screen is black in this frame (no palette fade active; "
    "the next screen may still be loading). Observe again before trusting it."
)

T = TypeVar("T")


def palette_fade_active(read: ReadMemory) -> bool:
    return bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)


def palette_black(read: ReadMemory) -> bool:
    return not any(read(PALETTE_RAM, PALETTE_SIZE))


def transitioning(read: ReadMemory) -> bool:
    return palette_fade_active(read) or palette_black(read)


def frame_is_black(screenshot_base64: str) -> bool:
    try:
        raw = base64.b64decode(screenshot_base64, validate=True)
        with Image.open(BytesIO(raw)) as image:
            extrema = image.convert("RGB").getextrema()
    except (binascii.Error, UnidentifiedImageError, OSError, ValueError):
        return False
    return all(high == 0 for _, high in extrema)  # type: ignore[misc]


def screen_note(*, fading: bool, black: bool) -> str:
    if fading:
        return FADING_NOTE
    return BLACK_NOTE if black else ""


class _Waiter(Generic[T]):
    def __init__(self, capture: Callable[[], T]) -> None:
        self.capture = capture
        self.frames = 0
        self.done = threading.Event()
        self.released = False
        self.result: T | None = None
        self.error: Exception | None = None


class FrameSettle:
    def __init__(self, read: ReadMemory, bound_frames: int = SETTLE_BOUND_FRAMES) -> None:
        self.read = read
        self.bound_frames = bound_frames
        self._lock = threading.Lock()
        self._waiters: list[_Waiter[object]] = []
        self._parked = False

    def on_frame(self) -> None:
        """After each emulated frame; the vendor holds its memory lock."""
        with self._lock:
            self._parked = False
            if not self._waiters:
                return
            moving = transitioning(self.read)
            waiting: list[_Waiter[object]] = []
            for waiter in self._waiters:
                waiter.frames += 1
                if moving and waiter.frames < self.bound_frames:
                    waiting.append(waiter)
                    continue
                try:
                    waiter.result = waiter.capture()
                except Exception as error:  # noqa: BLE001 - re-raised on the caller's thread
                    waiter.error = error
                waiter.done.set()
            self._waiters = waiting

    def release(self) -> None:
        """The frame loop is parking (operator pause): no frames will come."""
        with self._lock:
            self._parked = True
            for waiter in self._waiters:
                waiter.released = True
                waiter.done.set()
            self._waiters = []

    def settle(
        self,
        capture: Callable[[], T],
        memory_lock: AbstractContextManager[object],
        on_wait: Callable[[], None] | None = None,
    ) -> T:
        """Run `capture` (memory lock held) now if the screen is settled,
        else on the first settled emulated frame or at the frame bound."""
        with memory_lock:
            with self._lock:
                if self._parked or not transitioning(self.read):
                    return capture()
                waiter: _Waiter[T] = _Waiter(capture)
                self._waiters.append(waiter)  # type: ignore[arg-type]
        if on_wait is not None:
            on_wait()
        waiter.done.wait()
        if waiter.released:
            with memory_lock:
                return capture()
        if waiter.error is not None:
            raise waiter.error
        return waiter.result  # type: ignore[return-value]


class SteppedEmulator(Protocol):
    run_frame_with_buttons: Callable[..., None]


def install_frame_settle(emulator: type[SteppedEmulator], settle: FrameSettle) -> None:
    step = emulator.run_frame_with_buttons

    def step_settling(self: SteppedEmulator, buttons: list[str]) -> None:
        step(self, buttons)
        settle.on_frame()

    emulator.run_frame_with_buttons = step_settling
