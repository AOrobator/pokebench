"""End-to-end smoke check: boot the real game server on the real ROM and exercise it."""

import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from pokebench_env.client import (
    Button,
    GameClient,
    GameState,
    Milestone,
    Screenshot,
    http_transport,
)
from pokebench_env.launcher import RUNS_DIR, VENDOR_DIR, ServerSpec, launch
from pokebench_env.run_server import default_run_id
from pokebench_env.vendor import check_vendor


class SmokeError(RuntimeError):
    pass


class SmokeClient(Protocol):
    def healthy(self) -> bool: ...
    def press(self, buttons: list[Button]) -> None: ...
    def state(self) -> GameState: ...
    def screenshot(self) -> Screenshot: ...
    def milestones(self) -> list[Milestone]: ...


class ServerProcess(Protocol):
    def poll(self) -> int | None: ...
    def terminate(self) -> None: ...
    def wait(self, timeout: float | None = None) -> int: ...


@dataclass(frozen=True)
class SmokeReport:
    location: str
    screenshot_bytes: int
    milestones_completed: list[str]


def run_smoke(
    client: SmokeClient,
    process: ServerProcess,
    sleep: Callable[[float], None] = time.sleep,
    attempts: int = 120,
) -> SmokeReport:
    try:
        for attempt in range(attempts):
            code = process.poll()
            if code is not None:
                raise SmokeError(f"game server exited with code {code} before becoming healthy")
            if _healthy(client):
                break
            if attempt < attempts - 1:
                sleep(0.5)
        else:
            raise SmokeError(f"game server not healthy after {attempts} attempts")
        client.press([Button.A])
        state = client.state()
        shot = client.screenshot()
        done = [m.name for m in client.milestones() if m.completed]
        return SmokeReport(
            location=state.location, screenshot_bytes=len(shot.png), milestones_completed=done
        )
    finally:
        process.terminate()
        process.wait(timeout=10)


def _healthy(client: SmokeClient) -> bool:
    try:
        return client.healthy()
    except Exception:  # noqa: BLE001 - connection refused while booting is expected
        return False


def main() -> int:  # pragma: no cover - entrypoint, exercised by `just smoke`
    port = int(os.environ.get("POKEBENCH_SMOKE_PORT", "8765"))
    run_id = "smoke_" + default_run_id(datetime.now(UTC)).removeprefix("serve_")
    process = launch(ServerSpec(port=port, no_ocr=True, load_state=None), RUNS_DIR / run_id, run_id)
    client = GameClient(http_transport(f"http://127.0.0.1:{port}"))
    report = run_smoke(client, process)
    print(f"smoke OK: {report}")
    check_vendor(VENDOR_DIR)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
