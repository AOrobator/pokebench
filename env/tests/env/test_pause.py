"""Operator pause: the game server holds the vendor frame loop between frames."""

import threading
import time
import types

from fastapi import FastAPI


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
