from pathlib import Path

from pokebench_env.launcher import ServerSpec, launch_boot_recording
from pokebench_env.recorder import follow_owner


def test_boot_factory_attaches_existing_supervised_recorder_with_owner_and_run_path() -> None:
    calls: list[tuple[list[str], Path]] = []

    def start(argv: list[str], out: Path) -> str:
        calls.append((argv, out))
        return "recorder"

    result = launch_boot_recording(
        ServerSpec(8087, True, None),
        Path("/venv/python"),
        Path("/runs/boot with spaces"),
        1234,
        start,
    )
    assert result == "recorder"
    assert calls == [
        (
            [
                "/venv/python",
                "-m",
                "pokebench_env.recorder",
                "--port",
                "8087",
                "--out",
                "/runs/boot with spaces/recording",
                "--supervise",
                "--owner-pid",
                "1234",
            ],
            Path("/runs/boot with spaces/recording"),
        )
    ]
    assert (
        launch_boot_recording(
            ServerSpec(8088, True, Path("/saves/start.ss0")),
            Path("/venv/python"),
            Path("/runs/save"),
            1234,
            start,
        )
        is None
    )
    assert len(calls) == 1


def test_owner_exit_stops_only_recording_and_existing_manual_mode_is_unchanged() -> None:
    alive = iter([True, True, False])
    checked: list[int] = []
    stopped: list[bool] = []

    def exists(pid: int) -> bool:
        checked.append(pid)
        return next(alive)

    follow_owner(1234, exists, lambda: False, lambda: stopped.append(True))
    assert checked == [1234, 1234, 1234]
    assert stopped == [True]
    follow_owner(None, exists, lambda: False, lambda: stopped.append(True))
    assert checked == [1234, 1234, 1234]
    assert stopped == [True]


def test_explicit_recorder_stop_ends_owner_monitor_without_signalling_anything() -> None:
    waits = iter([False, True])
    checked: list[int] = []
    stopped: list[bool] = []
    follow_owner(
        1234,
        lambda pid: checked.append(pid) is None,
        lambda: next(waits),
        lambda: stopped.append(True),
    )
    assert checked == [1234]
    assert stopped == []
