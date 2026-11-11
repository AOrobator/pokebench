"""Prepare immutable viewer builds and supervise only the current-state projector."""

import argparse
import fcntl
import hashlib
import os
import plistlib
import re
import shutil
import subprocess
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import TypeAlias

Runner: TypeAlias = Callable[..., subprocess.CompletedProcess[str]]
Config: TypeAlias = dict[str, str | bool | int | list[str]]
UNLOAD_POLLS = 100
UNLOAD_POLL_SECONDS = 0.1
PREPARE_LOCK = Path("/private/tmp/pokebench-latest-main-prepare.lock")  # noqa: S108


@contextmanager
def prepare_lock(path: Path = PREPARE_LOCK) -> Iterator[None]:
    with path.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("another owner is already preparing latest main") from error
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _call(run: Runner, args: Sequence[str], cwd: Path | None = None) -> str:
    return run(list(args), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def serving_viewer_tree(root: Path, *, read: Callable[[Sequence[str]], str] | None = None) -> Path:
    output = read if read is not None else lambda args: _call(subprocess.run, args)
    listeners = output(["lsof", "-nP", "-t", "-iTCP:8790", "-sTCP:LISTEN"]).split()
    if len(listeners) != 1 or re.fullmatch(r"[1-9][0-9]*", listeners[0]) is None:
        raise RuntimeError("cannot identify one viewer listener on 8790")
    command = output(["ps", "-p", listeners[0], "-o", "command="]).strip()
    root = root.resolve()
    pattern = (
        r".+ --env-file="
        + re.escape(str(root / ".env"))
        + r" (?P<cli>/.+/packages/viewer/dist/cli[.]js) --port 8790 --runs "
        + re.escape(str(root / "runs"))
    )
    match = re.fullmatch(pattern, command)
    if match is None:
        raise RuntimeError("viewer listener does not belong to this root's built CLI")
    return Path(match["cli"]).parents[3]


def prepare(
    root: Path, cache: Path, *, target: Path | None = None, run: Runner = subprocess.run
) -> Path:
    commit = _call(run, ["git", "-C", str(root), "rev-parse", "main"])
    if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
        raise RuntimeError("main did not resolve to a commit")
    tree = target if target is not None else cache / commit
    if tree.exists():
        head = _call(run, ["git", "-C", str(tree), "rev-parse", "HEAD"])
        dirty = _call(run, ["git", "-C", str(tree), "status", "--porcelain"])
        if head != commit or dirty:
            raise RuntimeError("existing pinned runtime must be clean and at its named commit")
    else:
        tree.parent.mkdir(parents=True, exist_ok=True)
        _call(
            run,
            ["git", "-C", str(root), "worktree", "add", "--quiet", "--detach", str(tree), commit],
        )
    ready = tree.parent / f".{tree.name}.current-runtime-ready"
    if (
        ready.is_file()
        and ready.read_text().strip() == commit
        and all(
            (tree / "packages/viewer/dist" / name).is_file()
            for name in ("cli.js", "current-service-cli.js")
        )
    ):
        return tree
    _call(run, ["git", "submodule", "update", "--init", "--quiet"], tree)
    venv = tree / "env/.venv"
    if not venv.exists() and not venv.is_symlink():
        venv.symlink_to(root / "env/.venv", target_is_directory=True)
    _call(run, ["pnpm", "install", "--frozen-lockfile", "--silent"], tree)
    _call(run, ["pnpm", "-r", "--silent", "build"], tree)
    ready.write_text(commit + "\n")
    return tree


def service_config(root: Path, tree: Path, node: str, cache: Path) -> Config:
    key = hashlib.sha256(os.fsencode(root.resolve())).hexdigest()[:16]
    label = f"local.pokebench.current.{key}"
    return {
        "Label": label,
        "ProgramArguments": [
            node,
            str(tree / "packages/viewer/dist/current-service-cli.js"),
            "--runs-root",
            str(root / "runs"),
            "--database",
            str(root / "runs/.viewer-cache/current-v1/current.sqlite"),
            "--health",
        ],
        "WorkingDirectory": str(tree),
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 5,
        "ProcessType": "Background",
        "StandardOutPath": "/dev/null",
        "StandardErrorPath": str(cache / "current-service.stderr.log"),
    }


def _owned(config: Config, target: Path) -> None:
    if target.exists():
        old = plistlib.loads(target.read_bytes())
        if not isinstance(old, dict) or old.get("Label") != config["Label"]:
            raise RuntimeError("refusing foreign launch agent configuration")


def _unload(
    config: Config, uid: int, run: Runner, pause: Callable[[float], None] = time.sleep
) -> bool:
    service = f"gui/{uid}/{config['Label']}"

    def loaded() -> bool:
        probe = run(["launchctl", "print", service], check=False, capture_output=True, text=True)
        return probe.returncode == 0

    if not loaded():
        return False
    _call(run, ["launchctl", "bootout", service])
    # bootout returns before launchd releases the label; bootstrap then fails with status 5.
    for _ in range(UNLOAD_POLLS):
        if not loaded():
            return True
        pause(UNLOAD_POLL_SECONDS)
    raise RuntimeError(f"{service} still loaded after bootout")


def install(config: Config, target: Path, uid: int, run: Runner = subprocess.run) -> None:
    _owned(config, target)
    previous = target.read_bytes() if target.exists() else None
    payload = plistlib.dumps(config)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".plist.new")
    temporary.write_bytes(payload)
    temporary.chmod(0o600)
    loaded = _unload(config, uid, run)
    temporary.replace(target)
    try:
        _call(run, ["launchctl", "bootstrap", f"gui/{uid}", str(target)])
    except subprocess.CalledProcessError:
        if previous is None:
            target.unlink()
        else:
            temporary.write_bytes(previous)
            temporary.replace(target)
            if loaded:
                _call(run, ["launchctl", "bootstrap", f"gui/{uid}", str(target)])
        raise


def stop(config: Config, target: Path, uid: int, run: Runner = subprocess.run) -> None:
    _owned(config, target)
    _unload(config, uid, run)
    if target.exists():
        target.replace(target.with_suffix(".plist.disabled"))


def refresh_viewer(
    root: Path, tree: Path, config: Config, target: Path, uid: int, run: Runner = subprocess.run
) -> None:
    """Refresh both consumers from the same prepared immutable build."""
    run(
        [
            str(tree / "scripts/viewer-restart.sh"),
            str(tree / "packages/viewer/dist/cli.js"),
            "8790",
            str(root / "runs"),
            str(root / ".env"),
            str(root / "runs/viewer-8790.log"),
        ],
        check=True,
    )
    install(config, target, uid, run)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("viewer", "install", "stop"))
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    key = hashlib.sha256(os.fsencode(root)).hexdigest()[:16]
    cache = Path.home() / ".cache/pokebench" / key
    cache.mkdir(parents=True, exist_ok=True)
    with prepare_lock():
        if args.action == "stop":
            config = service_config(root, cache, "", cache)
            target = Path.home() / "Library/LaunchAgents" / f"{config['Label']}.plist"
            stop(config, target, os.getuid())
            print("current projector stopped; recordings, database and card caches preserved")
            return
        override = os.environ.get("POKEBENCH_VIEWER_WORKTREE") if args.action == "viewer" else None
        tree = prepare(
            root, cache / "builds", target=None if override is None else Path(override).resolve()
        )
        node = shutil.which("node")
        if node is None:
            raise RuntimeError("node is required for the current projector")
        config = service_config(root, tree, str(Path(node).resolve()), cache)
        target = Path.home() / "Library/LaunchAgents" / f"{config['Label']}.plist"
        if args.action == "viewer":
            refresh_viewer(root, tree, config, target, os.getuid())
            print(f"viewer and current projector at {tree.name}")
            return
        install(config, target, os.getuid())
        print(f"current projector installed at {tree.name}; label {config['Label']}")


if __name__ == "__main__":
    main()
