"""Pytest plugin: disk, process or network access from repo code fails the test.

Each test may also create one asyncio event loop. A loop's self-pipe is the only call the guard
lets through; socketpair raises two audit events, so a third event means a second loop.
"""

import os
import sys
from collections.abc import Callable, Generator
from types import FrameType
from typing import TypeVar

import pytest

PREFIXES = (
    "open",
    "os.",
    "shutil.",
    "tempfile.",
    "subprocess.",
    "socket.",
    "glob.",
    "pathlib.",
    "sqlite3.connect",
    "urllib.Request",
    "ftplib.",
    "http.client.",
    "smtplib.",
)
IGNORED = {"os.putenv", "os.unsetenv"}
TMP_FIXTURES = {"tmp_path", "tmpdir", "tmp_path_factory", "tmpdir_factory"}
REPO_MARKERS = (
    "/env/tests/",
    "/env/pokebench_env/",
    "/env/pokebench_gates/",
    "/scripts/",
    "/.claude/skills/",
)
MAX_SELF_PIPE_EVENTS = 2
TOOLS = ("/_pytest/assertion/", "/site-packages/coverage/")

violations: list[str] = []
self_pipe_events = 0
R = TypeVar("R")


def _is_self_pipe(frame: FrameType | None) -> bool:
    while frame is not None:
        code = frame.f_code
        if code.co_name == "_make_self_pipe" and code.co_filename.endswith(
            "asyncio/selector_events.py"
        ):
            return True
        frame = frame.f_back
    return False


def _is_test_file(name: str) -> bool:
    base = name.rsplit("/", 1)[-1]
    return "/env/tests/" in name or base.startswith("test_") or base == "conftest.py"


def _from_repo(frame: FrameType | None) -> bool:
    """True when repo code is on the stack, unless an application module is being imported."""
    found = False
    tested = False
    while frame is not None:
        name = frame.f_code.co_filename
        if name.startswith("<frozen importlib") and not tested:
            return False
        if not tested and any(tool in name for tool in TOOLS):
            return False
        if name != __file__ and any(marker in name for marker in REPO_MARKERS):
            found = True
            tested = tested or _is_test_file(name)
        frame = frame.f_back
    return found


def _forbid(event: str) -> None:
    message = f"I/O is forbidden in tests: {event}"
    violations.append(message)
    raise OSError(message)


def _hook(event: str, _args: tuple[object, ...]) -> None:
    global self_pipe_events
    if event in IGNORED or not event.startswith(PREFIXES):
        return
    frame = sys._getframe(1)
    if _is_self_pipe(frame):
        self_pipe_events += 1
        if self_pipe_events > MAX_SELF_PIPE_EVENTS:
            _forbid("a second event loop")
        return
    if _from_repo(frame):
        _forbid(event)


def _guard_metadata(name: str, original: Callable[..., R]) -> Callable[..., R]:
    """os.stat and friends raise no audit event, so they are wrapped by hand."""

    def guarded(*args: object, **kwargs: object) -> R:
        if _from_repo(sys._getframe(1)):
            _forbid(f"os.{name}")
        return original(*args, **kwargs)

    return guarded


sys.addaudithook(_hook)
os.stat = _guard_metadata("stat", os.stat)
os.lstat = _guard_metadata("lstat", os.lstat)
os.access = _guard_metadata("access", os.access)


def pytest_collection_finish() -> None:
    violations.clear()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_protocol() -> Generator[None]:
    global self_pipe_events
    self_pipe_events = 0
    yield


@pytest.fixture(autouse=True)
def _forbid_tmp(request: pytest.FixtureRequest) -> None:
    used = TMP_FIXTURES.intersection(request.fixturenames)
    if used:
        violations.append(f"I/O is forbidden in tests: fixture {sorted(used)}")
        pytest.fail(f"I/O is forbidden in tests: fixture {sorted(used)}")


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(call: pytest.CallInfo[None]) -> Generator[None, pytest.TestReport]:
    outcome = yield
    report = outcome.get_result()
    if call.when == "setup" or not violations:
        return
    message = "; ".join(sorted(set(violations)))
    violations.clear()
    if report.passed:
        report.outcome = "failed"
        report.longrepr = message
