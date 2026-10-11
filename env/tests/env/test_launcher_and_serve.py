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
