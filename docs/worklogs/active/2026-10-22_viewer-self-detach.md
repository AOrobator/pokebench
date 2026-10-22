# Viewer restart detaches itself

Coordinator request 2026-10-22 (after 8790 twice ended up as a child of the Codex app-server and once died when a Codex exec session closed): make `just viewer-main` self-detaching no matter who runs it. Tooling only; no harness behavior, so no switch.

- Cause: `scripts/viewer-restart.sh` started the viewer with `nohup node ... &`, which stays in the caller's session and process tree. A Codex exec tears down its whole session when the command returns, killing the viewer or leaving it parented to the Codex app-server.
- Fix: start node through `subprocess.Popen(start_new_session=True)` in a one-shot python3 launcher. The viewer gets its own session and is reparented to launchd once the launcher exits. The script then checks that the viewer's parent is pid 1 and fails otherwise.
- Test: `env/tests/tooling/test_viewer_restart.py` runs the real script in its own session (as a Codex exec does) against a fake `node` viewer. It asserts the viewer is in a different session from the caller, still listens after the caller has exited (and after a kill of the caller's group if any of it remains), and has ppid 1.

## Progress
- RED 9fe799560: `uv run --project env pytest env/tests/tooling/test_viewer_restart.py` → 1 failed (AssertionError: os.getsid(viewer) == caller.pid, i.e. the viewer shared the caller's session) on main's script.
- GREEN 8dc8a2838: viewer-restart.sh launches node in a new session and checks ppid 1. `pytest env/tests/tooling/test_viewer_restart.py env/tests/tooling/test_viewer_main.py` → 2 passed.
- Gates on 8dc8a2838 (`just build && just lint && just coverage && just test && just verify-vendor`): EXIT 0 on try 3. Tries 1-2 failed only on known load flakes in untouched TS tests (experiment-cli production host, people-id-cards-delivery 4caa rehearsal, serial-comparison hung child). Coverage: agent 97.29/93.29/97.79/99.20, viewer 95.48/91.45/94.45/97.97, Python 96%. Tests: 4731 agent, 1787 viewer, 3980 Python.
- R1 (head 85e8ff80, after merging main 04b7d34cb): Claude LGTM, fallback LGTM, GPT BLOCKING only on missing gate evidence in this worklog, now recorded above. Hardening notes (test cleanup on timeout, port race, viewer left running on a failed ppid check) deferred; none is a current failure.
- R2 (head e92459103): Claude LGTM, fallback LGTM, GPT BLOCKING (2), both accepted. (1) Gates must run on the final synced head: rerun below. (2) The ppid guard had no negative test. Added `test_a_viewer_still_tied_to_the_caller_is_refused`, which puts a `ps` stub reporting parent 4242 on PATH and expects exit 1 with "is still tied to this shell". Delete/restore: removing the guard line gives 1 failed, 1 passed; restored, 2 passed.
