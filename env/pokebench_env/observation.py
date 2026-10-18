"""Owned agent observation: the RAM-derived readout and state plus the frame.

Game state comes from PokeBench's own reader (game_state.py); the vendor
supplies only the emulator and its plain screenshot. Vendor code stays pristine.
"""

import os
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from pokebench_env.battle_text import WAIT_BOUND_FRAMES, BattleWait
from pokebench_env.blackout_readout import Whiteout, WhiteoutLatch
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.places import PlaceDirectory
from pokebench_env.raw_ram import RawRamArchive, raw_reference
from pokebench_env.readout import features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.screen_settle import (
    WARP_FEATURE,
    FrameSettle,
    Settled,
    frame_is_black,
    palette_fade_active,
    screen_note,
    warp_animating,
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
    battle_wait: BattleWait | None = None,
    whiteout: WhiteoutLatch | None = None,
) -> Callable[[], dict[str, object]]:
    enabled = active_ui_enabled_from_env(os.environ)
    off = features_off_from_env(os.environ)
    warp = WARP_FEATURE not in off

    def serialize() -> dict[str, object]:
        """The typed state; the caller holds the memory lock."""
        receipt = None if raw_capture is None else raw_capture()
        decoded = read_state(read_memory, maps, active_ui=enabled, off=off)
        serialized = state_json(decoded)
        if receipt is not None:
            serialized["raw_ram"] = raw_reference(receipt)
        if raw_archive is not None and receipt is not None:
            raw_archive.pair(receipt, serialized, None)
        return serialized

    def snapshot() -> dict[str, object]:
        with memory_lock if memory_lock is not None else nullcontext():
            return serialize()

    def capture() -> tuple[
        dict[str, object] | None, GameState, dict[str, object], dict[str, object], bool, bool, int
    ]:
        receipt = None if raw_capture is None else raw_capture()
        # blackout-readout-v1: the frame this state dates from, read under the same lock.
        seen = 0 if whiteout is None else whiteout.mark()
        state = read_state(read_memory, maps, active_ui=enabled, off=off)
        serialized = state_json(state)
        if receipt is not None:
            serialized["raw_ram"] = raw_reference(receipt)
        shot = get_screenshot().model_dump()
        fading = palette_fade_active(read_memory)
        animation = warp and warp_animating(read_memory)
        return receipt, state, serialized, shot, fading, animation, seen

    @app.get("/pokebench/observation")
    def observation() -> dict[str, object]:
        lock = memory_lock if memory_lock is not None else nullcontext()
        settled: Settled | None = None
        if settle is not None:
            captured, settled = settle.settle_traced(capture, lock)
            receipt, state, serialized, shot, fading, animation, seen = captured
        else:
            with lock:
                receipt, state, serialized, shot, fading, animation, seen = capture()
        screenshot = shot.get("screenshot_base64")
        if not isinstance(screenshot, str) or screenshot == "":
            raise HTTPException(status_code=503, detail="no screenshot available")
        if warp and settled is not None:
            serialized["settle"] = {"frames": settled.frames, "reason": settled.reason}
        note = screen_note(fading=fading, black=frame_is_black(screenshot))
        # blackout-readout-v1: taken only once this observation will be delivered, and
        # rendered before another observation may take one (put back if rendering fails).
        with whiteout.delivering if whiteout is not None else nullcontext():
            event: Whiteout | None = None if whiteout is None else whiteout.take(state, seen)
            try:
                text = render(state, off, warp_animation=animation, whiteout=event)
                if event is not None:
                    serialized["blackout_receipt"] = {
                        "frame": event.frame,
                        "money_before": event.money_before,
                    }
                if raw_archive is not None and receipt is not None:
                    raw_archive.pair(receipt, serialized, screenshot)
            except BaseException:
                if whiteout is not None and event is not None:
                    whiteout.put_back(event)
                raise
        return {
            **({"raw_ram": receipt} if receipt is not None else {}),
            "state_text": (f"{note}\n" if note else "") + text,
            "screenshot_base64": screenshot,
            "state": serialized,
        }

    @app.get("/pokebench/state")
    def state() -> dict[str, object]:
        return snapshot()

    # story-destinations-v1 (agent side) reads the game's map table here; it changes nothing the
    # model sees. Names follow the readout: displayed-place-names-v1 decides which names it shows.
    directory = PlaceDirectory(read_memory, maps)
    displayed = "displayed-place-names-v1" not in off

    @app.get("/pokebench/places")
    def places() -> dict[str, object]:
        with memory_lock if memory_lock is not None else nullcontext():
            return {"places": [place.json() for place in directory.places(displayed=displayed)]}

    if battle_wait is not None:
        wait = battle_wait

        # The state on the first emulated frame where the battle needs input, leaves
        # the battle screen or returns to the field; bounded in frames, never wall time.
        @app.get("/pokebench/battle/wait")
        def battle_wait_state(
            max_frames: int = Query(default=WAIT_BOUND_FRAMES, ge=1, le=3600),
        ) -> dict[str, object]:
            lock = memory_lock if memory_lock is not None else nullcontext()
            captured, reason, frames = wait.wait(serialize, lock, max_frames)
            return {"reason": reason, "frames": frames, "state": captured}

    return observation
