"""Absolute-deadline pacing for the pinned vendor game-loop seam."""

import math
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Protocol

EMERALD_REALTIME_FPS = 59.7275
VENDOR_BASE_FPS = 80.0


class Clock(Protocol):
    def time(self) -> float: ...

    def monotonic(self) -> float: ...

    def sleep(self, seconds: float) -> None: ...


@dataclass
class _LoopState:
    started: float
    period: float | None = None
    deadline: float | None = None


class TimeProxy:
    """Delegate normal clock use and pace sleep only in the game-loop thread."""

    def __init__(
        self,
        clock: Clock,
        *,
        period_scale: float = 1.0,
        max_lateness_periods: int = 4,
    ) -> None:
        if not math.isfinite(period_scale) or period_scale <= 0:
            raise ValueError("period_scale must be finite and positive")
        if max_lateness_periods < 1:
            raise ValueError("max_lateness_periods must be positive")
        self._clock = clock
        self._period_scale = period_scale
        self._max_lateness_periods = max_lateness_periods
        self._local = threading.local()

    def time(self) -> float:
        return self._clock.time()

    def monotonic(self) -> float:
        return self._clock.monotonic()

    def __getattr__(self, name: str) -> object:
        """Remain a transparent module proxy outside the paced sleep seam."""

        return getattr(self._clock, name)

    def sleep(self, seconds: float) -> None:
        state = getattr(self._local, "game_loop", None)
        if not isinstance(state, _LoopState):
            self._clock.sleep(seconds)
            return
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("game-loop cadence must be finite and positive")

        period = seconds * self._period_scale
        now = self._clock.monotonic()
        changed = state.period is not None and not math.isclose(
            state.period, period, rel_tol=0.0, abs_tol=1e-12
        )
        if state.deadline is None:
            deadline = state.started + period
        elif changed:
            # A dialog-speed transition starts a fresh cadence. Carrying an old
            # period forward can create a burst or an unnecessary long sleep.
            deadline = now + period
        else:
            deadline = state.deadline + period

        # A debugger pause, checkpoint, or unusually slow frame must not cause
        # an unbounded catch-up burst. Small overruns may catch up naturally;
        # large ones establish a new absolute schedule.
        if now - deadline > period * self._max_lateness_periods:
            deadline = now + period

        delay = deadline - now
        if delay > 0:
            self._clock.sleep(delay)
        state.period = period
        state.deadline = deadline

    @contextmanager
    def game_loop(self) -> Iterator[None]:
        if isinstance(getattr(self._local, "game_loop", None), _LoopState):
            raise RuntimeError("game-loop pacing context cannot be nested")
        self._local.game_loop = _LoopState(started=self._clock.monotonic())
        try:
            yield
        finally:
            del self._local.game_loop


class GameLoopServer(Protocol):
    time: Clock
    game_loop: Callable[..., object]


def install_deadline_pacing(
    server: GameLoopServer,
    *,
    source_fps: float = EMERALD_REALTIME_FPS,
    vendor_base_fps: float = VENDOR_BASE_FPS,
) -> TimeProxy:
    """Install real-time, thread-local pacing without changing unrelated sleeps.

    The pinned server requests 80 FPS (320 during its fast-dialog mode). Scaling
    those periods preserves the mode ratio while keeping the base emulator at
    Emerald's nominal 59.7275 FPS instead of accelerating idle game evolution.
    """

    if not math.isfinite(source_fps) or source_fps <= 0:
        raise ValueError("source_fps must be finite and positive")
    if not math.isfinite(vendor_base_fps) or vendor_base_fps <= 0:
        raise ValueError("vendor_base_fps must be finite and positive")
    proxy = TimeProxy(server.time, period_scale=vendor_base_fps / source_fps)
    game_loop = server.game_loop

    def paced_game_loop(*args: object, **kwargs: object) -> object:
        with proxy.game_loop():
            return game_loop(*args, **kwargs)

    server.time = proxy
    server.game_loop = paced_game_loop
    return proxy
