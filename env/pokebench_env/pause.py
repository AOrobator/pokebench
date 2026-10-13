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
    api: FastAPI, server: SteppingServer, park_timeout_s: float = PARK_TIMEOUT_S
) -> None:
    running = threading.Event()
    running.set()
    parked = threading.Event()
    step = server.step_environment

    def paused_step(actions: list[str]) -> None:
        if not running.is_set():
            parked.set()
            running.wait()
            parked.clear()
        step(actions)

    server.step_environment = paused_step

    # A pause is confirmed only once the frame loop is parked before its next
    # frame, so the frame in progress has finished.
    @api.post("/pokebench/pause")
    def pause(request: PauseRequest) -> dict[str, bool]:
        if not request.paused:
            running.set()
            return {"paused": False}
        running.clear()
        if not parked.wait(park_timeout_s):
            raise HTTPException(status_code=503, detail="frame loop did not park")
        return {"paused": True}
