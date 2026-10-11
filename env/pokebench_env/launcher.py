"""Prepare the vendor checkout and launch the game server. Arguments are always argv lists."""

import os
import subprocess
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import TypeVar

from pokebench_env.rom import link_into_vendor, resolve_rom
from pokebench_env.vendor import check_vendor

VENDOR_DIR = Path(__file__).resolve().parents[1] / "vendor" / "continual-harness"

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
    vendor_dir: Path = VENDOR_DIR,
    check: Callable[[Path], None] = check_vendor,
    resolve: Callable[[Mapping[str, str]], Path] = resolve_rom,
    link: Callable[[Path, Path], Path] = link_into_vendor,
) -> None:
    check(vendor_dir)
    link(resolve(env), vendor_dir)


def spawn(
    spec: ServerSpec,
    python: Path,
    vendor_dir: Path,
    base_env: Mapping[str, str],
    popen: Callable[..., P],
) -> P:
    env = {**base_env, "PYTHONPATH": str(vendor_dir)}
    return popen(server_command(python, spec), cwd=vendor_dir, env=env)


def launch(spec: ServerSpec) -> "subprocess.Popen[bytes]":  # pragma: no cover - real process
    prepare(os.environ)
    return spawn(spec, Path(sys.executable), VENDOR_DIR, os.environ, subprocess.Popen)


def main() -> int:  # pragma: no cover - entrypoint, exercised by `just serve`
    port = int(os.environ.get("POKEBENCH_GAME_PORT", "8000"))
    process = launch(ServerSpec(port=port, no_ocr=True, load_state=None))
    print(f"game server: http://127.0.0.1:{port}/stream (Ctrl-C to stop)", flush=True)
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        return process.wait(timeout=10)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
