"""Per-run game-server isolation (INV-7).

The vendor server writes `.pokeagent_cache/`, `run_data/`, `llm_logs/` and
`backups/` relative to its working directory and keys them by `RUN_DATA_ID`.
Each run therefore gets a fresh working directory holding only the two paths
the vendor reads relative to cwd, its own run id, and checkpoint restore off.
"""

import os
import re
import signal
from collections.abc import Callable, Mapping
from datetime import datetime
from pathlib import Path
from types import FrameType
from typing import Protocol
from zoneinfo import ZoneInfo

from pokebench_env.rom import VENDOR_ROM_SLOT

EASTERN = ZoneInfo("America/New_York")
RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
STREAM_PAGE = Path("server") / "stream.html"


class RunServerError(RuntimeError):
    pass


def validate_run_id(run_id: str) -> str:
    if not RUN_ID_PATTERN.fullmatch(run_id):
        raise RunServerError(f"run id must be one safe path component, got {run_id!r}")
    return run_id


def default_run_id(now: datetime) -> str:
    return "serve_" + now.astimezone(EASTERN).strftime("%Y-%m-%dT%H-%M-%S")


def prepare_server_dir(run_dir: Path, rom: Path, vendor_dir: Path) -> Path:
    server_dir = run_dir / "server"
    if server_dir.exists():
        raise RunServerError(f"{server_dir} already exists; a run directory is used once")
    (server_dir / VENDOR_ROM_SLOT).parent.mkdir(parents=True)
    (server_dir / VENDOR_ROM_SLOT).symlink_to(rom)
    (server_dir / STREAM_PAGE).parent.mkdir()
    (server_dir / STREAM_PAGE).symlink_to(vendor_dir / STREAM_PAGE)
    return server_dir


def server_env(
    base_env: Mapping[str, str], *, vendor_dir: Path, run_id: str, pycache_dir: Path
) -> dict[str, str]:
    return {
        **base_env,
        "PYTHONPATH": os.pathsep.join((str(vendor_dir), str(Path(__file__).resolve().parents[1]))),
        "RUN_DATA_ID": validate_run_id(run_id),
        "LOAD_CHECKPOINT_MODE": "false",
        "PYTHONPYCACHEPREFIX": str(pycache_dir),
    }


class Terminable(Protocol):
    def terminate(self) -> None: ...


Handler = Callable[[int, FrameType | None], None]


def forward_sigterm(
    process: Terminable, install: Callable[[int, Handler], object] = signal.signal
) -> None:
    def on_sigterm(_signum: int, _frame: FrameType | None) -> None:
        process.terminate()

    install(signal.SIGTERM, on_sigterm)
