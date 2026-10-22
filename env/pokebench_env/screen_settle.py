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

warp-arrival-settle-v1 (ON only) also waits while field controls are locked and
one of the game's door/warp tasks is live in gTasks (pret
src/field_screen_effect.c: Task_DoDoorWarp, Task_WarpAndLoadMap and the three
warp-exit tasks). Address receipt: docs/findings/2026-10-16_warp-arrival-settle.md.
"""

import base64
import binascii
import threading
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass
from io import BytesIO
from typing import Generic, Literal, Protocol, TypeVar

from PIL import Image, UnidentifiedImageError

from pokebench_env.battle_choices import IN_BATTLE
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import FIELD_CONTROLS_LOCK
from pokebench_env.menus import PALETTE_FADE, task_snapshot
from pokebench_env.transition_coherence import main_loop_idle

PALETTE_RAM = 0x05000000
PALETTE_SIZE = 0x400
# BeginNormalPaletteFade: deltaY 2, so 0->16 takes 8 steps plus the step
# that clears `active`, each (delay + 1) frames, plus 2 frames of slack.
# Bound: a full fade at delay 15. Longer fades (delayCounter is 6 bits) hit
# the bound and the readout says the capture was still fading.
SETTLE_BOUND_FRAMES = (15 + 1) * 9 + 2

COHERENT_BATTLE_FEATURE = "coherent-battle-observation-v1"
COHERENCE_BOUND_FRAMES = 60
COHERENCE_TIMEOUT_SECONDS = 2.0
COHERENCE_NOTE = (
    "Frame: a coherent battle snapshot was not available within the capture wait; "
    "some readouts may be unavailable. Observe again before deciding."
)

WARP_FEATURE = "warp-arrival-settle-v1"
# Thumb task functions, US ROM f3ae0881 (ROM literal pools + live probe).
WARP_TASKS = {
    0x080AF439: "Task_ExitDoor",
    0x080AF551: "Task_ExitNonAnimDoor",
    0x080AF611: "Task_ExitNonDoor",
    0x080AFA0D: "Task_WarpAndLoadMap",
    0x080AFA89: "Task_DoDoorWarp",
}
# Longest measured chain, first locked frame to unlocked: 137 frames (Birch's
# lab -> Littleroot). About 2.2x that, for longer music fades and weather
# fade-ins; at the slowest recorded lane speed (42.8 frames/s) about 7 s, under
# the agent's 15 s observation fetch timeout.
WARP_SETTLE_BOUND_FRAMES = 300

SettleReason = Literal[
    "immediate",
    "paused",
    "fade",
    "warp",
    "fade_bound",
    "warp_bound",
    "input_hold",
    "move_learning",
    "move_learning_bound",
    "coherence",
    "coherence_bound",
    "coherence_timeout",
]
Motion = Literal["warp", "fade", "move_learning", "coherence"]

FADING_NOTE = (
    "Frame: captured while the screen was still fading (palette fade active); "
    "the image may be dark or black. Observe again before trusting it."
)
BLACK_NOTE = (
    "Frame: the screen is black in this frame (no palette fade active; "
    "the next screen may still be loading). Observe again before trusting it."
)

T = TypeVar("T")
BOUND_REASONS: dict[Motion, SettleReason] = {
    "coherence": "coherence_bound",
    "fade": "fade_bound",
    "warp": "warp_bound",
    "move_learning": "move_learning_bound",
}


def palette_fade_active(read: ReadMemory) -> bool:
    return bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)


def palette_black(read: ReadMemory) -> bool:
    return not any(read(PALETTE_RAM, PALETTE_SIZE))


def transitioning(read: ReadMemory) -> bool:
    return palette_fade_active(read) or palette_black(read)


def warp_task_live(read: ReadMemory) -> bool:
    return any(func in WARP_TASKS for _, func, _ in task_snapshot(read))


def warp_animating(read: ReadMemory) -> bool:
    """Field controls locked while a door/stairs/warp task holds the player."""
    return bool(read(FIELD_CONTROLS_LOCK, 1)[0]) and warp_task_live(read)


@dataclass(frozen=True)
class Settled:
    frames: int
    reason: SettleReason


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
        self.kind: Motion = "fade"
        self.reason: SettleReason = "fade"
        self.done = threading.Event()
        self.released = False
        self.result: T | None = None
        self.error: Exception | None = None


class FrameSettle:
    def __init__(
        self,
        read: ReadMemory,
        bound_frames: int = SETTLE_BOUND_FRAMES,
        *,
        warp: bool = False,
        warp_bound_frames: int = WARP_SETTLE_BOUND_FRAMES,
        coherent_battle: bool = False,
        coherence_bound_frames: int = COHERENCE_BOUND_FRAMES,
        coherence_timeout_seconds: float = COHERENCE_TIMEOUT_SECONDS,
    ) -> None:
        if coherence_bound_frames < 1 or not 0 < coherence_timeout_seconds < float("inf"):
            raise ValueError("coherence bounds must be positive and finite")
        self.coherent_battle = coherent_battle
        self.coherence_bound_frames = coherence_bound_frames
        self.coherence_timeout_seconds = coherence_timeout_seconds
        self.read = read
        self.bound_frames = bound_frames
        self.warp = warp
        self.warp_bound_frames = warp_bound_frames
        self._lock = threading.Lock()
        self._waiters: list[_Waiter[object]] = []
        self._parked = False
        # Configured before the server starts, only by an explicit input owner.
        self.capture_held: Callable[[], bool] | None = None
        # move-learn-settle-v1: configured before the server starts when the switch is on.
        self.move_learning: Callable[[], bool] | None = None
        self.move_learning_bound_frames = 0

    def on_frame(self) -> None:
        """After each emulated frame; the vendor holds its memory lock."""
        with self._lock:
            self._parked = False
            if not self._waiters:
                return
            try:
                held = self.capture_held is not None and self.capture_held()
                motion = None if held else self._motion()
            except Exception as error:  # noqa: BLE001 - re-raised on the callers' threads
                for waiter in self._waiters:
                    waiter.error = error
                    waiter.done.set()
                self._waiters = []
                return
            waiting: list[_Waiter[object]] = []
            for waiter in self._waiters:
                waiter.frames += 1
                if (
                    self.coherent_battle
                    and motion is not None
                    and (motion == "coherence" or waiter.kind == "coherence")
                ):
                    waiter.kind = motion
                elif waiter.kind == "fade" and motion is not None:
                    waiter.kind = motion
                elif waiter.kind == "move_learning" and motion == "warp":
                    waiter.kind = motion
                if motion is not None and waiter.frames < self._bound(waiter.kind):
                    waiting.append(waiter)
                    continue
                if held:
                    waiter.reason = "input_hold"
                elif motion is None:
                    waiter.reason = waiter.kind
                else:
                    waiter.reason = BOUND_REASONS[waiter.kind]
                try:
                    waiter.result = waiter.capture()
                except Exception as error:  # noqa: BLE001 - re-raised on the caller's thread
                    waiter.error = error
                waiter.done.set()
            self._waiters = waiting

    def _bound(self, kind: Motion) -> int:
        if kind == "coherence":
            return self.coherence_bound_frames
        if kind == "warp":
            return self.warp_bound_frames
        return self.move_learning_bound_frames if kind == "move_learning" else self.bound_frames

    def _motion(self) -> Motion | None:
        if self.warp and warp_animating(self.read):
            return "warp"
        if transitioning(self.read):
            return "fade"
        if self.move_learning is not None and self.move_learning():
            return "move_learning"
        # AgbMain may still be inside a callback at an emulator frame boundary.
        # Keep game_state's guard; wait for its existing predicate, never override it.
        if (
            self.coherent_battle
            and (
                bool(self.read(IN_BATTLE, 1)[0] & 2)
                or any(waiter.kind == "coherence" for waiter in self._waiters)
            )
            and main_loop_idle(self.read) is False
        ):
            return "coherence"
        return None

    def park(self) -> None:
        """The frame loop is parking (operator pause): no frames will come."""
        with self._lock:
            self._parked = True
            for waiter in self._waiters:
                waiter.released = True
                waiter.done.set()
            self._waiters = []

    def resume(self) -> None:
        """The pause ended: frames come again, so observations wait for them."""
        with self._lock:
            self._parked = False

    def settle(
        self,
        capture: Callable[[], T],
        memory_lock: AbstractContextManager[object],
        on_wait: Callable[[], None] | None = None,
    ) -> T:
        """Run `capture` (memory lock held) now if the screen is settled,
        else on the first settled emulated frame or at the frame bound."""
        return self.settle_traced(capture, memory_lock, on_wait)[0]

    def settle_traced(
        self,
        capture: Callable[[], T],
        memory_lock: AbstractContextManager[object],
        on_wait: Callable[[], None] | None = None,
    ) -> tuple[T, Settled]:
        """`settle`, plus the emulated frames waited and why the wait ended."""
        with memory_lock:
            with self._lock:
                if self._parked:
                    return capture(), Settled(0, "paused")
                if self.capture_held is not None and self.capture_held():
                    return capture(), Settled(0, "input_hold")
                motion = self._motion()
                if motion is None:
                    return capture(), Settled(0, "immediate")
                waiter: _Waiter[T] = _Waiter(capture)
                waiter.kind = motion
                self._waiters.append(waiter)  # type: ignore[arg-type]
        if on_wait is not None:
            on_wait()
        self._await_capture(waiter, memory_lock)
        if waiter.released:
            with memory_lock:
                return capture(), Settled(waiter.frames, "paused")
        if waiter.error is not None:
            raise waiter.error
        return waiter.result, Settled(waiter.frames, waiter.reason)  # type: ignore[return-value]

    def _await_capture(
        self, waiter: _Waiter[T], memory_lock: AbstractContextManager[object]
    ) -> None:
        # OFF keeps the original blocking Event wait exactly. ON only terminates
        # the newly added coherence wait; existing fade/warp bounds are unchanged.
        timeout = self.coherence_timeout_seconds if self.coherent_battle else None
        while not waiter.done.wait(timeout):
            with memory_lock:
                with self._lock:
                    if waiter.done.is_set() or waiter.kind != "coherence":
                        continue
                    self._waiters.remove(waiter)  # type: ignore[arg-type]
                    waiter.reason = "coherence_timeout"
                    try:
                        waiter.result = waiter.capture()
                    except Exception as error:  # noqa: BLE001 - delivered to requesting thread
                        waiter.error = error
                    waiter.done.set()


class SteppedEmulator(Protocol):
    run_frame_with_buttons: Callable[..., None]


def install_frame_settle(emulator: type[SteppedEmulator], settle: FrameSettle) -> None:
    step = emulator.run_frame_with_buttons

    def step_settling(self: SteppedEmulator, buttons: list[str]) -> None:
        step(self, buttons)
        settle.on_frame()

    emulator.run_frame_with_buttons = step_settling
