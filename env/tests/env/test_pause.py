"""Operator pause: the game server holds the vendor frame loop between frames."""

import asyncio
import json
import threading
import types

from fastapi import FastAPI

from pokebench_env.pause import install_pause


def post(app: FastAPI, path: str, body: bytes) -> tuple[int, bytes]:
    messages: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    asyncio.run(
        app(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": path,
                "raw_path": path.encode(),
                "query_string": b"",
                "headers": [(b"content-type", b"application/json")],
                "server": ("127.0.0.1", 8000),
                "client": ("127.0.0.1", 1234),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    status = messages[0]["status"]
    assert isinstance(status, int)
    chunks = [m.get("body", b"") for m in messages[1:]]
    return status, b"".join(chunk for chunk in chunks if isinstance(chunk, bytes))


def server_module() -> tuple[types.SimpleNamespace, list[list[str]]]:
    stepped: list[list[str]] = []
    module = types.SimpleNamespace(step_environment=lambda actions: stepped.append(list(actions)))
    return module, stepped


def test_pause_holds_the_next_frame_until_resume() -> None:
    app = FastAPI()
    module, stepped = server_module()
    install_pause(app, module)
    module.step_environment(["A"])
    assert stepped == [["A"]]
    assert post(app, "/pokebench/pause", b'{"paused": true}') == (200, b'{"paused":true}')
    worker = threading.Thread(target=module.step_environment, args=([],))
    worker.start()
    worker.join(0.2)
    assert worker.is_alive() and stepped == [["A"]]
    assert post(app, "/pokebench/pause", b'{"paused": false}') == (200, b'{"paused":false}')
    worker.join(2)
    assert not worker.is_alive() and stepped == [["A"], []]


def test_pause_requests_are_typed() -> None:
    app = FastAPI()
    module, _ = server_module()
    install_pause(app, module)
    for body in (
        b"{}",
        b'{"paused": "yes"}',
        b"not json",
        json.dumps({"paused": True, "x": 1}).encode(),
    ):
        status, _ = post(app, "/pokebench/pause", body)
        assert status == 422, body


def test_serve_installs_pause_before_vendor_main() -> None:
    from pokebench_env.serve import run

    app = FastAPI()
    module, _ = server_module()
    original = module.step_environment
    seen: list[bool] = []

    def vendor_main() -> None:
        seen.append(
            "/pokebench/pause" in [getattr(r, "path", "") for r in app.routes]
            and module.step_environment is not original
        )

    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=vendor_main,
        pause=(app, module),
    )
    assert seen == [True]
