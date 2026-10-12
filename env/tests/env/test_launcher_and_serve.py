import types
from pathlib import Path

import pytest

from pokebench_env.launcher import ServerSpec, server_command
from pokebench_env.serve import pin_localhost, run


def test_server_command_is_an_exact_argv(tmp_path: Path) -> None:
    python = tmp_path / "py thon; $(x)"
    spec = ServerSpec(port=8000, no_ocr=True, load_state=None)
    assert server_command(python, spec) == [
        str(python),
        "-m",
        "pokebench_env.serve",
        "--port",
        "8000",
        "--no-ocr",
    ]


def test_server_command_passes_load_state_as_one_argument(tmp_path: Path) -> None:
    state = tmp_path / "runs" / "split 1; rm -rf ~.state"
    spec = ServerSpec(port=8123, no_ocr=False, load_state=state)
    argv = server_command(Path("/py"), spec)
    assert argv == [
        "/py",
        "-m",
        "pokebench_env.serve",
        "--port",
        "8123",
        "--load-state",
        str(state),
    ]


@pytest.mark.parametrize("port", [0, 80, 65536])
def test_server_spec_rejects_privileged_or_invalid_ports(port: int) -> None:
    with pytest.raises(ValueError, match="port"):
        ServerSpec(port=port, no_ocr=True, load_state=None)


def test_pin_localhost_forces_host_on_every_call() -> None:
    calls: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def capturing_run(*args: object, **kwargs: object) -> None:
        calls.append((args, kwargs))

    uvicorn = types.SimpleNamespace(run=capturing_run)
    pin_localhost(uvicorn)
    uvicorn.run("app", host="0.0.0.0", port=8000)
    uvicorn.run("app", port=9000)
    assert calls == [
        (("app",), {"host": "127.0.0.1", "port": 8000}),
        (("app",), {"host": "127.0.0.1", "port": 9000}),
    ]


def test_run_pins_host_then_hands_argv_to_vendor_main() -> None:
    seen: dict[str, object] = {}

    def capturing_uvicorn_run(*args: object, **kwargs: object) -> None:
        seen["uvicorn_kwargs"] = kwargs

    uvicorn = types.SimpleNamespace(run=capturing_uvicorn_run)

    def vendor_main() -> None:
        import sys

        seen["argv"] = list(sys.argv)
        uvicorn.run("server.app:app", host="0.0.0.0", port=8000)

    run(["--port", "8000", "--no-ocr"], uvicorn=uvicorn, vendor_main=vendor_main)
    assert seen["argv"] == ["server.app", "--port", "8000", "--no-ocr"]
    assert seen["uvicorn_kwargs"] == {"host": "127.0.0.1", "port": 8000}


def test_spawn_runs_the_server_from_the_run_server_dir(tmp_path: Path) -> None:
    from pokebench_env.launcher import spawn

    calls: list[dict[str, object]] = []

    def capturing_popen(argv: list[str], *, cwd: Path, env: dict[str, str]) -> str:
        calls.append({"argv": argv, "cwd": cwd, "env": env})
        return "process"

    vendor = tmp_path / "vendor"
    server_dir = tmp_path / "runs" / "r1" / "server"
    spec = ServerSpec(port=8000, no_ocr=True, load_state=None)
    result = spawn(
        spec,
        python=Path("/venv/bin/python"),
        vendor_dir=vendor,
        server_dir=server_dir,
        run_id="r1",
        pycache_dir=tmp_path / "pycache",
        base_env={"PATH": "/usr/bin", "PYTHONPATH": "/elsewhere"},
        popen=capturing_popen,
    )
    assert result == "process"
    assert calls == [
        {
            "argv": server_command(Path("/venv/bin/python"), spec),
            "cwd": server_dir,
            "env": {
                "PATH": "/usr/bin",
                "PYTHONPATH": str(vendor),
                "RUN_DATA_ID": "r1",
                "LOAD_CHECKPOINT_MODE": "false",
                "PYTHONPYCACHEPREFIX": str(tmp_path / "pycache"),
            },
        }
    ]


def test_prepare_checks_vendor_then_builds_the_run_server_dir(tmp_path: Path) -> None:
    from pokebench_env import launcher

    order: list[str] = []
    vendor = tmp_path / "vendor"
    rom = tmp_path / "rom.gba"
    run_dir = tmp_path / "runs" / "r1"
    server_dir = launcher.prepare(
        {"POKEBENCH_ROM": str(rom)},
        run_dir=run_dir,
        vendor_dir=vendor,
        check=lambda path: order.append(f"check {path}"),
        resolve=lambda env: (order.append(f"resolve {env['POKEBENCH_ROM']}"), rom)[1],
        make_server_dir=lambda run, found, ven: (
            order.append(f"make {run} {found} {ven}"),
            run / "server",
        )[1],
    )
    assert server_dir == run_dir / "server"
    assert order == [f"check {vendor}", f"resolve {rom}", f"make {run_dir} {rom} {vendor}"]


def test_run_installs_the_observation_route_before_vendor_main() -> None:
    from fastapi import FastAPI

    app = FastAPI()
    uvicorn = types.SimpleNamespace(run=lambda *a, **k: None)
    routes: list[list[str]] = []

    from pydantic import BaseModel

    from pokebench_env.game_state import MapNames

    def get_screenshot() -> BaseModel:
        return BaseModel()

    def vendor_main() -> None:
        routes.append([getattr(r, "path", "") for r in app.routes])

    run(
        [],
        uvicorn=uvicorn,
        vendor_main=vendor_main,
        observation=(app, get_screenshot, lambda a, n: bytes(n), MapNames({})),
    )
    assert "/pokebench/observation" in routes[0]


def test_launcher_cli_forwards_load_state_exactly(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from pokebench_env import launcher

    seen = []

    class Process:
        def wait(self) -> int:
            return 0

        def terminate(self) -> None:
            pass

    def launch(spec: ServerSpec, run_dir: Path, run_id: str) -> Process:
        seen.append((spec, run_dir, run_id))
        return Process()

    saved = tmp_path / "continuation with spaces.state"
    monkeypatch.setattr(launcher, "launch", launch)
    monkeypatch.setattr(launcher, "forward_sigterm", lambda _: None)
    assert (
        launcher.main(
            [
                "--run-dir",
                str(tmp_path),
                "--run-id",
                "probe-test",
                "--port",
                "8032",
                "--load-state",
                str(saved),
            ]
        )
        == 0
    )
    assert seen == [(ServerSpec(port=8032, no_ocr=True, load_state=saved), tmp_path, "probe-test")]
