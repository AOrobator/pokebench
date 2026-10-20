"""Owned agent observation: the RAM-derived readout and state plus the frame.

Game state comes from PokeBench's own reader (game_state.py); the vendor
supplies only the emulator and its plain screenshot. Vendor code stays pristine.
"""

import os
from collections.abc import Callable
from contextlib import AbstractContextManager, nullcontext

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from pokebench_env.battle_text import WAIT_BOUND_FRAMES, BattleWait
from pokebench_env.blackout_readout import Whiteout, WhiteoutLatch, whiteout_line
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.places import PlaceDirectory
from pokebench_env.raw_ram import RawRamArchive, RawRamSnapshot, Reservation, raw_reference
from pokebench_env.readout import features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.respawn import SWITCH as RESPAWN
from pokebench_env.respawn import LinkCache, RespawnMemory
from pokebench_env.screen_settle import (
    WARP_FEATURE,
    FrameSettle,
    Settled,
    frame_is_black,
    palette_fade_active,
    screen_note,
    warp_animating,
)
from pokebench_env.trainer_sight import MAX_ROUTE_TILES, sight_report
from pokebench_env.ui_state import active_ui_enabled_from_env

ScreenshotFn = Callable[[], BaseModel | Callable[[], BaseModel]]
RawSnapshotFn = Callable[[Reservation], RawRamSnapshot]


class TrainerSightRequest(BaseModel):
    map_id: tuple[int, int]
    tiles: list[tuple[int, int]] = Field(max_length=MAX_ROUTE_TILES)


def install_observation(
    app: FastAPI,
    get_screenshot: ScreenshotFn,
    read_memory: ReadMemory,
    maps: MapNames,
    memory_lock: AbstractContextManager[object] | None = None,
    *,
    raw_capture: Callable[[], dict[str, object]] | None = None,
    raw_snapshot: RawSnapshotFn | None = None,
    raw_rom: bytes | None = None,
    raw_archive: RawRamArchive | None = None,
    settle: FrameSettle | None = None,
    battle_wait: BattleWait | None = None,
    whiteout: WhiteoutLatch | None = None,
) -> Callable[[], dict[str, object]]:
    if raw_snapshot is not None and raw_archive is None:
        raise ValueError("raw_snapshot requires raw_archive")
    if raw_snapshot is not None and raw_capture is not None:
        raise ValueError("raw_snapshot and raw_capture are mutually exclusive")
    enabled = active_ui_enabled_from_env(os.environ)
    off = features_off_from_env(os.environ)
    warp = WARP_FEATURE not in off
    # respawn-readout-v1: the map table read once, and the centers this server saw entered.
    links = LinkCache() if RESPAWN not in off else None
    memory = RespawnMemory() if RESPAWN not in off else None

    def decode(read: ReadMemory) -> GameState:
        state = read_state(read, maps, active_ui=enabled, off=off, links=links)
        if memory is not None:
            memory.note(state)
        return state

    def realize_screenshot(value: BaseModel | Callable[[], BaseModel]) -> dict[str, object]:
        return (value() if callable(value) else value).model_dump()

    def decode_snapshot(snapshot: RawRamSnapshot) -> tuple[GameState, dict[str, object]]:
        state = decode(snapshot.reader(raw_rom))
        return state, state_json(state)

    def finish_snapshot(
        reservation: Reservation,
        snapshot: RawRamSnapshot,
        *,
        screenshot: BaseModel | Callable[[], BaseModel] | None = None,
        error: BaseException | None = None,
    ) -> tuple[dict[str, object], GameState, dict[str, object], dict[str, object] | None]:
        assert raw_archive is not None
        future = raw_archive.start_capture(reservation, snapshot)
        decode_error = error
        state: GameState | None = None
        serialized: dict[str, object] | None = None
        shot: dict[str, object] | None = None
        if decode_error is None:
            try:
                state, serialized = decode_snapshot(snapshot)
                if screenshot is not None:
                    shot = realize_screenshot(screenshot)
            except BaseException as caught:
                decode_error = caught
        # Persistence deliberately precedes decode errors: a failed readout
        # still has a durable raw receipt, matching the legacy contract.
        receipt = raw_archive.finish_capture(reservation, future)
        if decode_error is not None:
            raise decode_error
        assert state is not None and serialized is not None
        serialized["raw_ram"] = raw_reference(receipt)
        return receipt, state, serialized, shot

    def serialize() -> dict[str, object]:
        """The typed state; the caller holds the memory lock."""
        receipt = None if raw_capture is None else raw_capture()
        decoded = decode(read_memory)
        serialized = state_json(decoded)
        if receipt is not None:
            serialized["raw_ram"] = raw_reference(receipt)
        if raw_archive is not None and receipt is not None:
            raw_archive.pair(receipt, serialized, None)
        return serialized

    def snapshot() -> dict[str, object]:
        if raw_snapshot is not None:
            assert raw_archive is not None
            with raw_archive.reserve() as reservation:
                with memory_lock if memory_lock is not None else nullcontext():
                    frozen = raw_snapshot(reservation)
                receipt, _, serialized, _ = finish_snapshot(reservation, frozen)
            raw_archive.pair(receipt, serialized, None)
            return serialized
        with memory_lock if memory_lock is not None else nullcontext():
            return serialize()

    def capture() -> tuple[
        dict[str, object] | None, GameState, dict[str, object], dict[str, object], bool, bool, int
    ]:
        receipt = None if raw_capture is None else raw_capture()
        # blackout-readout-v1: the frame this state dates from, read under the same lock.
        seen = 0 if whiteout is None else whiteout.mark()
        state = decode(read_memory)
        serialized = state_json(state)
        if receipt is not None:
            serialized["raw_ram"] = raw_reference(receipt)
        shot = realize_screenshot(get_screenshot())
        fading = palette_fade_active(read_memory)
        animation = warp and warp_animating(read_memory)
        # Preserve the legacy OFF path: archive pairing stays under the frame
        # lock. ON waits until the receipt has been added below.
        if raw_archive is not None and receipt is not None and whiteout is None:
            raw_archive.pair(receipt, serialized, str(shot.get("screenshot_base64", "")))
        return receipt, state, serialized, shot, fading, animation, seen

    def capture_frozen(
        reservation: Reservation,
    ) -> tuple[
        RawRamSnapshot,
        BaseModel | Callable[[], BaseModel] | None,
        bool,
        bool,
        int,
        BaseException | None,
    ]:
        """Frame callback half: immutable copies only, no decode/PNG/disk work."""

        assert raw_snapshot is not None
        frozen = raw_snapshot(reservation)
        try:
            seen = 0 if whiteout is None else whiteout.mark()
            screenshot = get_screenshot()
            fading = palette_fade_active(read_memory)
            animation = warp and warp_animating(read_memory)
            return frozen, screenshot, fading, animation, seen, None
        except BaseException as error:
            # The raw snapshot must remain durable even when a later atomic
            # read or screenshot copy fails.
            return frozen, None, False, False, 0, error

    @app.get("/pokebench/observation")
    def observation() -> dict[str, object]:
        lock = memory_lock if memory_lock is not None else nullcontext()
        settled: Settled | None = None
        receipt: dict[str, object] | None
        state: GameState
        serialized: dict[str, object]
        shot: dict[str, object]
        if raw_snapshot is not None:
            assert raw_archive is not None
            with raw_archive.reserve() as reservation:
                if settle is not None:
                    frozen_capture, settled = settle.settle_traced(
                        lambda: capture_frozen(reservation), lock
                    )
                else:
                    with lock:
                        frozen_capture = capture_frozen(reservation)
                frozen, screenshot_source, fading, animation, seen, error = frozen_capture
                receipt, state, serialized, maybe_shot = finish_snapshot(
                    reservation, frozen, screenshot=screenshot_source, error=error
                )
            assert maybe_shot is not None
            shot = maybe_shot
        elif settle is not None:
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
                text = render(
                    state, off, warp_animation=animation, whiteout=event, respawn_memory=memory
                )
                if event is not None:
                    serialized["blackout_receipt"] = {
                        "frame": event.frame,
                        "money_before": event.money_before,
                        "notice": whiteout_line(event, state),
                    }
                if (
                    raw_archive is not None
                    and receipt is not None
                    and (whiteout is not None or raw_snapshot is not None)
                ):
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

    # trainer-sight-check-v1 (agent side) posts navigate_to's planned route here before it walks; it
    # changes nothing the model sees and is called only with that switch on.
    @app.post("/pokebench/trainer-sight")
    def trainer_sight(body: TrainerSightRequest) -> dict[str, object]:
        with memory_lock if memory_lock is not None else nullcontext():
            return sight_report(read_memory, body.map_id, body.tiles)

    if battle_wait is not None:
        wait = battle_wait

        # The state on the first emulated frame where the battle needs input, leaves
        # the battle screen or returns to the field; bounded in frames, never wall time.
        @app.get("/pokebench/battle/wait")
        def battle_wait_state(
            max_frames: int = Query(default=WAIT_BOUND_FRAMES, ge=1, le=3600),
        ) -> dict[str, object]:
            lock = memory_lock if memory_lock is not None else nullcontext()
            if raw_snapshot is not None:
                assert raw_archive is not None
                with raw_archive.reserve() as reservation:
                    frozen, reason, frames = wait.wait(
                        lambda: raw_snapshot(reservation), lock, max_frames
                    )
                    receipt, _, captured, _ = finish_snapshot(reservation, frozen)
                raw_archive.pair(receipt, captured, None)
            else:
                captured, reason, frames = wait.wait(serialize, lock, max_frames)
            return {"reason": reason, "frames": frames, "state": captured}

    return observation
