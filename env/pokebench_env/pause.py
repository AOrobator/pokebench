"""Operator pause: hold the vendor frame loop between frames.

The vendor game loop calls its module-level `step_environment` once per frame.
Wrapping that name (vendor code unmodified) lets an operator pause stop frame
emulation, so play time and the screen hold, while HTTP routes stay available.
The cartridge real-time clock follows host time and is not paused.
"""

import threading
from collections.abc import Callable
from typing import Protocol

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict


class SteppingServer(Protocol):
    step_environment: Callable[[list[str]], None]


class PauseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    paused: bool


def install_pause(api: FastAPI, server: SteppingServer) -> None:
    running = threading.Event()
    running.set()
    step = server.step_environment

    def paused_step(actions: list[str]) -> None:
        running.wait()
        step(actions)

    server.step_environment = paused_step

    @api.post("/pokebench/pause")
    def pause(request: PauseRequest) -> dict[str, bool]:
        if request.paused:
            running.clear()
        else:
            running.set()
        return {"paused": request.paused}
