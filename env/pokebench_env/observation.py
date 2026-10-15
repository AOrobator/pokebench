"""Owned agent observation: the RAM-derived readout and state plus the frame.

Game state comes from PokeBench's own reader (game_state.py); the vendor
supplies only the emulator and its plain screenshot. Vendor code stays pristine.
"""

import os
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.raw_ram import RawRamArchive, raw_reference
from pokebench_env.readout import features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.screen_settle import (
    FrameSettle,
    frame_is_black,
    palette_fade_active,
    screen_note,
)
from pokebench_env.ui_state import active_ui_enabled_from_env

ScreenshotFn = Callable[[], BaseModel]


def install_observation(
    app: FastAPI,
    get_screenshot: ScreenshotFn,
    read_memory: ReadMemory,
    maps: MapNames,
    memory_lock: AbstractContextManager[object] | None = None,
    *,
    raw_capture: Callable[[], dict[str, object]] | None = None,
    raw_archive: RawRamArchive | None = None,
    settle: FrameSettle | None = None,
) -> Callable[[], dict[str, object]]:
    enabled = active_ui_enabled_from_env(os.environ)
    off = features_off_from_env(os.environ)

    def snapshot() -> dict[str, object]:
        with memory_lock if memory_lock is not None else nullcontext():
            receipt = None if raw_capture is None else raw_capture()
            decoded = read_state(read_memory, maps, active_ui=enabled, off=off)
            serialized = state_json(decoded)
            if receipt is not None:
                serialized["raw_ram"] = raw_reference(receipt)
            if raw_archive is not None and receipt is not None:
                raw_archive.pair(receipt, serialized, None)
            return serialized

    def capture() -> tuple[
        dict[str, object] | None, GameState, dict[str, object], dict[str, object], bool
    ]:
        receipt = None if raw_capture is None else raw_capture()
        state = read_state(read_memory, maps, active_ui=enabled, off=off)
        serialized = state_json(state)
        if receipt is not None:
            serialized["raw_ram"] = raw_reference(receipt)
        shot = get_screenshot().model_dump()
        fading = palette_fade_active(read_memory)
        if raw_archive is not None and receipt is not None:
            raw_archive.pair(receipt, serialized, str(shot.get("screenshot_base64", "")))
        return receipt, state, serialized, shot, fading

    @app.get("/pokebench/observation")
    def observation() -> dict[str, object]:
        lock = memory_lock if memory_lock is not None else nullcontext()
        if settle is not None:
            receipt, state, serialized, shot, fading = settle.settle(capture, lock)
        else:
            with lock:
                receipt, state, serialized, shot, fading = capture()
        screenshot = shot.get("screenshot_base64")
        if not isinstance(screenshot, str) or screenshot == "":
            raise HTTPException(status_code=503, detail="no screenshot available")
        note = screen_note(fading=fading, black=frame_is_black(screenshot))
        return {
            **({"raw_ram": receipt} if receipt is not None else {}),
            "state_text": (f"{note}\n" if note else "") + render(state, off),
            "screenshot_base64": screenshot,
            "state": serialized,
        }

    @app.get("/pokebench/state")
    def state() -> dict[str, object]:
        return snapshot()

    return observation
