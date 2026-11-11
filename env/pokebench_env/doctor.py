"""Read-only setup preflight behind `just doctor [core|game|model]`.

Each check prints PASS, FAIL or SKIP with the command that fixes a miss, naming both the Homebrew
and the apt package. Tiers build on each other: core is enough for `just test`, game adds what
`just build-mgba` and `just smoke` need, model adds the endpoint a run plays through. A tier runs
the checks of every tier before it. The exit status is non-zero only when a check that ran failed;
an unset model endpoint is a SKIP. Nothing here writes, installs or starts anything; every probe of
the machine arrives through `Probes`. It runs on any python3 from 3.9, so it can report a missing
Python 3.11 before env/.venv exists. On Linux (tested on Ubuntu 24.04 x86_64) the checks use
pkg-config, never brew.
"""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import sys
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pokebench_env.rom import EMERALD_SHA1, ROM_ENV, RomError, resolve_rom

Status = Literal["PASS", "FAIL", "SKIP"]
Tier = Literal["core", "game", "model"]
TIERS: tuple[Tier, ...] = ("core", "game", "model")
NODE_MAJOR = 26
PYTHON_MINOR = "3.11"
CONNECT_GUIDE = "docs/connect-a-model.md"
VENDOR = Path("env/vendor/continual-harness")
VENV_PYTHON = Path("env/.venv/bin/python")


@dataclass(frozen=True)
class Check:
    tier: Tier
    name: str
    status: Status
    detail: str
    fix: str = ""


@dataclass(frozen=True)
class Probes:
    """Everything the doctor learns about the machine. `run` returns stripped stdout, or None when
    the command is missing or exits non-zero. `get_json` raises on any failure."""

    env: Mapping[str, str]
    repo: Path
    system: str
    machine: str
    which: Callable[[str], str | None]
    run: Callable[[Sequence[str]], str | None]
    is_file: Callable[[Path], bool]
    is_dir: Callable[[Path], bool]
    read_text: Callable[[Path], str]
    read_bytes: Callable[[Path], bytes]
    resolve: Callable[[Path], Path]
    get_json: Callable[[str, Mapping[str, str]], object] = field(repr=False)
    rom_sha1: str = EMERALD_SHA1


def _version_tuple(text: str) -> tuple[int, ...]:
    digits: list[int] = []
    for part in text.strip().lstrip("v").split("."):
        number = ""
        for ch in part:
            if not ch.isdigit():
                break
            number += ch
        if number == "":
            break
        digits.append(int(number))
    return tuple(digits)


def _macos(p: Probes) -> bool:
    return p.system == "Darwin"


def check_platform(p: Probes) -> Check:
    name = "platform"
    if p.system == "Darwin" and p.machine == "arm64":
        return Check("core", name, "PASS", "macOS arm64 (the tested platform)")
    if p.system == "Darwin":
        return Check(
            "core",
            name,
            "FAIL",
            f"macOS {p.machine}: only Apple Silicon is supported",
            "use a Mac with Apple Silicon (arm64)",
        )
    if p.system == "Linux" and p.machine == "x86_64":
        return Check("core", name, "PASS", "Linux x86_64: tested on Ubuntu 24.04 (2026-11-11)")
    if p.system == "Linux":
        return Check("core", name, "SKIP", f"Linux {p.machine}: untested, expect rough edges")
    return Check(
        "core",
        name,
        "FAIL",
        f"{p.system or 'unknown'}: not supported",
        "use macOS on Apple Silicon or Linux x86_64",
    )


def _both(brew: str, apt: str) -> str:
    return f"macOS: brew install {brew}  |  Linux: sudo apt install {apt}"


def check_just(p: Probes) -> Check:
    out = p.run(["just", "--version"])
    if out is None:
        return Check("core", "just", "FAIL", "just not found", _both("just", "just"))
    return Check("core", "just", "PASS", out)


def check_node(p: Probes) -> Check:
    fix = f"install Node.js {NODE_MAJOR}+ (macOS: brew install node; Linux: nodejs.org or nvm)"
    out = p.run(["node", "--version"])
    if out is None:
        return Check("core", "node", "FAIL", "node not found", fix)
    version = _version_tuple(out)
    if not version or version[0] < NODE_MAJOR:
        detail = f"{out}: needs {NODE_MAJOR}+ (older Node exits 0 without running the viewer)"
        return Check("core", "node", "FAIL", detail, fix)
    return Check("core", "node", "PASS", out)


def _pinned_pnpm(p: Probes) -> str | None:
    try:
        manifest = json.loads(p.read_text(p.repo / "package.json"))
    except (OSError, ValueError):
        return None
    pinned = manifest.get("packageManager") if isinstance(manifest, dict) else None
    if isinstance(pinned, str) and pinned.startswith("pnpm@"):
        return pinned.removeprefix("pnpm@")
    return None


def check_pnpm(p: Probes) -> Check:
    out = p.run(["pnpm", "--version"])
    pinned = _pinned_pnpm(p)
    fix = "npm install -g corepack && corepack enable pnpm"
    if out is None:
        return Check("core", "pnpm", "FAIL", "pnpm not found", fix)
    if pinned is not None and out != pinned:
        detail = f"{out}, but package.json pins {pinned}: corepack is not managing pnpm"
        return Check("core", "pnpm", "FAIL", detail, fix)
    return Check("core", "pnpm", "PASS", out)


def check_uv(p: Probes) -> Check:
    out = p.run(["uv", "--version"])
    if out is None:
        fix = "macOS: brew install uv  |  Linux: https://docs.astral.sh/uv/"
        return Check("core", "uv", "FAIL", "uv not found", fix)
    return Check("core", "uv", "PASS", out)


def check_python(p: Probes) -> Check:
    name = f"python {PYTHON_MINOR}"
    venv = p.repo / VENV_PYTHON
    if p.is_file(venv):
        out = p.run([str(venv), "--version"])
        if out is not None and out.removeprefix("Python ").startswith(PYTHON_MINOR + "."):
            return Check("core", name, "PASS", f"env/.venv: {out}")
        return Check(
            "core",
            name,
            "FAIL",
            f"env/.venv runs {out or 'nothing'}, needs {PYTHON_MINOR}",
            f"uv python install {PYTHON_MINOR} && rm -rf env/.venv && just setup",
        )
    if p.run(["uv", "python", "find", PYTHON_MINOR]) is None:
        return Check(
            "core",
            name,
            "FAIL",
            f"no Python {PYTHON_MINOR} and no env/.venv",
            f"uv python install {PYTHON_MINOR} && just setup",
        )
    return Check("core", name, "FAIL", "env/.venv missing", "just setup")


def check_node_deps(p: Probes) -> Check:
    if p.is_dir(p.repo / "node_modules"):
        return Check("core", "node packages", "PASS", "node_modules installed")
    return Check("core", "node packages", "FAIL", "node_modules missing", "just setup")


def check_hooks(p: Probes) -> Check:
    out = p.run(["git", "-C", str(p.repo), "config", "core.hooksPath"])
    if out == ".githooks":
        return Check("core", "git hooks", "PASS", "core.hooksPath is .githooks")
    return Check("core", "git hooks", "FAIL", "tracked hooks not enabled", "just setup")


def check_vendor(p: Probes) -> Check:
    if p.is_file(p.repo / VENDOR / "server" / "app.py"):
        return Check("game", "game server", "PASS", "continual-harness submodule checked out")
    return Check(
        "game",
        "game server",
        "FAIL",
        "env/vendor/continual-harness is empty",
        f"git submodule update --init {VENDOR}",
    )


FFMPEG_PKGS = (
    "libavcodec",
    "libavformat",
    "libavfilter",
    "libavutil",
    "libswscale",
    "libswresample",
)
FFMPEG_APT = " ".join(f"{pkg}-dev" for pkg in FFMPEG_PKGS)


def _system_pkg_config(p: Probes) -> str | None:
    """The first pkg-config on PATH outside env/.venv, as scripts/build-mgba.sh picks it: the
    venv's PyPI pkgconf misses the distribution's pkgconfig directories."""
    venv_bin = p.resolve(p.repo / VENV_PYTHON.parent)
    for entry in p.env.get("PATH", "").split(":"):
        if not entry or p.resolve(Path(entry)) == venv_bin:
            continue
        candidate = Path(entry) / "pkg-config"
        if p.is_file(candidate):
            return str(candidate)
    return None


def check_build_tools(p: Probes) -> list[Check]:
    """What scripts/build-mgba.sh needs: cmake, a C compiler, FFmpeg and libpng with headers."""
    checks: list[Check] = []
    if p.which("cmake"):
        checks.append(Check("game", "cmake", "PASS", "cmake found"))
    else:
        checks.append(Check("game", "cmake", "FAIL", "cmake not found", _both("cmake", "cmake")))
    compiler = next((cc for cc in ("cc", "clang", "gcc") if p.which(cc)), None)
    if compiler is not None:
        checks.append(Check("game", "C toolchain", "PASS", f"{compiler} found"))
    else:
        fix = "macOS: xcode-select --install  |  Linux: sudo apt install build-essential"
        checks.append(Check("game", "C toolchain", "FAIL", "no C compiler (cc, clang, gcc)", fix))
    libraries = (("ffmpeg", FFMPEG_PKGS, FFMPEG_APT), ("libpng", ("libpng",), "libpng-dev"))
    if _macos(p):
        prefix = p.run(["brew", "--prefix"]) if p.which("brew") else None
        if prefix is None:
            fix = "install Homebrew: https://brew.sh"
            checks.append(Check("game", "homebrew", "FAIL", "brew not found", fix))
            checks += [Check("game", name, "SKIP", "needs Homebrew") for name, _, _ in libraries]
            return checks
        checks.append(Check("game", "homebrew", "PASS", "brew found"))
        for name, _, apt in libraries:
            if p.is_dir(Path(prefix) / "opt" / name):
                checks.append(Check("game", name, "PASS", f"Homebrew {name} installed"))
            else:
                checks.append(
                    Check("game", name, "FAIL", f"Homebrew {name} missing", _both(name, apt))
                )
        return checks
    pkg_config = _system_pkg_config(p)
    if pkg_config is None:
        fix = _both("pkgconf", "pkg-config")
        detail = "no pkg-config outside env/.venv on PATH"
        checks.append(Check("game", "pkg-config", "FAIL", detail, fix))
        checks += [Check("game", name, "SKIP", "needs pkg-config") for name, _, _ in libraries]
        return checks
    for name, pkgs, apt in libraries:
        missing = [pkg for pkg in pkgs if p.run([pkg_config, "--exists", pkg]) is None]
        if missing:
            detail = f"no headers for {', '.join(missing)}"
            checks.append(Check("game", name, "FAIL", detail, _both(name, apt)))
        else:
            checks.append(Check("game", name, "PASS", f"{name} headers found"))
    return checks


def check_mgba(p: Probes) -> Check:
    venv = p.repo / VENV_PYTHON
    if not p.is_file(venv):
        return Check(
            "game", "mGBA binding", "FAIL", "env/.venv missing", "just setup && just build-mgba"
        )
    if p.run([str(venv), "-I", "-c", "import mgba.core, mgba.image"]) is None:
        return Check(
            "game", "mGBA binding", "FAIL", "mgba does not import in env/.venv", "just build-mgba"
        )
    return Check("game", "mGBA binding", "PASS", "mgba.core imports in env/.venv")


def check_rom(p: Probes) -> Check:
    try:
        resolve_rom(
            p.env, p.rom_sha1, resolve=p.resolve, is_file=p.is_file, read_bytes=p.read_bytes
        )
    except RomError as error:
        if not p.env.get(ROM_ENV):
            fix = f"set {ROM_ENV} in .env (see .env.example)"
        else:
            fix = f"point {ROM_ENV} at an unmodified Pokémon Emerald (USA, Europe) ROM"
        return Check("game", "ROM", "FAIL", str(error), fix)
    except OSError as error:
        return Check(
            "game", "ROM", "FAIL", f"cannot read {ROM_ENV}: {error.strerror}", f"check {ROM_ENV}"
        )
    return Check("game", "ROM", "PASS", "SHA-1 matches Pokémon Emerald (USA, Europe)")


def _host(url: str) -> tuple[str, str | None]:
    try:
        parsed = urlparse(url)
        return parsed.scheme, parsed.hostname
    except ValueError:
        return "", None


def _loopback(url: str) -> bool:
    return _host(url) == ("http", "127.0.0.1")


def _endpoint(p: Probes) -> tuple[str, Mapping[str, str]] | Check:
    file = p.env.get("POKEBENCH_ENDPOINT_FILE") or ""
    gateway = p.env.get("POKEBENCH_GATEWAY_URL") or ""
    if file:
        try:
            body = json.loads(p.read_text(Path(file).expanduser()))
        except OSError as error:
            return Check(
                "model",
                "endpoint",
                "FAIL",
                f"cannot read POKEBENCH_ENDPOINT_FILE: {error.strerror}",
                f"point POKEBENCH_ENDPOINT_FILE at an endpoint file ({CONNECT_GUIDE})",
            )
        except ValueError:
            return Check(
                "model",
                "endpoint",
                "FAIL",
                "POKEBENCH_ENDPOINT_FILE is not JSON",
                f'write {{"base_url", "api_key", "vision"}} ({CONNECT_GUIDE})',
            )
        base = body.get("base_url") if isinstance(body, dict) else None
        key = body.get("api_key") if isinstance(body, dict) else None
        if not isinstance(base, str) or not _loopback(base):
            return Check(
                "model",
                "endpoint",
                "FAIL",
                "endpoint file base_url is not http://127.0.0.1:<port>",
                "endpoint files stay on this machine; use POKEBENCH_GATEWAY_URL for a proxy",
            )
        if not isinstance(key, str) or key == "":
            return Check(
                "model",
                "endpoint",
                "FAIL",
                "endpoint file has no api_key",
                "set api_key to the server's key, or any non-empty string",
            )
        return base.rstrip("/"), {"Authorization": f"Bearer {key}"}
    if gateway:
        scheme, host = _host(gateway)
        if scheme not in ("http", "https") or not host:
            return Check(
                "model",
                "endpoint",
                "FAIL",
                "POKEBENCH_GATEWAY_URL is not an http(s) URL",
                f"set POKEBENCH_GATEWAY_URL to a /v1 URL ({CONNECT_GUIDE})",
            )
        return gateway.rstrip("/"), {}
    return Check(
        "model",
        "endpoint",
        "SKIP",
        "no model endpoint set",
        f"set POKEBENCH_GATEWAY_URL or POKEBENCH_ENDPOINT_FILE ({CONNECT_GUIDE})",
    )


def _model_ids(payload: object) -> list[str] | None:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return None
    return [
        item["id"] for item in data if isinstance(item, dict) and isinstance(item.get("id"), str)
    ]


def check_model(p: Probes) -> list[Check]:
    endpoint = _endpoint(p)
    if isinstance(endpoint, Check):
        return [endpoint, Check("model", "model id", "SKIP", "no endpoint to ask")]
    base, headers = endpoint
    try:
        payload = p.get_json(base + "/models", headers)
    except Exception as error:  # noqa: BLE001 - any failure to reach the server is the finding
        return [
            Check(
                "model",
                "endpoint",
                "FAIL",
                f"GET /models failed: {type(error).__name__}",
                "start the model server, or fix the endpoint URL",
            ),
            Check("model", "model id", "SKIP", "endpoint unreachable"),
        ]
    ids = _model_ids(payload)
    if ids is None:
        return [
            Check(
                "model",
                "endpoint",
                "FAIL",
                "/models did not return a model list",
                f"use an OpenAI-compatible /v1 endpoint ({CONNECT_GUIDE})",
            ),
            Check("model", "model id", "SKIP", "endpoint lists no models"),
        ]
    reached = Check("model", "endpoint", "PASS", f"/models lists {len(ids)} model(s)")
    model = p.env.get("POKEBENCH_MODEL") or ""
    if not model:
        return [
            reached,
            Check(
                "model",
                "model id",
                "FAIL",
                "POKEBENCH_MODEL is not set",
                "set POKEBENCH_MODEL to an id the endpoint lists",
            ),
        ]
    if model not in ids:
        listed = ", ".join(ids) or "none"
        return [
            reached,
            Check(
                "model",
                "model id",
                "FAIL",
                f"{model} is not listed (listed: {listed})",
                "set POKEBENCH_MODEL to one of the listed ids",
            ),
        ]
    return [reached, Check("model", "model id", "PASS", f"{model} is listed")]


def run_checks(p: Probes, tier: Tier = "model") -> list[Check]:
    wanted = TIERS[: TIERS.index(tier) + 1]
    checks = [
        check_platform(p),
        check_just(p),
        check_node(p),
        check_pnpm(p),
        check_uv(p),
        check_python(p),
        check_node_deps(p),
        check_hooks(p),
    ]
    if "game" in wanted:
        checks += [check_vendor(p), *check_build_tools(p), check_mgba(p), check_rom(p)]
    if "model" in wanted:
        checks += check_model(p)
    return checks


def render(checks: Sequence[Check]) -> str:
    width = max((len(check.name) for check in checks), default=0)
    lines: list[str] = []
    for check in checks:
        lines.append(f"{check.status:<4}  {check.tier:<5}  {check.name:<{width}}  {check.detail}")
        if check.status != "PASS" and check.fix:
            lines.append(f"{'':<4}  {'':<5}  {'':<{width}}  fix: {check.fix}")
    failed = sum(check.status == "FAIL" for check in checks)
    skipped = sum(check.status == "SKIP" for check in checks)
    lines.append("")
    lines.append(f"{len(checks) - failed - skipped} passed, {failed} failed, {skipped} skipped")
    return "\n".join(lines)


def exit_code(checks: Sequence[Check]) -> int:
    return 1 if any(check.status == "FAIL" for check in checks) else 0


def parse_tier(argv: Sequence[str]) -> Tier:
    if not argv:
        return "model"
    for tier in TIERS:
        if list(argv) == [tier]:
            return tier
    raise SystemExit(f"usage: just doctor [{'|'.join(TIERS)}]")


def _run(argv: Sequence[str]) -> str | None:  # pragma: no cover - the process table
    try:
        done = subprocess.run(list(argv), capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return done.stdout.strip() if done.returncode == 0 else None


def _get_json(url: str, headers: Mapping[str, str]) -> object:  # pragma: no cover - the network
    request = urllib.request.Request(url, headers=dict(headers))  # noqa: S310 - http(s) checked
    with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310
        return json.loads(response.read())


def real_probes(repo: Path, env: Mapping[str, str]) -> Probes:  # pragma: no cover - the machine
    return Probes(
        env=env,
        repo=repo,
        system=platform.system(),
        machine=platform.machine(),
        which=shutil.which,
        run=_run,
        is_file=Path.is_file,
        is_dir=Path.is_dir,
        read_text=lambda path: path.read_text(encoding="utf-8"),
        read_bytes=Path.read_bytes,
        resolve=lambda path: path.expanduser().resolve(),
        get_json=_get_json,
    )


def main(argv: Sequence[str]) -> int:  # pragma: no cover - entrypoint, exercised by `just doctor`
    import os

    checks = run_checks(real_probes(Path.cwd(), os.environ), parse_tier(argv))
    print(render(checks))
    return exit_code(checks)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
