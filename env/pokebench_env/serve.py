"""Run the vendor game server's own `main()`, bound to 127.0.0.1.

The vendor `server.app.main()` hardcodes `uvicorn.run(host="0.0.0.0")`, which
would expose emulator control (save/load state, actions) on the LAN. Wrapping
`uvicorn.run` keeps the vendor code unmodified. Must run with the vendor
checkout on `sys.path`; the working directory is the run's server dir (INV-7).
"""

import base64
import os
import sys
from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from io import BytesIO
from pathlib import Path
from typing import Protocol, cast

from fastapi import FastAPI, HTTPException
from PIL.Image import Image
from pydantic import BaseModel

from pokebench_env.action_history import install_action_history
from pokebench_env.audio import EmulatorLike
from pokebench_env.battle_choices import FrameEmulator, install_battle_journal
from pokebench_env.battle_text import BattleWait, install_battle_text, install_battle_wait
from pokebench_env.blackout_readout import SWITCH as BLACKOUT
from pokebench_env.blackout_readout import WhiteoutLatch, install_whiteout_latch
from pokebench_env.checkpoint import install_checkpoint
from pokebench_env.game_screen import ReadMemory
from pokebench_env.game_state import MapNames
from pokebench_env.human import HumanServer, install_human
from pokebench_env.memory_reader import Core, NativeCore, SnapshotMemoryReader, copy_native_region
from pokebench_env.observation import ScreenshotFn, install_observation
from pokebench_env.pause import SteppingServer, install_pause
from pokebench_env.raw_ram import RawRamArchive
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
    def get_screenshot(self) -> Image | None: ...


class NativeScreenshot(BaseModel):
    screenshot_base64: str


def native_screenshot(emulator: FrameSource) -> NativeScreenshot:
    image = emulator.get_screenshot()
    if image is None:
        raise HTTPException(status_code=503, detail="no screenshot available")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return NativeScreenshot(screenshot_base64=base64.b64encode(buffer.getvalue()).decode("ascii"))


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
    travel: tuple[FastAPI, type[FrameEmulator], TravelServer, ReadMemory] | None = None,
    agent_checkpoint: tuple[FastAPI, Callable[[], bytes | None]] | None = None,
    frames: type[SteppedEmulator] | None = None,
    battle_text: tuple[FastAPI, type[SteppedEmulator], ReadMemory] | None = None,
) -> None:
    # Agent observations wait out screen fades on emulated frames (never wall
    # time). The human server records its snapshot observation under the
    # journal lock that the frame step also takes, so it captures at once.
    # The battle text journal steps first, so a battle wait released on a frame
    # finds that frame's page already recorded.
    if battle_text is not None:
        install_battle_text(*battle_text)
    settle = None
    battle_wait = None
    whiteout = None
    if observation is not None and frames is not None and human is None:
        off = features_off_from_env(os.environ)
        settle = FrameSettle(observation[2], warp=WARP_FEATURE not in off)
        install_frame_settle(frames, settle)
        battle_wait = BattleWait(observation[2])
        install_battle_wait(frames, battle_wait)
        # blackout-readout-v1: OFF installs no frame hook at all.
        if BLACKOUT not in off:
            whiteout = WhiteoutLatch(observation[2])
            install_whiteout_latch(frames, whiteout)
    if actions is not None:
        install_action_history(*actions)
    if travel is not None:
        install_travel(*travel)
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
    vendor_main()


def main() -> None:  # pragma: no cover - entrypoint, exercised by `just smoke`
    import uvicorn
    from pokemon_env.emulator import EmeraldEmulator
    from server import app  # vendor module, on PYTHONPATH

    install_battle_journal(
        app.app,
        cast(type[FrameEmulator], EmeraldEmulator),
        lambda address, length: bytes(app.env.core.memory.u8[address : address + length]),
    )
    token = os.environ.get("POKEBENCH_HUMAN_TOKEN")

    def raw_region(address: int, size: int) -> bytes:
        return copy_native_region(cast(NativeCore, app.env.core), address, size)

    read_memory = SnapshotMemoryReader(lambda: cast(Core, app.env.core), raw_region)

    import hashlib

    archive = RawRamArchive(
        Path.cwd().parent / "raw-ram",
        hashlib.sha1(resolve_rom(os.environ).read_bytes(), usedforsecurity=False).hexdigest(),
    )

    def raw_capture() -> dict[str, object]:
        return archive.capture(read_memory, int(app.env.core.frame_counter))

    def checkpoint() -> bytes | None:
        with app.memory_lock:
            data = app.env.save_state()
            return data if isinstance(data, bytes) else None

    run(
        sys.argv[1:],
        uvicorn=cast(UvicornLike, uvicorn),
        vendor_main=app.main,
        spectator=(app.app, cast(type[EmulatorLike], EmeraldEmulator)),
        actions=(app.app, cast(type[FrameEmulator], EmeraldEmulator), read_memory),
        observation=(
            app.app,
            lambda: native_screenshot(cast(FrameSource, app.env)),
            # The vendor creates `env` at startup, after routes are installed.
            read_memory,
            MapNames.load(PORYMAP_MAPS),
            app.memory_lock,
        ),
        checkpoint=checkpoint if token else None,
        raw_archive=archive,
        raw_capture=raw_capture,
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
