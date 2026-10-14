import os
import signal
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from pokebench_env.run_server import (
    RunServerError,
    default_run_id,
    forward_sigterm,
    prepare_server_dir,
    server_env,
    validate_run_id,
)


@pytest.fixture
def vendor(tmp_path: Path) -> Path:
    root = tmp_path / "vendor"
    (root / "server").mkdir(parents=True)
    (root / "server" / "stream.html").write_text("<html></html>")
    return root


def test_server_dir_links_only_the_rom_and_the_stream_page(tmp_path: Path, vendor: Path) -> None:
    rom = tmp_path / "roms" / "Pokemon (USA, Europe).gba"
    rom.parent.mkdir()
    rom.write_bytes(b"rom")
    server_dir = prepare_server_dir(tmp_path / "runs" / "r1", rom, vendor)
    assert server_dir == tmp_path / "runs" / "r1" / "server"
    assert (server_dir / "Emerald-GBAdvance" / "rom.gba").readlink() == rom
    assert (server_dir / "server" / "stream.html").readlink() == vendor / "server" / "stream.html"
    entries = sorted(str(p.relative_to(server_dir)) for p in server_dir.rglob("*"))
    assert entries == [
        "Emerald-GBAdvance",
        "Emerald-GBAdvance/rom.gba",
        "server",
        "server/stream.html",
    ]


def test_a_server_dir_is_never_reused(tmp_path: Path, vendor: Path) -> None:
    rom = tmp_path / "rom.gba"
    rom.write_bytes(b"rom")
    prepare_server_dir(tmp_path / "run", rom, vendor)
    with pytest.raises(RunServerError, match="already exists"):
        prepare_server_dir(tmp_path / "run", rom, vendor)


def test_server_env_isolates_the_run(tmp_path: Path) -> None:
    env = server_env(
        {
            "PATH": "/usr/bin",
            "PYTHONPATH": "/elsewhere",
            "LOAD_CHECKPOINT_MODE": "true",
            "RUN_DATA_ID": "old",
        },
        vendor_dir=tmp_path / "vendor",
        run_id="2026-10-11T21-40-05_think-swarm_a1b2",
        pycache_dir=tmp_path / "pycache",
    )
    assert env == {
        "PATH": "/usr/bin",
        "PYTHONPATH": os.pathsep.join(
            (str(tmp_path / "vendor"), str(Path(__file__).resolve().parents[2]))
        ),
        "RUN_DATA_ID": "2026-10-11T21-40-05_think-swarm_a1b2",
        "LOAD_CHECKPOINT_MODE": "false",
        "PYTHONPYCACHEPREFIX": str(tmp_path / "pycache"),
    }


def test_two_runs_get_distinct_identities(tmp_path: Path) -> None:
    first = server_env({}, vendor_dir=tmp_path, run_id="run_a", pycache_dir=tmp_path)
    second = server_env({}, vendor_dir=tmp_path, run_id="run_b", pycache_dir=tmp_path)
    assert first["RUN_DATA_ID"] != second["RUN_DATA_ID"]


@pytest.mark.parametrize(
    "run_id", ["", "../escape", "a/b", ".hidden", "x" * 129, "has space", "semi;colon"]
)
def test_run_ids_must_be_a_single_safe_path_component(run_id: str) -> None:
    with pytest.raises(RunServerError, match="run id"):
        validate_run_id(run_id)


def test_default_run_id_is_eastern_time_to_the_second() -> None:
    utc = datetime(2026, 10, 12, 1, 40, 5, tzinfo=ZoneInfo("UTC"))
    assert default_run_id(utc) == "serve_2026-10-11T21-40-05"
    assert validate_run_id(default_run_id(utc)) == "serve_2026-10-11T21-40-05"


class FakeProcess:
    def __init__(self) -> None:
        self.terminated = 0

    def terminate(self) -> None:
        self.terminated += 1


def test_sigterm_is_forwarded_to_the_server_process() -> None:
    process = FakeProcess()
    installed: dict[int, object] = {}

    def fake_signal(signum: int, handler: object) -> None:
        installed[signum] = handler

    forward_sigterm(process, fake_signal)
    handler = installed[signal.SIGTERM]
    assert callable(handler)
    handler(signal.SIGTERM, None)
    assert process.terminated == 1


def test_server_env_does_not_mutate_the_base_env(tmp_path: Path) -> None:
    base = dict(os.environ)
    server_env(base, vendor_dir=tmp_path, run_id="run_a", pycache_dir=tmp_path)
    assert base == dict(os.environ)
