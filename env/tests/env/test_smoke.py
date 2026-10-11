from dataclasses import dataclass, field
from pathlib import Path

import pytest

from pokebench_env.client import Button, GameState, Milestone, Screenshot
from pokebench_env.smoke import SmokeError, SmokeReport, run_smoke


@dataclass
class FakeClient:
    health_sequence: list[bool]
    pressed: list[list[Button]] = field(default_factory=list)

    def healthy(self) -> bool:
        return self.health_sequence.pop(0) if self.health_sequence else True

    def press(self, buttons: list[Button]) -> None:
        self.pressed.append(buttons)

    def state(self) -> GameState:
        return GameState(
            location="TITLE_SEQUENCE", x=0, y=0, in_battle=False, badges=0, money=0, step=1
        )

    def screenshot(self) -> Screenshot:
        return Screenshot(png=b"\x89PNG", width=240, height=160, step=1)

    def milestones(self) -> list[Milestone]:
        return [Milestone(name="GAME_RUNNING", completed=True, timestamp=1.0)]


@dataclass
class FakeProcess:
    exit_code: int | None = None
    terminated: bool = False

    def poll(self) -> int | None:
        return self.exit_code

    def terminate(self) -> None:
        self.terminated = True

    def wait(self, timeout: float | None = None) -> int:
        return 0


def test_smoke_waits_for_health_then_exercises_every_endpoint(tmp_path: Path) -> None:
    client = FakeClient(health_sequence=[False, False, True])
    process = FakeProcess()
    sleeps: list[float] = []
    report = run_smoke(client, process, sleep=sleeps.append, attempts=10)
    assert client.pressed == [[Button.A]]
    assert sleeps == [0.5, 0.5]
    assert report == SmokeReport(
        location="TITLE_SEQUENCE",
        screenshot_bytes=4,
        milestones_completed=["GAME_RUNNING"],
    )
    assert process.terminated


def test_smoke_fails_if_server_never_becomes_healthy() -> None:
    process = FakeProcess()
    with pytest.raises(SmokeError, match="healthy"):
        run_smoke(
            FakeClient(health_sequence=[False] * 5), process, sleep=lambda _: None, attempts=3
        )
    assert process.terminated


def test_smoke_fails_fast_if_server_process_exits() -> None:
    process = FakeProcess(exit_code=1)
    with pytest.raises(SmokeError, match="exited with code 1"):
        run_smoke(FakeClient(health_sequence=[False]), process, sleep=lambda _: None, attempts=3)
