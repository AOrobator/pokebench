from dataclasses import dataclass, field

import pytest

from pokebench_env.client import Button, GameState, Milestone, Screenshot
from pokebench_env.smoke import SmokeError, run_smoke


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
