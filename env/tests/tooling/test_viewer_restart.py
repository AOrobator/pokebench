"""Rehearsal of scripts/viewer-restart.sh with a fake node viewer; no real viewer or game."""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"

FAKE_NODE = """#!{python}
import http.server, sys
port = int(sys.argv[sys.argv.index("--port") + 1])
class Ok(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/api/run-lanes" else 404); self.end_headers(); self.wfile.write(b"[]")
    def log_message(self, *args):
        pass
http.server.HTTPServer(("127.0.0.1", port), Ok).serve_forever()
"""


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _listener(port: int) -> int | None:
    out = subprocess.run(
        ["lsof", "-tiTCP:" + str(port), "-sTCP:LISTEN"], capture_output=True, text=True
    ).stdout.split()
    return int(out[0]) if out else None


def test_the_viewer_outlives_the_session_that_restarted_it(tmp_path: Path) -> None:
    binary = tmp_path / "bin"
    binary.mkdir()
    node = binary / "node"
    node.write_text(FAKE_NODE.format(python=sys.executable))
    node.chmod(0o755)
    port = _free_port()
    env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"]}
    # The caller runs in its own session, like a Codex exec whose whole session is torn down after.
    caller = subprocess.Popen(
        [
            "/bin/bash",
            str(SCRIPTS / "viewer-restart.sh"),
            str(tmp_path / "cli.js"),
            str(port),
            str(tmp_path / "runs"),
            str(tmp_path / ".env"),
            str(tmp_path / "viewer.log"),
        ],
        env=env,
        start_new_session=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    out, err = caller.communicate(timeout=60)
    viewer = _listener(port)
    try:
        assert caller.returncode == 0, (out, err)
        assert viewer is not None
        assert os.getsid(viewer) != caller.pid
        if _group_alive(caller.pid):
            os.killpg(caller.pid, signal.SIGKILL)
        time.sleep(0.5)
        assert _listener(port) == viewer
        ppid = subprocess.run(
            ["ps", "-o", "ppid=", "-p", str(viewer)], capture_output=True, text=True
        ).stdout.strip()
        assert ppid == "1"
    finally:
        if viewer is not None:
            os.kill(viewer, signal.SIGTERM)


def _group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    return True


def test_a_viewer_still_tied_to_the_caller_is_refused(tmp_path: Path) -> None:
    binary = tmp_path / "bin"
    binary.mkdir()
    node = binary / "node"
    node.write_text(FAKE_NODE.format(python=sys.executable))
    node.chmod(0o755)
    # A ps reporting a parent other than launchd, as if the viewer stayed in the caller's tree.
    ps = binary / "ps"
    ps.write_text("#!/bin/sh\necho 4242\n")
    ps.chmod(0o755)
    port = _free_port()
    env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"]}
    result = subprocess.run(
        [
            "/bin/bash",
            str(SCRIPTS / "viewer-restart.sh"),
            str(tmp_path / "cli.js"),
            str(port),
            str(tmp_path / "runs"),
            str(tmp_path / ".env"),
            str(tmp_path / "viewer.log"),
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    viewer = _listener(port)
    try:
        assert result.returncode == 1
        assert "is still tied to this shell" in result.stderr
    finally:
        if viewer is not None:
            os.kill(viewer, signal.SIGTERM)
