import hashlib
import json
from collections.abc import Mapping, Sequence
from pathlib import Path

import pytest

from pokebench_env import doctor
from pokebench_env.doctor import Check, Probes, render, run_checks
from pokebench_env.rom import EMERALD_SHA1

REPO = Path("/repo")
VENV = str(REPO / "env/.venv/bin/python")
ROM = Path("/roms/emerald.gba")
ROM_BYTES = b"emerald"
GOOD_SHA1 = hashlib.sha1(ROM_BYTES, usedforsecurity=False).hexdigest()
COMMANDS: dict[tuple[str, ...], str] = {
    ("just", "--version"): "just 1.43.0",
    ("node", "--version"): "v26.7.0",
    ("pnpm", "--version"): "10.32.1",
    ("uv", "--version"): "uv 0.10.9",
    (VENV, "--version"): "Python 3.11.14",
    ("git", "-C", "/repo", "config", "core.hooksPath"): ".githooks",
    ("brew", "--prefix"): "/brew",
    (VENV, "-I", "-c", "import mgba.core, mgba.image"): "",
}
FILES = {
    REPO / "env/.venv/bin/python",
    REPO / "env/vendor/continual-harness/server/app.py",
    ROM,
}
DIRS = {REPO / "node_modules", Path("/brew/opt/ffmpeg"), Path("/brew/opt/libpng")}
TEXTS = {REPO / "package.json": json.dumps({"packageManager": "pnpm@10.32.1"})}


def probes(
    *,
    env: Mapping[str, str] | None = None,
    system: str = "Darwin",
    machine: str = "arm64",
    commands: Mapping[tuple[str, ...], str | None] | None = None,
    files: set[Path] | None = None,
    dirs: set[Path] | None = None,
    texts: Mapping[Path, str] | None = None,
    tools: set[str] | None = None,
    models: object = None,
    raise_on_get: Exception | None = None,
    requests: list[tuple[str, Mapping[str, str]]] | None = None,
    rom: bytes | Exception = ROM_BYTES,
) -> Probes:
    table = {**COMMANDS, **(commands or {})}
    known_files = FILES if files is None else files
    known_dirs = DIRS if dirs is None else dirs
    known_texts = {**TEXTS, **(texts or {})}
    on_path = {"brew", "cmake", "cc"} if tools is None else tools

    def run(argv: Sequence[str]) -> str | None:
        return table.get(tuple(argv))

    def read_text(path: Path) -> str:
        if path not in known_texts:
            raise FileNotFoundError(2, "No such file or directory")
        return known_texts[path]

    def get_json(url: str, headers: Mapping[str, str]) -> object:
        if requests is not None:
            requests.append((url, headers))
        if raise_on_get is not None:
            raise raise_on_get
        return models

    def read_bytes(_path: Path) -> bytes:
        if isinstance(rom, Exception):
            raise rom
        return rom

    return Probes(
        env={"POKEBENCH_ROM": str(ROM)} if env is None else env,
        repo=REPO,
        system=system,
        machine=machine,
        which=lambda tool: f"/bin/{tool}" if tool in on_path else None,
        run=run,
        is_file=lambda path: path in known_files,
        is_dir=lambda path: path in known_dirs,
        read_text=read_text,
        read_bytes=read_bytes,
        resolve=lambda path: path,
        get_json=get_json,
        rom_sha1=GOOD_SHA1,
    )


def by_name(checks: Sequence[Check]) -> dict[str, Check]:
    return {check.name: check for check in checks}


def test_ready_machine_passes_every_check_and_skips_the_unset_endpoint() -> None:
    checks = run_checks(probes())
    assert [c.status for c in checks if c.tier != "model"] == ["PASS"] * 16
    model = by_name(checks)
    assert model["endpoint"].status == "SKIP"
    assert "POKEBENCH_GATEWAY_URL" in model["endpoint"].fix
    assert model["model id"].status == "SKIP"
    assert doctor.exit_code(checks) == 0


def test_tiers_stop_at_the_requested_tier() -> None:
    assert {c.tier for c in run_checks(probes(), "core")} == {"core"}
    assert {c.tier for c in run_checks(probes(), "game")} == {"core", "game"}


@pytest.mark.parametrize(
    ("system", "machine", "status"),
    [
        ("Darwin", "x86_64", "FAIL"),
        ("Linux", "x86_64", "SKIP"),
        ("Windows", "AMD64", "FAIL"),
        ("", "", "FAIL"),
    ],
)
def test_platform(system: str, machine: str, status: str) -> None:
    assert doctor.check_platform(probes(system=system, machine=machine)).status == status


def test_just() -> None:
    assert doctor.check_just(probes()).status == "PASS"
    missing = doctor.check_just(probes(commands={("just", "--version"): None}))
    assert (missing.status, "apt install just" in missing.fix) == ("FAIL", True)


def test_old_or_missing_node_fails_with_an_install_fix() -> None:
    old = doctor.check_node(probes(commands={("node", "--version"): "v24.1.0"}))
    assert old.status == "FAIL"
    assert "exits 0" in old.detail
    assert "brew install node" in old.fix
    missing = doctor.check_node(probes(system="Linux", commands={("node", "--version"): None}))
    assert missing.status == "FAIL"
    assert "Node.js 26" in missing.fix
    garbage = doctor.check_node(probes(commands={("node", "--version"): "nightly"}))
    assert garbage.status == "FAIL"


def test_pnpm_must_be_the_pinned_corepack_version() -> None:
    gone = doctor.check_pnpm(probes(commands={("pnpm", "--version"): None}))
    assert gone.fix == "npm install -g corepack && corepack enable pnpm"
    other = doctor.check_pnpm(probes(commands={("pnpm", "--version"): "9.15.0"}))
    assert other.status == "FAIL"
    assert "pins 10.32.1" in other.detail
    assert other.fix == "npm install -g corepack && corepack enable pnpm"
    unpinned = doctor.check_pnpm(probes(texts={REPO / "package.json": "{}"}))
    assert unpinned.detail == "10.32.1"
    broken = doctor.check_pnpm(probes(texts={REPO / "package.json": "not json"}))
    assert broken.status == "PASS"


def test_missing_uv_names_both_installs() -> None:
    fix = doctor.check_uv(probes(commands={("uv", "--version"): None})).fix
    assert "brew install uv" in fix
    assert "astral" in fix


def test_python() -> None:
    no_venv = FILES - {REPO / "env/.venv/bin/python"}
    found = {("uv", "python", "find", "3.11"): "/py/3.11"}
    assert doctor.check_python(probes(files=no_venv, commands=found)).fix == "just setup"
    absent = doctor.check_python(probes(files=no_venv))
    assert absent.fix == "uv python install 3.11 && just setup"
    wrong = doctor.check_python(probes(commands={(VENV, "--version"): "Python 3.12.1"}))
    assert wrong.status == "FAIL"
    assert "3.12.1" in wrong.detail
    dead = doctor.check_python(probes(commands={(VENV, "--version"): None}))
    assert "nothing" in dead.detail


def test_setup_outputs() -> None:
    assert doctor.check_node_deps(probes(dirs=set())).fix == "just setup"
    hooks = doctor.check_hooks(
        probes(commands={("git", "-C", "/repo", "config", "core.hooksPath"): None})
    )
    assert (hooks.status, hooks.fix) == ("FAIL", "just setup")
    vendor = doctor.check_vendor(probes(files=set()))
    assert vendor.fix == "git submodule update --init env/vendor/continual-harness"


LINUX_PKGS = {("pkg-config", "--exists", pkg): "" for pkg in (*doctor.FFMPEG_PKGS, "libpng")}


def test_macos_build_tools() -> None:
    ready = by_name(doctor.check_build_tools(probes()))
    assert {c.status for c in ready.values()} == {"PASS"}
    assert set(ready) == {"cmake", "C toolchain", "homebrew", "ffmpeg", "libpng"}
    no_brew = by_name(doctor.check_build_tools(probes(tools={"cmake", "cc"})))
    assert no_brew["homebrew"].status == "FAIL"
    assert no_brew["ffmpeg"].status == "SKIP"
    bare = by_name(doctor.check_build_tools(probes(tools={"brew"}, dirs=set())))
    assert "brew install cmake" in bare["cmake"].fix
    assert "xcode-select --install" in bare["C toolchain"].fix
    assert "brew install ffmpeg" in bare["ffmpeg"].fix
    assert "libavcodec-dev libavformat-dev libavfilter-dev" in bare["ffmpeg"].fix
    assert "libpng-dev" in bare["libpng"].fix


def test_linux_build_tools_use_pkg_config_and_never_brew() -> None:
    asked: list[tuple[str, ...]] = []
    ready = doctor.check_build_tools(
        probes(system="Linux", tools={"cmake", "gcc", "pkg-config"}, commands=LINUX_PKGS)
    )
    assert [c.status for c in ready] == ["PASS"] * 4
    assert by_name(ready)["C toolchain"].detail == "gcc found"
    assert "untested" in by_name(ready)["ffmpeg"].detail

    def recording(argv):  # type: ignore[no-untyped-def]
        asked.append(tuple(argv))
        return None

    linux = probes(system="Linux", tools={"pkg-config"})
    no_libs = by_name(doctor.check_build_tools(Probes(**{**linux.__dict__, "run": recording})))
    assert all(argv[0] == "pkg-config" for argv in asked)
    assert "libswresample" in no_libs["ffmpeg"].detail
    assert "sudo apt install build-essential" in no_libs["C toolchain"].fix
    no_pkg_config = by_name(doctor.check_build_tools(probes(system="Linux", tools=set())))
    assert no_pkg_config["pkg-config"].status == "FAIL"
    assert no_pkg_config["libpng"].status == "SKIP"


def test_linux_runs_every_tier_without_crashing() -> None:
    checks = by_name(run_checks(probes(system="Linux", machine="x86_64")))
    assert checks["platform"].status == "SKIP"
    assert "homebrew" not in checks


def test_mgba() -> None:
    assert doctor.check_mgba(probes(files=set())).fix == "just setup && just build-mgba"
    broken = {(VENV, "-I", "-c", "import mgba.core, mgba.image"): None}
    assert doctor.check_mgba(probes(commands=broken)).fix == "just build-mgba"
    assert "macOS-only" in doctor.check_mgba(probes(system="Linux", commands=broken)).fix


def test_rom() -> None:
    unset = doctor.check_rom(probes(env={}))
    assert unset.status == "FAIL"
    assert ".env.example" in unset.fix
    missing = doctor.check_rom(probes(files=set()))
    assert "does not exist" in missing.detail
    wrong = doctor.check_rom(probes(rom=b"a hack"))
    assert (wrong.status, "unmodified" in wrong.fix) == ("FAIL", True)
    denied = doctor.check_rom(probes(rom=PermissionError(13, "Permission denied")))
    assert denied.status == "FAIL"
    assert "Permission denied" in denied.detail


def test_real_rom_hash_is_the_default() -> None:
    assert doctor.Probes.__dataclass_fields__["rom_sha1"].default == EMERALD_SHA1


ENDPOINT = Path("/lanes/endpoint.json")
LISTED = {"data": [{"id": "lane-a"}, {"id": "lane-b"}, "junk"]}


def endpoint_env(**extra: str) -> dict[str, str]:
    return {"POKEBENCH_ENDPOINT_FILE": str(ENDPOINT), **extra}


def endpoint_text(body: object) -> dict[Path, str]:
    return {ENDPOINT: json.dumps(body)}


def test_endpoint_file_reaches_models_with_its_key() -> None:
    sent: list[tuple[str, Mapping[str, str]]] = []
    good = {"base_url": "http://127.0.0.1:8080/v1/", "api_key": "k"}
    checks = by_name(
        doctor.check_model(
            probes(
                env=endpoint_env(POKEBENCH_MODEL="lane-b"),
                texts=endpoint_text(good),
                models=LISTED,
                requests=sent,
            )
        )
    )
    assert sent == [("http://127.0.0.1:8080/v1/models", {"Authorization": "Bearer k"})]
    assert checks["endpoint"].detail == "/models lists 2 model(s)"
    assert checks["model id"].status == "PASS"


@pytest.mark.parametrize(
    ("text", "needle"),
    [
        (None, "cannot read"),
        ("{", "not JSON"),
        (json.dumps({"base_url": "http://10.0.0.5:8080/v1", "api_key": "k"}), "127.0.0.1"),
        (json.dumps({"base_url": "https://127.0.0.1:8080/v1", "api_key": "k"}), "127.0.0.1"),
        (json.dumps([1]), "127.0.0.1"),
        (json.dumps({"base_url": "http://127.0.0.1:8080/v1", "api_key": ""}), "api_key"),
        (json.dumps({"base_url": "http://[::1", "api_key": "k"}), "127.0.0.1"),
    ],
)
def test_bad_endpoint_files_fail(text: str | None, needle: str) -> None:
    texts = {} if text is None else {ENDPOINT: text}
    checks = doctor.check_model(probes(env=endpoint_env(), texts=texts))
    assert checks[0].status == "FAIL"
    assert needle in checks[0].detail
    assert checks[1].status == "SKIP"


def test_endpoint_file_wins_over_the_gateway() -> None:
    sent: list[tuple[str, Mapping[str, str]]] = []
    good = {"base_url": "http://127.0.0.1:8080/v1", "api_key": "k"}
    env = endpoint_env(POKEBENCH_GATEWAY_URL="http://127.0.0.1:9000/v1", POKEBENCH_MODEL="lane-a")
    doctor.check_model(probes(env=env, texts=endpoint_text(good), models=LISTED, requests=sent))
    assert sent[0][0] == "http://127.0.0.1:8080/v1/models"


def test_gateway() -> None:
    sent: list[tuple[str, Mapping[str, str]]] = []
    env = {"POKEBENCH_GATEWAY_URL": "http://127.0.0.1:9000/v1/", "POKEBENCH_MODEL": "lane-a"}
    checks = doctor.check_model(probes(env=env, models=LISTED, requests=sent))
    assert sent == [("http://127.0.0.1:9000/v1/models", {})]
    assert [c.status for c in checks] == ["PASS", "PASS"]
    bad = doctor.check_model(probes(env={"POKEBENCH_GATEWAY_URL": "ftp://x"}))
    assert bad[0].status == "FAIL"
    assert "http(s)" in bad[0].detail
    malformed = doctor.check_model(probes(env={"POKEBENCH_GATEWAY_URL": "http://[zz]/v1"}))
    assert malformed[0].status == "FAIL"
    assert "http(s)" in malformed[0].detail


def test_unreachable_or_odd_endpoints() -> None:
    env = {"POKEBENCH_GATEWAY_URL": "http://127.0.0.1:9000/v1", "POKEBENCH_MODEL": "lane-a"}
    down = doctor.check_model(probes(env=env, raise_on_get=ConnectionRefusedError()))
    assert "ConnectionRefusedError" in down[0].detail
    assert down[1].detail == "endpoint unreachable"
    odd = doctor.check_model(probes(env=env, models={"object": "list"}))
    assert odd[0].detail == "/models did not return a model list"
    listless = doctor.check_model(probes(env=env, models=["lane-a"]))
    assert listless[0].status == "FAIL"


def test_model_id() -> None:
    gateway = {"POKEBENCH_GATEWAY_URL": "http://127.0.0.1:9000/v1"}
    unset = doctor.check_model(probes(env=gateway, models=LISTED))
    assert unset[1].detail == "POKEBENCH_MODEL is not set"
    other = doctor.check_model(probes(env={**gateway, "POKEBENCH_MODEL": "lane-z"}, models=LISTED))
    assert "listed: lane-a, lane-b" in other[1].detail
    empty = doctor.check_model(
        probes(env={**gateway, "POKEBENCH_MODEL": "lane-z"}, models={"data": []})
    )
    assert "listed: none" in empty[1].detail


def test_render_shows_fixes_only_for_misses_and_a_tally() -> None:
    text = render(
        [
            Check("core", "node", "PASS", "v26", "unused"),
            Check("game", "ROM", "FAIL", "unset", "set it"),
            Check("model", "endpoint", "SKIP", "none"),
        ]
    )
    assert "unused" not in text
    assert "fix: set it" in text
    assert text.endswith("1 passed, 1 failed, 1 skipped")
    assert render([]).endswith("0 passed, 0 failed, 0 skipped")


def test_exit_code_and_tier_arguments() -> None:
    assert doctor.exit_code([Check("model", "endpoint", "SKIP", "none")]) == 0
    assert doctor.exit_code([Check("game", "ROM", "FAIL", "unset")]) == 1
    assert doctor.parse_tier([]) == "model"
    assert doctor.parse_tier(["core"]) == "core"
    with pytest.raises(SystemExit, match="usage"):
        doctor.parse_tier(["everything"])
    with pytest.raises(SystemExit):
        doctor.parse_tier(["core", "game"])


def test_version_parsing() -> None:
    assert doctor._version_tuple("v26.7.0") == (26, 7, 0)
    assert doctor._version_tuple("26.0.0-rc1") == (26, 0, 0)
    assert doctor._version_tuple("x") == ()
