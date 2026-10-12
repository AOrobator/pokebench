"""Prepare the vendor checkout and launch the game server. Arguments are always argv lists."""

import argparse
import os
import subprocess
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TypeVar

from pokebench_env.rom import resolve_rom
from pokebench_env.run_server import (
    default_run_id,
    forward_sigterm,
    prepare_server_dir,
    server_env,
    validate_run_id,
)
from pokebench_env.vendor import check_vendor

REPO_ROOT = Path(__file__).resolve().parents[2]
VENDOR_DIR = REPO_ROOT / "env" / "vendor" / "continual-harness"
RUNS_DIR = REPO_ROOT / "runs"
PYCACHE_DIR = REPO_ROOT / ".cache" / "pycache"

P = TypeVar("P")


@dataclass(frozen=True)
class ServerSpec:
    port: int
    no_ocr: bool
    load_state: Path | None

    def __post_init__(self) -> None:
        if not 1024 <= self.port <= 65535:
            raise ValueError(f"port must be within 1024..65535, got {self.port}")


def server_command(python: Path, spec: ServerSpec) -> list[str]:
    argv = [str(python), "-m", "pokebench_env.serve", "--port", str(spec.port)]
    if spec.no_ocr:
        argv.append("--no-ocr")
    if spec.load_state is not None:
        argv += ["--load-state", str(spec.load_state)]
    return argv


def prepare(
    env: Mapping[str, str],
    run_dir: Path,
    vendor_dir: Path = VENDOR_DIR,
    check: Callable[[Path], None] = check_vendor,
    resolve: Callable[[Mapping[str, str]], Path] = resolve_rom,
    make_server_dir: Callable[[Path, Path, Path], Path] = prepare_server_dir,
) -> Path:
    check(vendor_dir)
    return make_server_dir(run_dir, resolve(env), vendor_dir)


def spawn(
    spec: ServerSpec,
    python: Path,
    vendor_dir: Path,
    server_dir: Path,
    run_id: str,
    pycache_dir: Path,
    base_env: Mapping[str, str],
    popen: Callable[..., P],
) -> P:
    env = server_env(base_env, vendor_dir=vendor_dir, run_id=run_id, pycache_dir=pycache_dir)
    return popen(server_command(python, spec), cwd=server_dir, env=env)


def launch(
    spec: ServerSpec, run_dir: Path, run_id: str
) -> "subprocess.Popen[bytes]":  # pragma: no cover - real process
    server_dir = prepare(os.environ, run_dir)
    return spawn(
        spec,
        Path(sys.executable),
        VENDOR_DIR,
        server_dir,
        validate_run_id(run_id),
        PYCACHE_DIR,
        os.environ,
        subprocess.Popen,
    )


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - entrypoint (`just serve`)
    parser = argparse.ArgumentParser(description="Launch an isolated game server for one run.")
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--run-id")
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("POKEBENCH_GAME_PORT", "8000"))
    )
    args = parser.parse_args(argv)
    run_id = validate_run_id(args.run_id or default_run_id(datetime.now(UTC)))
    run_dir = args.run_dir or RUNS_DIR / run_id
    process = launch(ServerSpec(port=args.port, no_ocr=True, load_state=None), run_dir, run_id)
    forward_sigterm(process)
    print(
        f"game server ({run_id}): http://127.0.0.1:{args.port}/stream (Ctrl-C to stop)", flush=True
    )
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        return process.wait(timeout=10)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
