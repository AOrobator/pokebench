import subprocess
from collections.abc import Sequence

import pytest

from pokebench_env.current_runtime import UNLOAD_POLLS, Config, Runner, _unload

CONFIG: Config = {"Label": "local.pokebench.current.test"}


def launchctl(prints: list[int]) -> tuple[list[list[str]], Runner]:
    calls: list[list[str]] = []

    def run(args: Sequence[str], **_: object) -> subprocess.CompletedProcess[str]:
        calls.append(list(args))
        code = prints.pop(0) if args[1] == "print" else 0
        return subprocess.CompletedProcess(args, code, "", "")

    return calls, run


def test_unload_waits_until_launchd_has_released_the_service() -> None:
    calls, run = launchctl([0, 0, 0, 113])
    waits: list[float] = []
    assert _unload(CONFIG, 501, run, waits.append) is True
    assert [call[1] for call in calls] == ["print", "bootout", "print", "print", "print"]
    assert len(waits) == 2


def test_unload_reports_a_service_that_was_never_loaded() -> None:
    calls, run = launchctl([113])
    assert _unload(CONFIG, 501, run, lambda _: None) is False
    assert [call[1] for call in calls] == ["print"]


def test_unload_refuses_to_continue_while_the_service_stays_loaded() -> None:
    _, run = launchctl([0] * (UNLOAD_POLLS + 1))
    with pytest.raises(RuntimeError, match="still loaded"):
        _unload(CONFIG, 501, run, lambda _: None)
