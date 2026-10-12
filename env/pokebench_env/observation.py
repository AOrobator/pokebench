"""Owned agent observation: the RAM-derived readout and state plus the frame.

Game state comes from PokeBench's own reader (game_state.py); the vendor
supplies only the emulator and its plain screenshot. Vendor code stays pristine.
"""

from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames, read_game_state
from pokebench_env.readout import format_readout, state_json

ScreenshotFn = Callable[[], BaseModel]


def install_observation(
    app: FastAPI,
    get_screenshot: ScreenshotFn,
    read_memory: ReadMemory,
    maps: MapNames,
    memory_lock: AbstractContextManager[object] | None = None,
) -> None:
    def snapshot() -> GameState:
        with memory_lock if memory_lock is not None else nullcontext():
            return read_game_state(read_memory, maps)

    @app.get("/pokebench/observation")
    def observation() -> dict[str, object]:
        with memory_lock if memory_lock is not None else nullcontext():
            state = read_game_state(read_memory, maps)
            shot = get_screenshot().model_dump()
        screenshot = shot.get("screenshot_base64")
        if not isinstance(screenshot, str) or screenshot == "":
            raise HTTPException(status_code=503, detail="no screenshot available")
        return {
            "state_text": format_readout(state),
            "screenshot_base64": screenshot,
            "state": state_json(state),
        }

    @app.get("/pokebench/state")
    def state() -> dict[str, object]:
        return state_json(snapshot())
