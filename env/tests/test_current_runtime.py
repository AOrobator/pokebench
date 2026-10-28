"""Service-only lifecycle and immutable runtime preparation contracts."""

import plistlib
from subprocess import CompletedProcess

import pytest

from pokebench_env.current_runtime import install, prepare, prepare_lock, service_config, stop


def test_prepare_lock_is_nonblocking_and_released_after_failure(tmp_path):
    path = tmp_path / "prepare.lock"
    with prepare_lock(path):
        with pytest.raises(RuntimeError, match="already preparing"):
            with prepare_lock(path):
                pytest.fail("second owner entered")
    with prepare_lock(path):
        assert path.exists()


def test_service_config_owns_only_the_pinned_projector(tmp_path):
    root = tmp_path / "repo with spaces"
    config = service_config(root, tmp_path / "pin", "/node with spaces", tmp_path)
    assert config["ProgramArguments"] == [
        "/node with spaces",
        str(tmp_path / "pin/packages/viewer/dist/current-service-cli.js"),
        "--runs-root",
        str(root / "runs"),
        "--database",
        str(root / "runs/.viewer-cache/current-v1/current.sqlite"),
        "--health",
    ]
    assert config["KeepAlive"] is True
    assert config["RunAtLoad"] is True
    assert plistlib.loads(plistlib.dumps(config)) == config
    assert (
        service_config(tmp_path / "other", tmp_path / "pin", "/node", tmp_path)["Label"]
        != config["Label"]
    )


def test_install_replaces_only_its_own_agent_and_stop_preserves_data(tmp_path):
    calls = []

    def run(args, **kwargs):
        calls.append(args)
        return CompletedProcess(args, 0, "", "")

    root = tmp_path / "repo"
    config = service_config(root, tmp_path / "pin", "/node", tmp_path)
    target = tmp_path / "agents" / f"{config['Label']}.plist"
    install(config, target, 42, run)
    assert plistlib.loads(target.read_bytes()) == config
    assert calls == [
        ["launchctl", "print", f"gui/42/{config['Label']}"],
        ["launchctl", "bootout", f"gui/42/{config['Label']}"],
        ["launchctl", "bootstrap", "gui/42", str(target)],
    ]
    data = root / "runs/.viewer-cache/current-v1/current.sqlite"
    data.parent.mkdir(parents=True)
    data.write_bytes(b"durable cursor")
    stop(config, target, 42, run)
    assert data.read_bytes() == b"durable cursor"
    assert not target.exists()
    assert target.with_suffix(".plist.disabled").exists()
    assert calls[-2:] == [
        ["launchctl", "print", f"gui/42/{config['Label']}"],
        ["launchctl", "bootout", f"gui/42/{config['Label']}"],
    ]


def test_install_refuses_foreign_configuration(tmp_path):
    config = service_config(tmp_path, tmp_path / "pin", "/node", tmp_path)
    target = tmp_path / "agent.plist"
    target.write_bytes(plistlib.dumps({"Label": "someone.else"}))
    with pytest.raises(RuntimeError, match="foreign"):
        install(config, target, 42, lambda *a, **k: pytest.fail("must not run launchctl"))


def test_prepare_builds_once_and_never_retargets_an_existing_pin(tmp_path):
    calls = []
    root = tmp_path / "repo"
    root.mkdir()
    commit = "a" * 40
    tree = tmp_path / "cache" / commit

    def run(args, **kwargs):
        calls.append(args)
        output = commit if args[-1] in ("main", "HEAD") else ""
        if "worktree" in args and "add" in args:
            (tree / "env").mkdir(parents=True)
        if args[-1] == "build":
            dist = tree / "packages/viewer/dist"
            dist.mkdir(parents=True)
            (dist / "cli.js").write_text("viewer")
            (dist / "current-service-cli.js").write_text("projector")
        return CompletedProcess(args, 0, output, "")

    assert prepare(root, tmp_path / "cache", run=run) == tree
    assert (tree / "env/.venv").is_symlink()
    assert (tree / "env/.venv").readlink() == root / "env/.venv"
    count = len(calls)
    assert prepare(root, tmp_path / "cache", run=run) == tree
    assert all("checkout" not in call and "reset" not in call for call in calls)
    assert calls[count:] == [
        ["git", "-C", str(root), "rev-parse", "main"],
        ["git", "-C", str(tree), "rev-parse", "HEAD"],
        ["git", "-C", str(tree), "status", "--porcelain", "--untracked-files=no"],
    ]

    def dirty(args, **kwargs):
        return CompletedProcess(args, 0, " M tracked" if "status" in args else commit, "")

    with pytest.raises(RuntimeError, match="clean"):
        prepare(root, tmp_path / "cache", run=dirty)


def test_failed_upgrade_restores_the_previous_agent(tmp_path):
    from subprocess import CalledProcessError
    config = service_config(tmp_path, tmp_path / "new", "/node", tmp_path)
    old = service_config(tmp_path, tmp_path / "old", "/node", tmp_path)
    target = tmp_path / "agent.plist"
    target.write_bytes(plistlib.dumps(old))
    starts = []
    def run(args, **kwargs):
        if "bootstrap" in args:
            starts.append(plistlib.loads(target.read_bytes())["WorkingDirectory"])
            if len(starts) == 1:
                raise CalledProcessError(1, args)
        return CompletedProcess(args, 0, "", "")
    with pytest.raises(CalledProcessError):
        install(config, target, 42, run)
    assert plistlib.loads(target.read_bytes()) == old
    assert starts == [str(tmp_path / "new"), str(tmp_path / "old")]
