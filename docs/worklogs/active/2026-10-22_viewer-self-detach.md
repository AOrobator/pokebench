# Viewer restart detaches itself

Coordinator request 2026-10-22 (after 8790 twice ended up as a child of the Codex app-server and once died when a Codex exec session closed): make `just viewer-main` self-detaching no matter who runs it. Tooling only; no harness behavior, so no switch.

- Cause: `scripts/viewer-restart.sh` started the viewer with `nohup node ... &`, which stays in the caller's session and process tree. A Codex exec tears down its whole session when the command returns, killing the viewer or leaving it parented to the Codex app-server.
- Fix: start node through `subprocess.Popen(start_new_session=True)` in a one-shot python3 launcher. The viewer gets its own session and is reparented to launchd once the launcher exits. The script then checks that the viewer's parent is pid 1 and fails otherwise.
- Test: `env/tests/tooling/test_viewer_restart.py` runs the real script in its own session against a fake `node` viewer, kills the caller's whole process group, and asserts the viewer still listens, is in another session, and has ppid 1.

## Progress
- RED 9fe799560: fails on main's script (viewer shares the caller's session).
- GREEN: viewer-restart.sh launches node in a new session and checks ppid 1; tooling tests pass.
