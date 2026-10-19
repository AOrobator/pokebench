"""Run the vendor game server's own `main()`, bound to 127.0.0.1.

The vendor `server.app.main()` hardcodes `uvicorn.run(host="0.0.0.0")`, which
would expose emulator control (save/load state, actions) on the LAN. Wrapping
`uvicorn.run` keeps the vendor code unmodified. Must run with the vendor
checkout on `sys.path`; the working directory is the run's server dir (INV-7).
"""

import asyncio
import base64
import math
import os
import sys
import threading
import time
from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from io import BytesIO
from pathlib import Path
from typing import Protocol, cast

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from PIL import Image
from pydantic import BaseModel

from pokebench_env.action_history import install_action_history
from pokebench_env.audio import EmulatorLike
from pokebench_env.battle_choices import FrameEmulator, install_battle_journal
from pokebench_env.battle_text import BattleWait, install_battle_text, install_battle_wait
from pokebench_env.blackout_readout import SWITCH as BLACKOUT
from pokebench_env.blackout_readout import WhiteoutLatch, install_whiteout_latch
from pokebench_env.checkpoint import install_checkpoint
from pokebench_env.evolution_decision import SWITCH as EVOLUTION
from pokebench_env.evolution_decision import install_evolution_decision
from pokebench_env.frame_pacing import VENDOR_BASE_FPS, GameLoopServer, install_deadline_pacing
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import MapNames
from pokebench_env.human import HumanServer, install_human
from pokebench_env.levelup_box import SWITCH as LEVELUP_BOX
from pokebench_env.memory_reader import (
    Core,
    NativeCore,
    SnapshotMemoryReader,
    copy_native_region,
    read_canonical_ram,
)
from pokebench_env.observation import RawSnapshotFn, ScreenshotFn, install_observation
from pokebench_env.pause import SteppingServer, install_pause
from pokebench_env.raw_ram import (
    RawRamArchive,
    RawRamSnapshot,
    Reservation,
    shutdown_persistence_worker,
)
from pokebench_env.readout import features_off_from_env
from pokebench_env.rom import resolve_rom
from pokebench_env.screen_settle import (
    WARP_FEATURE,
    FrameSettle,
    SteppedEmulator,
    install_frame_settle,
)
from pokebench_env.travel import TravelServer, install_travel
from pokebench_env.view import install_spectator

LOCALHOST = "127.0.0.1"
# pokeemerald's own map tables, shipped as data in the pinned vendor checkout.
PORYMAP_MAPS = (
    Path(__file__).resolve().parents[1] / "vendor/continual-harness/pokemon_env/porymap/data/maps"
)


class FrameSource(Protocol):
    def get_screenshot(self) -> Image.Image | None: ...


class NativeScreenshot(BaseModel):
    screenshot_base64: str


def native_screenshot(emulator: FrameSource) -> NativeScreenshot:
    image = emulator.get_screenshot()
    if image is None:
        raise HTTPException(status_code=503, detail="no screenshot available")
    return native_screenshot_image(image)


def native_screenshot_image(image: Image.Image) -> NativeScreenshot:
    encoded = encode_png_base64(image)
    if encoded is None:  # pragma: no cover - FrameSource promises a PIL image
        raise HTTPException(status_code=503, detail="unsupported screenshot")
    return NativeScreenshot(screenshot_base64=encoded)


def frozen_native_screenshot(emulator: FrameSource) -> Callable[[], NativeScreenshot]:
    """Copy framebuffer pixels under the emulator lock; encode afterward."""

    image = emulator.get_screenshot()
    if image is None:
        raise HTTPException(status_code=503, detail="no screenshot available")
    frozen = image.copy()
    return lambda: native_screenshot_image(frozen)


def encode_png_base64(screenshot: object) -> str | None:
    """Encode the two frame shapes accepted by the pinned vendor producer."""

    if isinstance(screenshot, Image.Image):
        image = screenshot
    elif isinstance(screenshot, np.ndarray):
        image = Image.fromarray(screenshot)
    else:
        return None
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _both(
    first: Callable[[], None], wait: BattleWait | None, *, resume: bool = False
) -> Callable[[], None]:
    """Park or resume the fade settle and the battle wait together."""

    def call() -> None:
        first()
        if wait is not None:
            (wait.resume if resume else wait.park)()

    return call


class UvicornLike(Protocol):
    run: Callable[..., object]


class FrameManagerLike(Protocol):
    lock: threading.Lock
    active_connections: list[object]
    latest_frame: dict[str, object] | None

    async def connect(self, websocket: WebSocket) -> None: ...

    def disconnect(self, websocket: WebSocket) -> None: ...

    async def send_latest_frame(self, websocket: WebSocket) -> None: ...


class FrameCacheServer(Protocol):
    frame_manager: FrameManagerLike
    update_frame_cache: Callable[[object], None]


def install_on_demand_frame_cache(
    server: FrameCacheServer,
    frame_count: Callable[[], int],
    *,
    clock: Callable[[], float] = time.time,
    max_publish_fps: float = 60.0,
) -> None:
    """Publish useful source frames only while the WebSocket is observed.

    The pinned implementation hard-skips every second call, capping an 80 FPS
    game at 40 display FPS. This adapter instead uses an absolute publication
    deadline: nominal play retains every ~59.7 FPS frame, while 4x fast-dialog
    play does at most 60 PNG encodes/second. No image work occurs without a
    consumer, and a late iteration cannot start an unbounded catch-up burst.
    """

    if not math.isfinite(max_publish_fps) or max_publish_fps <= 0:
        raise ValueError("max_publish_fps must be finite and positive")
    period = 1.0 / max_publish_fps
    next_publish_at: float | None = None

    def update_if_observed(screenshot: object) -> None:
        nonlocal next_publish_at
        with server.frame_manager.lock:
            observed = bool(server.frame_manager.active_connections)
            if not observed:
                # A later subscriber must wait for a current frame rather than
                # receiving the last subscriber's arbitrarily old payload.
                server.frame_manager.latest_frame = None
                next_publish_at = None
        if not observed:
            return
        sampled_at = clock()
        if next_publish_at is not None and sampled_at < next_publish_at:
            return
        if next_publish_at is None or sampled_at - next_publish_at > 4 * period:
            next_publish_at = sampled_at + period
        else:
            next_publish_at += (math.floor((sampled_at - next_publish_at) / period) + 1) * period
        encoded = encode_png_base64(screenshot)
        if encoded is None:
            return
        payload: dict[str, object] = {
            "frame_data": encoded,
            "frame_count": frame_count(),
            "timestamp": sampled_at,
        }
        # A disconnect may race the encoder. Never retain an unobservable
        # payload that a later subscriber could mistake for a current frame.
        with server.frame_manager.lock:
            if server.frame_manager.active_connections:
                server.frame_manager.latest_frame = payload
            else:
                server.frame_manager.latest_frame = None

    server.update_frame_cache = update_if_observed


def install_deadline_frame_stream(
    api: FastAPI, manager: FrameManagerLike, *, polls_per_second: float = 120.0
) -> None:
    """Expose the compatible frame stream without adding work to its period.

    The pinned vendor route sleeps 16 ms *after* JSON serialization and socket
    I/O, so its real period is 16 ms plus work (about 55 FPS on this machine).
    This route uses absolute deadlines: work consumes the frame budget instead
    of extending it, and a badly delayed client cannot trigger an unbounded
    catch-up loop. It checks at 120 Hz so its sampling phase cannot discard
    unique 59.7275 Hz source frames; the manager still sends each frame once.
    """

    period = 1.0 / polls_per_second

    @api.websocket("/pokebench/frames")
    async def deadline_frames(websocket: WebSocket) -> None:
        await manager.connect(websocket)
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        try:
            while True:
                try:
                    await manager.send_latest_frame(websocket)
                    deadline += period
                    remaining = deadline - loop.time()
                    if remaining > 0:
                        await asyncio.sleep(remaining)
                    elif remaining < -(4 * period):
                        deadline = loop.time()
                except WebSocketDisconnect:
                    break
                except Exception:
                    break
        finally:
            manager.disconnect(websocket)


def pin_localhost(uvicorn: UvicornLike) -> None:
    real_run = uvicorn.run

    def run_on_localhost(*args: object, **kwargs: object) -> object:
        kwargs["host"] = LOCALHOST
        return real_run(*args, **kwargs)

    uvicorn.run = run_on_localhost


def run(
    argv: Sequence[str],
    uvicorn: UvicornLike,
    vendor_main: Callable[[], None],
    *,
    frame_cache: tuple[FrameCacheServer, Callable[[], int]] | None = None,
    pacing: GameLoopServer | None = None,
    original_speed_pacing: bool = False,
    spectator: tuple[FastAPI, type[EmulatorLike]] | None = None,
    observation: tuple[FastAPI, ScreenshotFn, ReadMemory, MapNames]
    | tuple[FastAPI, ScreenshotFn, ReadMemory, MapNames, AbstractContextManager[object]]
    | None = None,
    actions: tuple[FastAPI, type[FrameEmulator], ReadMemory] | None = None,
    pause: tuple[FastAPI, SteppingServer] | None = None,
    human: tuple[FastAPI, HumanServer, str] | None = None,
    checkpoint: Callable[[], bytes | None] | None = None,
    raw_archive: RawRamArchive | None = None,
    raw_capture: Callable[[], dict[str, object]] | None = None,
    raw_snapshot: RawSnapshotFn | None = None,
    raw_rom: bytes | None = None,
    travel: tuple[FastAPI, type[FrameEmulator], TravelServer, ReadMemory] | None = None,
    agent_checkpoint: tuple[FastAPI, Callable[[], bytes | None]] | None = None,
    frames: type[SteppedEmulator] | None = None,
    battle_text: tuple[FastAPI, type[SteppedEmulator], ReadMemory] | None = None,
) -> None:
    if human is not None:
        # Human play has neither this model tool nor its frame gate. Keep every
        # reader OFF even when the historical human launch list omits the ID.
        os.environ["POKEBENCH_FEATURES_OFF"] = ",".join(
            sorted(features_off_from_env(os.environ) | {EVOLUTION})
        )
    # Agent observations wait out screen fades on emulated frames (never wall
    # time). The human server records its snapshot observation under the
    # journal lock that the frame step also takes, so it captures at once.
    # The battle text journal steps first, so a battle wait released on a frame
    # finds that frame's page already recorded.
    if frame_cache is not None:
        install_on_demand_frame_cache(*frame_cache)
    if pacing is not None:
        if original_speed_pacing:
            install_deadline_pacing(pacing, source_fps=VENDOR_BASE_FPS)
        else:
            install_deadline_pacing(pacing)
    if battle_text is not None:
        install_battle_text(*battle_text)
    settle = None
    battle_wait = None
    whiteout = None
    if observation is not None and frames is not None and human is None:
        off = features_off_from_env(os.environ)
        # blackout-readout-v1: installed first, so its hook sees each frame before a settle
        # capture on that frame; OFF installs no frame hook at all.
        if BLACKOUT not in off:
            whiteout = WhiteoutLatch(observation[2])
            install_whiteout_latch(frames, whiteout)
        settle = FrameSettle(observation[2], warp=WARP_FEATURE not in off)
        install_frame_settle(frames, settle)
        battle_wait = BattleWait(observation[2], levelup_box=LEVELUP_BOX not in off)
        install_battle_wait(frames, battle_wait)
    if actions is not None:
        install_action_history(
            *actions,
            evolution_decision=human is None and EVOLUTION not in features_off_from_env(os.environ),
            tutorial_owner_enabled="tutorial-party-owner-v1"
            not in features_off_from_env(os.environ),
        )
    if travel is not None:
        install_travel(
            *travel,
            safe_strides="safe-navigation-strides-v1" not in features_off_from_env(os.environ),
        )
    if (
        observation is not None
        and frames is not None
        and human is None
        and EVOLUTION not in features_off_from_env(os.environ)
    ):
        if len(observation) != 5:
            raise ValueError("evolution decisions require the emulator memory lock")
        gate = install_evolution_decision(observation[0], frames, observation[2], observation[4])
        if settle is not None:
            # The game intentionally waits for a choice; capture that state even
            # if its palette is still fading/black. Never advance a held frame.
            settle.capture_held = lambda: gate.pending() is not None
    if pause is not None:
        install_pause(
            *pause,
            on_park=None if settle is None else _both(settle.park, battle_wait),
            on_resume=None if settle is None else _both(settle.resume, battle_wait, resume=True),
        )
    if agent_checkpoint is not None:
        install_checkpoint(*agent_checkpoint)
    if spectator is not None:
        install_spectator(*spectator)
    capture = None
    if observation is not None:
        capture = install_observation(
            *observation,
            raw_archive=raw_archive,
            raw_capture=raw_capture,
            raw_snapshot=raw_snapshot,
            raw_rom=raw_rom,
            settle=settle,
            battle_wait=battle_wait,
            whiteout=whiteout,
        )
    if human is not None:
        api, server, token = human
        controller = install_human(api, server, token, observe=capture, checkpoint=checkpoint)
        install_pause(api, server, input_pause=controller.set_paused)
    pin_localhost(uvicorn)
    sys.argv = ["server.app", *argv]
    try:
        vendor_main()
    finally:
        if raw_archive is not None:
            raw_archive.close()
            shutdown_persistence_worker()


def make_memory_reader(core: Callable[[], NativeCore]) -> SnapshotMemoryReader:
    return SnapshotMemoryReader(
        lambda: cast(Core, core()),
        lambda address, length: copy_native_region(core(), address, length),
        fast_read=lambda address, length: read_canonical_ram(core(), address, length),
    )


def main() -> None:  # pragma: no cover - entrypoint, exercised by `just smoke`
    off = features_off_from_env(os.environ)

    import uvicorn
    from pokemon_env.emulator import EmeraldEmulator
    from server import app  # vendor module, on PYTHONPATH

    install_deadline_frame_stream(app.app, cast(FrameManagerLike, app.frame_manager))

    install_battle_journal(
        app.app,
        cast(type[FrameEmulator], EmeraldEmulator),
        lambda address, length: bytes(app.env.core.memory.u8[address : address + length]),
    )
    token = os.environ.get("POKEBENCH_HUMAN_TOKEN")

    read_memory = make_memory_reader(lambda: cast(NativeCore, app.env.core))

    import hashlib

    rom = resolve_rom(os.environ).read_bytes()
    archive = RawRamArchive(
        Path.cwd().parent / "raw-ram",
        hashlib.sha1(rom, usedforsecurity=False).hexdigest(),
    )

    def raw_snapshot(reservation: Reservation) -> RawRamSnapshot:
        return archive.snapshot(reservation, read_memory, int(app.env.core.frame_counter))

    def checkpoint() -> bytes | None:
        with app.memory_lock:
            data = app.env.save_state()
            return data if isinstance(data, bytes) else None

    run(
        sys.argv[1:],
        uvicorn=cast(UvicornLike, uvicorn),
        vendor_main=app.main,
        frame_cache=(
            cast(FrameCacheServer, app),
            lambda: int(app.env.core.frame_counter),
        ),
        pacing=cast(GameLoopServer, app),
        original_speed_pacing="original-speed-pacing-v1" not in off,
        spectator=(app.app, cast(type[EmulatorLike], EmeraldEmulator)),
        actions=(app.app, cast(type[FrameEmulator], EmeraldEmulator), read_memory),
        observation=(
            app.app,
            lambda: frozen_native_screenshot(cast(FrameSource, app.env)),
            # The vendor creates `env` at startup, after routes are installed.
            read_memory,
            MapNames.load(PORYMAP_MAPS),
            app.memory_lock,
        ),
        checkpoint=checkpoint if token else None,
        raw_archive=archive,
        raw_snapshot=raw_snapshot,
        raw_rom=rom,
        travel=(
            app.app,
            cast(type[FrameEmulator], EmeraldEmulator),
            cast(TravelServer, app),
            read_memory,
        )
        if not token and hasattr(app, "action_queue")
        else None,
        pause=None if token else (app.app, cast(SteppingServer, app)),
        agent_checkpoint=None if token else (app.app, checkpoint),
        human=(app.app, cast(HumanServer, app), token) if token else None,
        frames=cast(type[SteppedEmulator], EmeraldEmulator),
        battle_text=(
            app.app,
            cast(type[SteppedEmulator], EmeraldEmulator),
            lambda address, length: bytes(app.env.core.memory.u8[address : address + length]),
        ),
    )


if __name__ == "__main__":  # pragma: no cover
    main()
