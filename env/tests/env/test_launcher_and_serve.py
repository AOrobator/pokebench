import asyncio
import base64
import os
import threading
import types
from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI, WebSocketDisconnect
from PIL import Image

from pokebench_env.launcher import VENDOR_DIR, ServerSpec, server_command
from pokebench_env.serve import (
    install_deadline_frame_stream,
    install_on_demand_frame_cache,
    pin_localhost,
    run,
)


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


def test_frame_cache_skips_encoder_without_websocket_consumers() -> None:
    old_calls: list[object] = []
    manager = types.SimpleNamespace(
        lock=threading.Lock(), active_connections=[], latest_frame={"stale": True}
    )
    server = types.SimpleNamespace(
        frame_manager=manager, update_frame_cache=lambda frame: old_calls.append(frame)
    )

    install_on_demand_frame_cache(server, lambda: 900)
    for frame in range(120):
        server.update_frame_cache(frame)

    assert old_calls == []
    assert manager.latest_frame is None


def test_frame_cache_publishes_every_nominal_source_frame_with_actual_counts() -> None:
    class Manager:
        def __init__(self) -> None:
            self.lock = threading.Lock()
            self.active_connections = [object()]
            self._latest_frame = None
            self.publications: list[dict[str, object]] = []

        @property
        def latest_frame(self):  # type: ignore[no-untyped-def]
            return self._latest_frame

        @latest_frame.setter
        def latest_frame(self, payload):  # type: ignore[no-untyped-def]
            self._latest_frame = payload
            if payload is not None:
                self.publications.append(payload)

    old_calls: list[object] = []
    counts = iter((401, 402, 404))
    manager = Manager()
    server = types.SimpleNamespace(
        frame_manager=manager, update_frame_cache=lambda frame: old_calls.append(frame)
    )

    now = 1234.5
    install_on_demand_frame_cache(server, lambda: next(counts), clock=lambda: now)
    for color in ((255, 0, 0), (0, 255, 0), (0, 0, 255)):
        server.update_frame_cache(Image.new("RGB", (2, 1), color))
        now += 1 / 59.7275

    assert old_calls == []
    assert [payload["frame_count"] for payload in manager.publications] == [401, 402, 404]
    assert all(
        set(payload) == {"frame_data", "frame_count", "timestamp"}
        for payload in manager.publications
    )
    assert [payload["timestamp"] for payload in manager.publications] == pytest.approx(
        [1234.5, 1234.5 + 1 / 59.7275, 1234.5 + 2 / 59.7275]
    )
    final = manager.publications[-1]
    png = Image.open(BytesIO(base64.b64decode(str(final["frame_data"]), validate=True)))
    assert png.format == "PNG" and png.size == (2, 1)
    assert png.getpixel((0, 0)) == (0, 0, 255)


def test_frame_cache_caps_four_x_dialog_encoding_at_delivery_rate() -> None:
    class Manager:
        lock = threading.Lock()
        active_connections = [object()]
        latest_frame = None

    manager = Manager()
    server = types.SimpleNamespace(frame_manager=manager, update_frame_cache=lambda _frame: None)
    now = 0.0
    publications = 0

    def count() -> int:
        nonlocal publications
        publications += 1
        return publications

    install_on_demand_frame_cache(server, count, clock=lambda: now, max_publish_fps=60.0)
    frame = Image.new("RGB", (2, 1), (1, 2, 3))
    for _ in range(240):
        server.update_frame_cache(frame)
        now += 1 / (4 * 59.7275)

    assert 59 <= publications <= 61


def test_frame_cache_accepts_numpy_and_reconnects_without_stale_frame() -> None:
    old_calls: list[object] = []
    manager = types.SimpleNamespace(
        lock=threading.Lock(), active_connections=[object()], latest_frame=None
    )
    server = types.SimpleNamespace(
        frame_manager=manager, update_frame_cache=lambda frame: old_calls.append(frame)
    )
    count = 10

    install_on_demand_frame_cache(server, lambda: count, clock=lambda: 7.0)
    server.update_frame_cache(np.full((1, 2, 3), (12, 34, 56), dtype=np.uint8))
    first = manager.latest_frame
    manager.active_connections.clear()
    server.update_frame_cache(np.zeros((1, 2, 3), dtype=np.uint8))
    assert manager.latest_frame is None

    count = 11
    manager.active_connections.append(object())
    server.update_frame_cache(np.full((1, 2, 3), (65, 43, 21), dtype=np.uint8))
    second = manager.latest_frame

    assert old_calls == []
    assert first is not None and first["frame_count"] == 10
    assert second is not None and second["frame_count"] == 11
    assert first["frame_data"] != second["frame_data"]


def test_pinned_websocket_consumes_latest_frame_count_and_full_payload() -> None:
    source = (Path(VENDOR_DIR) / "server" / "app.py").read_text()

    assert 'frame_count = self.latest_frame.get("frame_count", 0)' in source
    assert "message = json.dumps(self.latest_frame)" in source
    assert "await websocket.send_text(message)" in source


def test_deadline_frame_stream_connects_sends_and_disconnects() -> None:
    calls: list[str] = []

    class Manager:
        lock = threading.Lock()
        active_connections: list[object] = []
        latest_frame = None

        async def connect(self, websocket):  # type: ignore[no-untyped-def]
            calls.append("connect")

        async def send_latest_frame(self, websocket):  # type: ignore[no-untyped-def]
            calls.append("send")
            if calls.count("send") == 2:
                raise WebSocketDisconnect()

        def disconnect(self, websocket):  # type: ignore[no-untyped-def]
            calls.append("disconnect")

    api = FastAPI()
    install_deadline_frame_stream(api, Manager())
    route = next(route for route in api.routes if getattr(route, "path", "") == "/pokebench/frames")
    asyncio.run(route.endpoint(object()))

    assert calls == ["connect", "send", "send", "disconnect"]


def test_run_installs_frame_cache_gate_before_vendor_main() -> None:
    encoded: list[object] = []
    manager = types.SimpleNamespace(lock=threading.Lock(), active_connections=[], latest_frame=None)
    server = types.SimpleNamespace(
        frame_manager=manager, update_frame_cache=lambda frame: encoded.append(frame)
    )

    def vendor_main() -> None:
        server.update_frame_cache("frame")

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *args, **kwargs: None),
        vendor_main=vendor_main,
        frame_cache=(server, lambda: 77),
    )

    assert encoded == []


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
                "PYTHONPATH": os.pathsep.join(
                    (str(vendor), str(Path(__file__).resolve().parents[2]))
                ),
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


def test_exec_mode_hands_the_process_to_the_server(monkeypatch, tmp_path) -> None:
    from pokebench_env import launcher

    seen: dict[str, object] = {}

    def prepare(env, run_dir):
        seen["prepared"] = run_dir
        return tmp_path

    def execvpe(file, argv, env):
        seen.update(file=file, argv=list(argv), env=dict(env))
        raise SystemExit(0)

    monkeypatch.setattr(launcher, "prepare", prepare)
    monkeypatch.setattr(launcher, "server_env", lambda *a, **k: {"PB": "1"})
    monkeypatch.setattr(launcher.os, "chdir", lambda path: seen.update(cwd=path))
    monkeypatch.setattr(launcher.os, "execvpe", execvpe)
    with pytest.raises(SystemExit):
        launcher.main(
            ["--run-dir", str(tmp_path), "--run-id", "probe-test", "--port", "8033", "--exec"]
        )
    assert seen["prepared"] == tmp_path
    assert seen["cwd"] == tmp_path
    argv = seen["argv"]
    assert isinstance(argv, list)
    assert argv[1:5] == ["-m", "pokebench_env.serve", "--port", "8033"]
    assert seen["env"] == {"PB": "1"}
