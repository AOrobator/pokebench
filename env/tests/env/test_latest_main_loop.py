"""Fake-only rehearsal of the real latest-main controller; no game/model processes."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Callable
from pathlib import Path

import pytest

from pokebench_env.latest_main_loop import Config, Controller, Host, Lane

A = "a" * 40
B = "b" * 40
LANE = Lane("A", 8075, "http://pool:8091", "bundle")


class FakeChild:
    pid = 1234

    def __init__(self, code: int = 0, finish: Callable[[], None] | None = None) -> None:
        self.code = code
        self.calls = 0
        self.finish = finish

    def poll(self) -> int | None:
        self.calls += 1
        if self.calls == 1:
            return None
        if self.finish is not None:
            self.finish()
            self.finish = None
        return self.code


class FakeHost(Host):
    def __init__(self, config: Config) -> None:
        self.c = config
        self.pin = A
        self.trees: dict[Path, str] = {}
        self.commands: list[tuple[list[str], Path]] = []
        self.children: list[tuple[list[str], Path]] = []
        self.live: set[int] = set()
        self.dirty = ""
        self.usage = "frames cap (10%)"
        self.fail_build = False
        self.advance_during_build = False
        self.valid = True
        self.exit = 0
        self.sleeps: list[float] = []
        self.port_busy = False
        self.viewer_stays_stale = False

    def run(self, args: list[str], cwd: Path) -> str:
        self.commands.append((args, cwd))
        if args[:3] == ["git", "rev-parse", "refs/heads/main"]:
            return self.pin
        if args[:2] == ["git", "show"]:
            return json.dumps(
                {
                    "lanes": [{"id": "A", "gamePort": 8075, "modelUrl": "http://pool:8091"}],
                    "plan": [{"lane": "A", "phase": "cook", "arm": "bundle"}],
                }
            )
        if args[:2] == ["git", "clone"]:
            tree = Path(args[-1])
            (tree / ".git").mkdir(parents=True)
            (tree / "env").mkdir()
        if args[:2] == ["git", "checkout"]:
            self.trees[cwd] = args[-1]
        if args == ["git", "rev-parse", "HEAD"]:
            return self.trees[cwd]
        if args == ["git", "status", "--porcelain"]:
            return self.dirty
        if args[:2] == ["pnpm", "-r"]:
            (cwd / "packages/viewer/dist").mkdir(parents=True, exist_ok=True)
            if self.advance_during_build:
                self.pin = B
            if self.fail_build:
                raise subprocess.CalledProcessError(1, args)
        if args == ["just", "viewer-main"] and not self.viewer_stays_stale:
            self.c.viewer_stamp.write_text(json.dumps({"commit": self.pin, "dirty": False}))
        if args == ["just", "runs-disk"]:
            return self.usage
        if args[0] == "lsof":
            if self.port_busy:
                return "99"
            raise subprocess.CalledProcessError(1, args)
        return ""

    def spawn(self, args: list[str], cwd: Path, log: Path) -> FakeChild:
        self.children.append((args, cwd))
        arm = args[args.index("--arm") + 1]
        lane = args[args.index("--lane") + 1]
        identity = f"whole-map-pair-2h-dryrun-cook-solo-{arm}-{lane.lower()}-1"
        directory = self.c.runs / "experiments" / identity
        directory.mkdir(parents=True)
        run = f"run-{len(self.children)}"
        ledger = directory / "trials.jsonl"
        ledger.write_text(
            json.dumps({"kind": "launch", "run": run, "commit": self.trees[cwd]}) + "\n"
        )

        def finish() -> None:
            with ledger.open("a") as stream:
                stream.write(
                    json.dumps({"kind": "outcome", "run": run, "valid": self.valid}) + "\n"
                )

        return FakeChild(self.exit, finish)

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)

    def alive(self, pid: int) -> bool:
        return pid in self.live


@pytest.fixture
def rig(tmp_path: Path) -> tuple[Config, FakeHost, Controller]:
    c = Config(
        tmp_path / "repo",
        tmp_path / "runs",
        tmp_path / "archive",
        tmp_path / "launchers",
        viewer_stamp=tmp_path / "viewer.json",
    )
    for path in (c.repo / "env/.venv", c.runs / "experiments", c.archive, c.launchers):
        path.mkdir(parents=True)
    (c.repo / ".env").write_text("")
    h = FakeHost(c)
    return c, h, Controller(c, h)


def test_each_trial_uses_fresh_main_and_keeps_old_launcher_immutable(
    rig: tuple[Config, FakeHost, Controller],
) -> None:
    c, h, controller = rig
    assert controller.trial(LANE, "bundle")
    first_tree = h.children[0][1]
    h.pin = B
    assert controller.trial(LANE, "control")
    assert [cwd.name for _, cwd in h.children] == [A, B]
    assert h.trees[first_tree] == A
    for args, _ in h.children:
        assert args[:4] == ["just", "fixed-run", "dry-run", "whole-map-pair-2h"]
        assert args[-2:] == ["--lane", "A"]
    assert json.loads((c.archive / "latest-main-A.json").read_text())["commit"] == B
    assert len([args for args, _ in h.commands if args[:2] == ["node", "--env-file=.env"]]) == 2
    assert controller.trial(LANE, "bundle")
    assert list(c.archive.glob("*-solo-bundle-a-1-*"))


@pytest.mark.parametrize("guard", ["pause", "stop", "old_runner", "lease", "port"])
def test_existing_runs_and_holds_prevent_new_launches_without_signals(
    rig: tuple[Config, FakeHost, Controller], guard: str
) -> None:
    c, h, controller = rig
    if guard == "pause":
        c.pause.touch()
    elif guard == "stop":
        c.stop.touch()
    elif guard == "old_runner":
        directory = c.runs / "experiments/old"
        directory.mkdir()
        (directory / "status.json").write_text(
            json.dumps({"pid": 88, "state": "running", "lanes": [{"port": 8075}]})
        )
        h.live.add(88)
    elif guard == "lease":
        directory = c.runs / ".naming-gameplay.pool-8091.lock"
        directory.mkdir()
        (directory / "owner.json").write_text('{"pid":88}')
        h.live.add(88)
    else:
        h.port_busy = True
    assert controller.trial(LANE, "bundle") is False
    assert h.children == []
    assert not any(args[0] in {"kill", "pkill"} for args, _ in h.commands)
    assert h.live == ({88} if guard in {"lease", "old_runner"} else set())


def test_main_advance_during_build_prevents_stale_launch(
    rig: tuple[Config, FakeHost, Controller],
) -> None:
    _, h, controller = rig
    h.advance_during_build = True
    assert controller.trial(LANE, "bundle") is False
    assert h.children == []
    h.advance_during_build = False
    assert controller.trial(LANE, "bundle")
    assert h.children[0][1].name == B


@pytest.mark.parametrize(
    "problem", ["dirty", "build", "frames_full", "frames_unknown", "wrong_head"]
)
def test_failed_preparation_never_falls_back_to_old_main(
    rig: tuple[Config, FakeHost, Controller], problem: str
) -> None:
    _, h, controller = rig
    if problem == "dirty":
        h.dirty = " M source.ts"
    elif problem == "build":
        h.fail_build = True
    elif problem == "frames_full":
        h.usage = "cap (76%)"
    elif problem == "frames_unknown":
        h.usage = "unreadable"
    else:
        controller.prepare(A)
        h.trees[next(iter(h.trees))] = B
    if problem in {"frames_full", "frames_unknown"}:
        assert controller.trial(LANE, "bundle") is False
    else:
        with pytest.raises((ValueError, subprocess.CalledProcessError)):
            controller.trial(LANE, "bundle")
    assert h.children == []


@pytest.mark.parametrize("action", ["abort", "operator_stop", "operator_abort"])
def test_operator_stop_is_global_and_does_not_signal_active_games(
    rig: tuple[Config, FakeHost, Controller], action: str
) -> None:
    c, h, controller = rig
    ledger = next(iter(controller.ledgers))
    ledger.parent.mkdir(parents=True)
    ledger.write_text('{"kind":"launch","run":"run-old"}\n')
    run = c.runs / "run-old"
    run.mkdir()
    if action == "abort":
        (run / "control.jsonl").write_text('{"action":"abort"}\n')
    else:
        (run / "events.jsonl").write_text(json.dumps({"type": "run_end", "reason": action}) + "\n")
    assert controller.observe_stop()
    assert c.stop.exists()
    assert h.children == []


def test_failed_or_unrecorded_trial_is_retained_and_not_a_success(
    rig: tuple[Config, FakeHost, Controller],
) -> None:
    c, h, controller = rig
    h.valid = False
    with pytest.raises(RuntimeError, match="one recorded valid trial"):
        controller.trial(LANE, "bundle")
    assert list((c.runs / "experiments").glob("*/trials.jsonl"))
    h.exit = 2
    with pytest.raises(RuntimeError, match="runner failed"):
        controller.trial(LANE, "bundle")
    assert list(c.archive.glob("*-solo-bundle-a-1-*"))


def test_worker_alternates_only_after_completed_trials(
    rig: tuple[Config, FakeHost, Controller], monkeypatch: pytest.MonkeyPatch
) -> None:
    _, h, controller = rig
    arms: list[str] = []

    def trial(lane: Lane, arm: str) -> bool:
        arms.append(arm)
        if len(arms) == 3:
            controller.stopping.set()
        return len(arms) != 1

    monkeypatch.setattr(controller, "trial", trial)
    controller.worker(LANE)
    assert arms == ["bundle", "bundle", "control"]
    assert len(h.sleeps) == 3


@pytest.mark.parametrize("change", ["experiment", "phase", "wall_ms", "poll", "frame_limit"])
def test_invalid_configuration_is_rejected_before_launch(tmp_path: Path, change: str) -> None:
    from dataclasses import replace

    c = Config(tmp_path, tmp_path, tmp_path, tmp_path)
    invalid: dict[str, object] = {
        "experiment": "../outside",
        "phase": "bad/path",
        "wall_ms": 0,
        "poll": 0,
        "frame_limit": 101,
    }
    with pytest.raises(ValueError):
        replace(c, **{change: invalid[change]})


def test_worker_stops_launching_after_bounded_failures(
    rig: tuple[Config, FakeHost, Controller], monkeypatch: pytest.MonkeyPatch
) -> None:
    c, h, controller = rig

    def fail(lane: Lane, arm: str) -> bool:
        raise RuntimeError("build unavailable")

    monkeypatch.setattr(controller, "trial", fail)
    controller.worker(LANE)
    assert controller.stopping.is_set()
    assert h.children == []
    assert h.sleeps == [c.retry_sleep] * (c.max_failures - 1)


def test_viewer_must_be_clean_and_current(rig: tuple[Config, FakeHost, Controller]) -> None:
    c, h, controller = rig
    c.viewer_stamp.write_text(json.dumps({"commit": A, "dirty": True}))
    assert not controller.viewer_current(A)
    controller.prepare(A)
    assert controller.viewer_current(A)
    assert len([args for args, _ in h.commands if args == ["just", "viewer-main"]]) == 1
    controller.prepare(A)
    assert len([args for args, _ in h.commands if args == ["just", "viewer-main"]]) == 1


def test_main_entry_starts_only_the_controller_and_honors_custom_holds(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import threading

    from pokebench_env import latest_main_loop as module

    captured: list[Config] = []
    workers: list[Lane] = []

    class StandIn:
        def __init__(self, c: Config, h: Host) -> None:
            captured.append(c)
            self.stopping = threading.Event()

        def log(self, message: str) -> None:
            pass

        def head(self) -> str:
            return A

        def lanes(self, pin: str) -> list[Lane]:
            return [LANE]

        def worker(self, lane: Lane) -> None:
            workers.append(lane)

    for key, value in {
        "REPO": str(tmp_path / "repo"),
        "RUNS": str(tmp_path / "runs"),
        "ARCHIVE": str(tmp_path / "archive"),
        "LATEST_MAIN_LAUNCHERS": str(tmp_path / "launchers"),
        "STOP_FILE": str(tmp_path / "custom-stop"),
        "PAUSE_FILE": str(tmp_path / "custom-pause"),
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(module, "Controller", StandIn)
    monkeypatch.setattr(module.signal, "signal", lambda *args: None)
    module.main()
    assert workers == [LANE]
    assert captured[0].stop == tmp_path / "custom-stop"
    assert captured[0].pause == tmp_path / "custom-pause"
    assert (tmp_path / "archive/latest-main-loop.pid").read_text().isdigit()


def test_real_host_keeps_argv_and_never_signals_children(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from pokebench_env import latest_main_loop as module

    calls: list[object] = []

    def output(args: list[str], **kwargs: object) -> str:
        calls.append((args, kwargs))
        return "ok"

    def spawn(args: list[str], **kwargs: object) -> FakeChild:
        calls.append((args, kwargs["cwd"]))
        return FakeChild()

    monkeypatch.setattr(module.subprocess, "check_output", output)
    monkeypatch.setattr(module.subprocess, "Popen", spawn)
    monkeypatch.setattr(module.time, "sleep", lambda seconds: calls.append(seconds))
    monkeypatch.setattr(module.os, "kill", lambda pid, signum: calls.append((pid, signum)))
    h = Host()
    assert h.run(["git", "path with spaces;literal"], tmp_path) == "ok"
    assert h.spawn(["just", "fixed-run"], tmp_path, tmp_path / "log").pid == 1234
    h.sleep(3)
    assert h.alive(1234)
    assert (1234, 0) in calls

    def gone(pid: int, signum: int) -> None:
        raise ProcessLookupError

    monkeypatch.setattr(module.os, "kill", gone)
    assert not h.alive(1234)


def test_unconfirmed_viewer_refresh_holds_new_launches(
    rig: tuple[Config, FakeHost, Controller],
) -> None:
    _, h, controller = rig
    h.viewer_stays_stale = True
    with pytest.raises(ValueError, match="viewer refresh"):
        controller.trial(LANE, "bundle")
    assert h.children == []


def test_partial_appends_are_retried_without_losing_complete_records(tmp_path: Path) -> None:
    from pokebench_env.latest_main_loop import rows

    path = tmp_path / "events.jsonl"
    path.write_text('{"kind":"launch","run":"owned"}\n{"kind":')
    assert rows(path) == [{"kind": "launch", "run": "owned"}]
    path.write_text("[]\n")
    with pytest.raises(ValueError, match="invalid record"):
        rows(path)


def test_existing_shell_entrypoint_dispatches_to_the_new_controller(tmp_path: Path) -> None:
    import os
    import shlex

    python = tmp_path / "env/.venv/bin/python"
    python.parent.mkdir(parents=True)
    record = tmp_path / "argv"
    python.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\" > " + shlex.quote(str(record)) + "\n")
    python.chmod(0o755)
    script = Path(__file__).resolve().parents[3] / "scripts/whole-map-loop.sh"
    env = {
        **os.environ,
        "REPO": str(tmp_path),
        "RUNS": str(tmp_path / "runs"),
        "ARCHIVE": str(tmp_path / "archive"),
    }
    env.pop("LATEST_MAIN_PER_TRIAL", None)
    result = subprocess.run(
        ["/bin/sh", str(script)], env=env, capture_output=True, text=True, timeout=10
    )
    assert result.returncode == 0, (result.stdout, result.stderr)
    assert record.read_text().strip() == "-m pokebench_env.latest_main_loop"


def test_a_later_lane_picks_new_main_while_the_first_trial_stays_frozen(
    rig: tuple[Config, FakeHost, Controller], monkeypatch: pytest.MonkeyPatch
) -> None:
    import threading

    _, h, controller = rig
    started = threading.Event()
    release = threading.Event()
    errors: list[Exception] = []
    run = h.run
    spawn = h.spawn
    lane_b = Lane("B", 8076, "http://pool:8098", "control")

    class Playing:
        pid = 5678

        def __init__(self, child: FakeChild) -> None:
            self.child = child

        def poll(self) -> int | None:
            if not release.wait(10):
                raise RuntimeError("rehearsal release was not delivered")
            return self.child.poll()

    def both(args: list[str], cwd: Path) -> str:
        if args[:2] == ["git", "show"]:
            return json.dumps(
                {
                    "lanes": [
                        {"id": lane.id, "gamePort": lane.port, "modelUrl": lane.model_url}
                        for lane in (LANE, lane_b)
                    ],
                    "plan": [
                        {"lane": lane.id, "phase": "cook", "arm": lane.first_arm}
                        for lane in (LANE, lane_b)
                    ],
                }
            )
        return run(args, cwd)

    def playing(args: list[str], cwd: Path, log: Path) -> FakeChild | Playing:
        child = spawn(args, cwd, log)
        if len(h.children) == 1:
            started.set()
            return Playing(child)
        return child

    def first() -> None:
        try:
            assert controller.trial(LANE, "bundle")
        except Exception as error:
            errors.append(error)

    monkeypatch.setattr(h, "run", both)
    monkeypatch.setattr(h, "spawn", playing)
    thread = threading.Thread(target=first)
    thread.start()
    try:
        assert started.wait(10)
        assert thread.is_alive()
        h.pin = B
        assert controller.trial(lane_b, "control")
        assert [cwd.name for _, cwd in h.children] == [A, B]
        assert h.trees[h.children[0][1]] == A
        assert thread.is_alive()
    finally:
        release.set()
        thread.join(10)
    assert not thread.is_alive()
    assert errors == []
