"""Operator pause: hold the vendor frame loop between frames.

The vendor game loop calls its module-level `step_environment` once per frame.
Wrapping that name (vendor code unmodified) lets an operator pause stop frame
emulation, so play time and the screen hold, while HTTP routes stay available.
The cartridge real-time clock follows host time and is not paused.
"""

import threading
from collections.abc import Callable
from typing import Protocol

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

# How long a pause waits for the frame in progress to finish.
PARK_TIMEOUT_S = 2.0


class SteppingServer(Protocol):
    step_environment: Callable[[list[str]], None]


class PauseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    paused: bool


def install_pause(
    api: FastAPI,
    server: SteppingServer,
    park_timeout_s: float = PARK_TIMEOUT_S,
    input_pause: Callable[[bool], None] | None = None,
) -> None:
    latch = threading.Condition()
    state = {"paused": False, "parked": False}
    step = server.step_environment

    def paused_step(actions: list[str]) -> None:
        with latch:
            while state["paused"]:
                state["parked"] = True
                latch.notify_all()
                latch.wait()
            state["parked"] = False
        step(actions)

    server.step_environment = paused_step

    # A pause is confirmed only once the frame loop has parked for this request,
    # so the frame in progress has finished. A pause that cannot be confirmed is
    # rolled back, so the emulator never freezes behind a failed request.
    @api.post("/pokebench/pause")
    def pause(request: PauseRequest) -> dict[str, bool]:
        with latch:
            if input_pause is not None:
                input_pause(request.paused)
            if not request.paused:
                state["paused"] = False
                latch.notify_all()
                return {"paused": False}
            state["paused"] = True
            state["parked"] = False
            if not latch.wait_for(lambda: state["parked"], park_timeout_s):
                state["paused"] = False
                if input_pause is not None:
                    input_pause(False)
                latch.notify_all()
                raise HTTPException(status_code=503, detail="frame loop did not park")
            return {"paused": True}
