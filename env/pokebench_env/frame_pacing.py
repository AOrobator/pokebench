"""Absolute-deadline pacing for the pinned vendor game-loop seam."""

import math
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Protocol


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

    def __init__(self, clock: Clock, *, max_lateness_periods: int = 4) -> None:
        if max_lateness_periods < 1:
            raise ValueError("max_lateness_periods must be positive")
        self._clock = clock
        self._max_lateness_periods = max_lateness_periods
        self._local = threading.local()

    def time(self) -> float:
        return self._clock.time()

    def monotonic(self) -> float:
        return self._clock.monotonic()

    def sleep(self, seconds: float) -> None:
        state = getattr(self._local, "game_loop", None)
        if not isinstance(state, _LoopState):
            self._clock.sleep(seconds)
            return
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("game-loop cadence must be finite and positive")

        now = self._clock.monotonic()
        changed = state.period is not None and not math.isclose(
            state.period, seconds, rel_tol=0.0, abs_tol=1e-12
        )
        if state.deadline is None:
            deadline = state.started + seconds
        elif changed:
            # A dialog-speed transition starts a fresh cadence. Carrying an old
            # period forward can create a burst or an unnecessary long sleep.
            deadline = now + seconds
        else:
            deadline = state.deadline + seconds

        # A debugger pause, checkpoint, or unusually slow frame must not cause
        # an unbounded catch-up burst. Small overruns may catch up naturally;
        # large ones establish a new absolute schedule.
        if now - deadline > seconds * self._max_lateness_periods:
            deadline = now + seconds

        delay = deadline - now
        if delay > 0:
            self._clock.sleep(delay)
        state.period = seconds
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


def install_deadline_pacing(server: GameLoopServer) -> TimeProxy:
    """Install thread-local pacing without changing unrelated module sleeps."""

    proxy = TimeProxy(server.time)
    game_loop = server.game_loop

    def paced_game_loop(*args: object, **kwargs: object) -> object:
        with proxy.game_loop():
            return game_loop(*args, **kwargs)

    server.time = proxy
    server.game_loop = paced_game_loop
    return proxy
