import subprocess
from pathlib import Path

from pokebench_env import current_runtime


def test_refresh_updates_the_compatible_viewer_before_the_indexer(monkeypatch):
    actions = []
    config = {"Label": "fixture"}

    def install(value, target, uid, run):
        assert value is config
        actions.append("indexer")

    def run(argv, **kwargs):
        actions.append(argv)
        return subprocess.CompletedProcess(argv, 0)

    monkeypatch.setattr(current_runtime, "install", install)
    current_runtime.refresh_viewer(Path("/repo"), Path("/build"), config, Path("/plist"), 501, run)
    assert actions[1] == "indexer"
    assert actions[0] == [
        "/build/scripts/viewer-restart.sh",
        "/build/packages/viewer/dist/cli.js",
        "8790",
        "/repo/runs",
        "/repo/.env",
        "/repo/runs/viewer-8790.log",
    ]
