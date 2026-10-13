"""Frame-held human input on an isolated server; vendor sources stay untouched."""

import secrets
import threading
import time
from collections import deque
from collections.abc import Callable
from typing import Annotated, Protocol, TypedDict

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

BUTTONS = frozenset(("A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT", "L", "R"))
FRAME_S = 1 / 59.7275
WATCHDOG_S = 0.75


class Segment(TypedDict):
    id: int
    start_frame: int
    end_frame: int
    buttons: list[str]
    start_ms: int
    end_ms: int
    request_seq: int
    session: str


class HumanController:
    def __init__(
        self, clock: Callable[[], float] = time.monotonic, max_segments: int = 2048
    ) -> None:
        self.clock = clock
        self.lock = threading.RLock()
        self.session: str | None = None
        self.retired: set[str] = set()
        self.seq = 0
        self.last_input = clock()
        self.paused = False
        self.pending: deque[tuple[list[str], int, str]] = deque()
        self.buttons: list[str] = []
        self.source_seq = 0
        self.source_session = "idle"
        self.frames = 0
        self.segment_start = 0
        self.segment_ms = round(time.time() * 1000)
        self.segment_id = 0
        self.segments: deque[Segment] = deque()
        self.max_segments = max_segments
        self.failed = False

    def _release(self) -> None:
        if self.session is not None:
            self.retired.add(self.session)
        self.session = None
        self.pending.clear()
        self._close_segment()
        self.buttons = []
        self.source_seq = 0
        self.source_session = "idle"

    def _expire(self) -> None:
        if self.session is not None and self.clock() - self.last_input >= WATCHDOG_S:
            self._release()

    def claim(self, session: str) -> None:
        with self.lock:
            self._expire()
            if self.paused or self.failed or session in self.retired:
                raise ValueError("input session unavailable; acquire a fresh session")
            if self.session is not None:
                raise ValueError("another input session owns this game")
            self.session = session
            self.seq = 0
            self.last_input = self.clock()

    def input(self, session: str, seq: int, buttons: list[str], release: bool = False) -> None:
        with self.lock:
            self._expire()
            if self.paused or self.failed or session != self.session:
                raise ValueError("input session is stale or paused")
            if seq <= self.seq or len(buttons) != len(set(buttons)) or not set(buttons) <= BUTTONS:
                raise ValueError("invalid input sequence or buttons")
            if release:
                if buttons:
                    raise ValueError("release must contain no buttons")
                self.seq = seq
                self._release()
                return
            if len(self.pending) >= 64:
                self._release()
                raise ValueError("input queue full; released buttons")
            self.seq = seq
            self.last_input = self.clock()
            previous = self.pending[-1][0] if self.pending else self.buttons
            if previous != buttons:
                self.pending.append((list(buttons), seq, session))

    def set_paused(self, paused: bool) -> None:
        with self.lock:
            self._release()
            self.paused = paused

    def _close_segment(self) -> None:
        boundary_ms = round(time.time() * 1000)
        if self.segment_start == self.frames:
            # No applied frames own this interval; reset the next hold boundary,
            # including pause/resume before any idle frame has been stepped.
            self.segment_ms = boundary_ms
            return
        if len(self.segments) >= self.max_segments:
            self.failed = True
            self.buttons = []
            self.pending.clear()
            raise ValueError("recording journal full; human input disabled")
        self.segment_id += 1
        self.segments.append(
            {
                "id": self.segment_id,
                "start_frame": self.segment_start,
                "end_frame": self.frames,
                "buttons": list(self.buttons),
                "start_ms": self.segment_ms,
                "end_ms": boundary_ms,
                "request_seq": self.source_seq,
                "session": self.source_session,
            }
        )
        self.segment_start = self.frames
        self.segment_ms = boundary_ms

    def frame(self, step: Callable[[list[str]], None] = lambda _: None) -> list[str]:
        with self.lock:
            self._expire()
            if self.pending:
                self._close_segment()
                self.buttons, self.source_seq, self.source_session = self.pending.popleft()
            buttons = list(self.buttons)
            step(buttons)
            self.frames += 1
            return buttons

    def snapshot(self, after: int) -> dict[str, object]:
        with self.lock:
            if after > self.segment_id:
                raise ValueError("recording cursor ahead of journal")
            while self.segments and self.segments[0]["id"] <= after:
                self.segments.popleft()
            self._close_segment()
            return {
                "frame": self.frames,
                "paused": self.paused,
                "failed": self.failed,
                "segments": list(self.segments),
                "last_id": self.segment_id,
            }


class HumanServer(Protocol):
    step_environment: Callable[[list[str]], None]
    fps: float


class Claim(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    session: str = Field(pattern=r"^[A-Za-z0-9_-]{8,128}$")


class Input(Claim):
    seq: int = Field(ge=1)
    buttons: list[str] = Field(max_length=10)
    release: bool = False


def install_human(
    api: FastAPI,
    server: HumanServer,
    token: str,
    *,
    pace: bool = True,
    observe: Callable[[], dict[str, object]] | None = None,
) -> HumanController:
    human = HumanController()
    step = server.step_environment
    # Human pacing replaces vendor idle/dialogue sleep, only in this server.
    server.fps = 10**9
    deadline = [time.monotonic()]

    def human_step(_actions: list[str]) -> None:
        if pace:
            time.sleep(max(0, deadline[0] - time.monotonic()))
            deadline[0] = max(deadline[0] + FRAME_S, time.monotonic())
        human.frame(step)

    server.step_environment = human_step

    def authorize(value: str) -> None:
        if not secrets.compare_digest(value, token):
            raise HTTPException(403, "human server credential required")

    @api.post("/pokebench/human/claim")
    def claim(body: Claim, x_human_token: Annotated[str, Header()] = "") -> dict[str, bool]:
        authorize(x_human_token)
        try:
            human.claim(body.session)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        return {"accepted": True}

    @api.post("/pokebench/human/input")
    def input_buttons(body: Input, x_human_token: Annotated[str, Header()] = "") -> dict[str, bool]:
        authorize(x_human_token)
        try:
            human.input(body.session, body.seq, body.buttons, body.release)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        return {"accepted": True}

    @api.get("/pokebench/human/snapshot")
    def snapshot(
        after: Annotated[int, Query(ge=0)] = 0, x_human_token: Annotated[str, Header()] = ""
    ) -> dict[str, object]:
        authorize(x_human_token)
        try:
            with human.lock:
                result = human.snapshot(after)
                if observe is not None:
                    result["observation"] = observe()
                return result
        except ValueError as error:
            raise HTTPException(503, str(error)) from error

    return human
