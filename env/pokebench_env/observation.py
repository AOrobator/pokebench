"""Owned agent observation: the RAM-derived readout and state plus the frame.

Game state comes from PokeBench's own reader (game_state.py); the vendor
supplies only the emulator and its plain screenshot. Vendor code stays pristine.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.readout import format_readout, state_json

ScreenshotFn = Callable[[], Awaitable[BaseModel]]


def install_observation(
    app: FastAPI, get_screenshot: ScreenshotFn, read_memory: ReadMemory, maps: MapNames
) -> None:
    @app.get("/pokebench/observation")
    async def observation() -> dict[str, object]:
        shot = (await get_screenshot()).model_dump()
        screenshot = shot.get("screenshot_base64")
        if not isinstance(screenshot, str) or screenshot == "":
            raise HTTPException(status_code=503, detail="no screenshot available")
        state = read_game_state(read_memory, maps)
        return {
            "state_text": format_readout(state),
            "screenshot_base64": screenshot,
            "state": state_json(state),
        }

    @app.get("/pokebench/state")
    def state() -> dict[str, object]:
        return state_json(read_game_state(read_memory, maps))
