"""Operator pause: the game server holds the vendor frame loop between frames."""

import asyncio
import json
import threading
import time
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


class FrameLoop:
    """A paced stand-in for the vendor game loop that counts frames."""

    def __init__(self, module: types.SimpleNamespace) -> None:
        self.frames = 0
        self.stop = threading.Event()
        self.module = module
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self) -> None:
        while not self.stop.is_set() and self.frames < 100_000:
            self.module.step_environment([])
            self.frames += 1
            time.sleep(0.001)

    def __enter__(self) -> "FrameLoop":
        self.thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self.stop.set()


def test_pause_is_confirmed_only_once_the_frame_loop_is_parked() -> None:
    app = FastAPI()
    module = types.SimpleNamespace(step_environment=lambda actions: None)
    install_pause(app, module)
    with FrameLoop(module) as loop:
        time.sleep(0.05)
        assert post(app, "/pokebench/pause", b'{"paused": true}') == (200, b'{"paused":true}')
        frozen = loop.frames
        time.sleep(0.1)
        assert loop.frames == frozen
        # Resume and pause again at once: confirmation needs a fresh park.
        assert post(app, "/pokebench/pause", b'{"paused": false}') == (200, b'{"paused":false}')
        assert post(app, "/pokebench/pause", b'{"paused": true}') == (200, b'{"paused":true}')
        again = loop.frames
        time.sleep(0.1)
        assert loop.frames == again
        assert post(app, "/pokebench/pause", b'{"paused": false}') == (200, b'{"paused":false}')
        time.sleep(0.05)
        assert loop.frames > again
        loop.stop.set()
        post(app, "/pokebench/pause", b'{"paused": false}')
        loop.thread.join(2)


def test_pause_waits_for_the_frame_in_progress() -> None:
    app = FastAPI()
    in_frame = threading.Event()
    release = threading.Event()

    def slow_step(actions: list[str]) -> None:
        in_frame.set()
        release.wait(2)

    module = types.SimpleNamespace(step_environment=slow_step)
    install_pause(app, module)
    worker = threading.Thread(
        target=lambda: [module.step_environment([]) for _ in range(2)], daemon=True
    )
    worker.start()
    assert in_frame.wait(2)
    answer: list[tuple[int, bytes]] = []
    pauser = threading.Thread(
        target=lambda: answer.append(post(app, "/pokebench/pause", b'{"paused": true}'))
    )
    pauser.start()
    pauser.join(0.2)
    assert pauser.is_alive() and answer == []
    release.set()
    pauser.join(2)
    assert answer == [(200, b'{"paused":true}')]
    post(app, "/pokebench/pause", b'{"paused": false}')
    worker.join(2)
    assert not worker.is_alive()


def test_an_unconfirmed_pause_is_rolled_back() -> None:
    app = FastAPI()
    module, stepped = server_module()
    install_pause(app, module, park_timeout_s=0.05)
    status, body = post(app, "/pokebench/pause", b'{"paused": true}')
    assert status == 503 and b"did not park" in body
    worker = threading.Thread(target=module.step_environment, args=([],), daemon=True)
    worker.start()
    worker.join(2)
    assert not worker.is_alive() and stepped == [[]]


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


def test_repeated_pause_is_idempotent_and_never_resumes_parked_frames() -> None:
    app = FastAPI()
    module, _ = server_module()
    install_pause(app, module, park_timeout_s=0.05)
    with FrameLoop(module) as loop:
        assert post(app, "/pokebench/pause", b'{"paused": true}')[0] == 200
        frozen = loop.frames
        assert post(app, "/pokebench/pause", b'{"paused": true}') == (200, b'{"paused":true}')
        time.sleep(0.02)
        assert loop.frames == frozen
        loop.stop.set()
        post(app, "/pokebench/pause", b'{"paused": false}')
        loop.thread.join(2)
