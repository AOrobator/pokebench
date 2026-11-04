import signal
from pathlib import Path

import pytest

from pokebench_env.run_server import (
    RunServerError,
    forward_sigterm,
    validate_run_id,
)


@pytest.fixture
def vendor(tmp_path: Path) -> Path:
    root = tmp_path / "vendor"
    (root / "server").mkdir(parents=True)
    (root / "server" / "stream.html").write_text("<html></html>")
    return root


@pytest.mark.parametrize(
    "run_id", ["", "../escape", "a/b", ".hidden", "x" * 129, "has space", "semi;colon"]
)
def test_run_ids_must_be_a_single_safe_path_component(run_id: str) -> None:
    with pytest.raises(RunServerError, match="run id"):
        validate_run_id(run_id)


class FakeProcess:
    def __init__(self) -> None:
        self.terminated = 0

    def terminate(self) -> None:
        self.terminated += 1


def test_sigterm_is_forwarded_to_the_server_process() -> None:
    process = FakeProcess()
    installed: dict[int, object] = {}

    def fake_signal(signum: int, handler: object) -> None:
        installed[signum] = handler

    forward_sigterm(process, fake_signal)
    handler = installed[signal.SIGTERM]
    assert callable(handler)
    handler(signal.SIGTERM, None)
    assert process.terminated == 1
