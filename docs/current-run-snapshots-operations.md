# Current-run snapshot operations

The independent projector is the only normal current-state writer. Source JSONL recordings remain authoritative. The viewer's API workers open the derived SQLite store read-only. No game-server or agent restart is part of these commands.

## Normal operation

Run `just current-main` to prepare an immutable build of local main and install or upgrade the current user's launch agent. Its `KeepAlive` and `RunAtLoad` cover projector crashes and login recovery. SQLite commits the reducer checkpoint, consumed-byte cursor, public current state, revision journal and sparse history index atomically. A new process replays only uncommitted source bytes. One root lock prevents competing projector writers.

Run `just viewer-main` for a viewer-only refresh. This does not stop the projector. Both preparation commands acquire `/private/tmp/pokebench-latest-main-prepare.lock` nonblockingly; do not acquire that lock again around either command. Coordinate the shared refresh through the repository owner before invoking it.

Normal browser startup uses `/api/current-runs`, selected `/current`, and revision updates before history. No URL opt-in or harness/bundle switch is required. `--current-db` remains a technical database path override. The projector is never started from a GET or from the viewer process.

Default derived database: `<canonical root>/runs/.viewer-cache/current-v1/current.sqlite`.
Default immutable builds: `~/.cache/pokebench/<root hash>/builds/<main SHA>`.
Launch agent: `~/Library/LaunchAgents/local.pokebench.current.<root hash>.plist`.
Service stderr: `~/.cache/pokebench/<root hash>/current-service.stderr.log`.

`POKEBENCH_VIEWER_WORKTREE` remains an explicit viewer build path override. It must be new or clean at the requested main commit; preparation refuses to retarget an existing mismatched checkout. Leave it unset for automatic version-pinned caching. The canonical environment venv remains shared for existing human-run launch behavior.

## Resolve the running viewer for read-only checks

Use the existing environment Python, without restarting anything:

```python
from pathlib import Path
from pokebench_env.current_runtime import serving_viewer_tree

served = serving_viewer_tree(Path("/Users/user/dev/pokebench"))
print(served)
print((served / "packages/viewer/dist/build-stamp.json").read_text())
```

The resolver reads the sole 8790 listener PID and its argv, requires this root's environment/runs paths and the supported built CLI, and refuses missing, ambiguous or foreign listeners. Cached builds can coexist; their existence does not prove they serve 8790. Supply the verified path explicitly through the existing `POKEBENCH_VIEWER_WORKTREE` when running the read-only frontier helper. No implicit temporary-tree default remains. Use that override only for the analysis command, rather than leaving an old pin exported for a future refresh.

The latest-main controller resolves its normal stamp from that listener. It hands its existing shared preparation lock off around `viewer-main`, then reacquires it before its unchanged captured-main/stop/pause/busy and launch guards. This avoids a nested lock acquisition; it does not restart or signal an existing player or game.

## Rollout checks

1. Record the current 8790 listener's PID, start time, CLI path and served build stamp. Record all live player, game-server, bridge and runner PIDs and start times. Preserve the existing compiled viewer path for rollback.
2. Capture a baseline, then install the projector alone. Watch bounded reconstruction and health freshness, CPU/RSS, source read budget, DB/WAL size and existing viewer frame/API metrics. Classify source silence separately from projection lag. If another job changes load or refreshes the viewer, retain the observations but do not claim a controlled comparison.
3. Wait for the relevant current run to be indexed. Missing lifetime values must stay unknown. Query the actual current endpoint repeatedly and compare identities, totals and cursor recovery against the source. New or unseen historical recordings need not reconstruct instantly.
4. Refresh the shared viewer once, after readiness and ownership checks. Confirm its actual listener and build stamp, current cards/stats, source-consistent frames and separate history backfill in an agent-owned headless browser. Recheck every previously live PID and start time. No control POSTs are part of this check.
5. Retain evidence distinguishing candidate tests, landed code, service activation, shared refresh and observed live behavior. Run `just experiments-audit`; compare real catalog/card membership without moving or rewriting recordings.

## Failure and recovery

An active snapshot without a projector heartbeat for over 10 seconds becomes LAST KNOWN; known values remain visible and controls are disabled. Ended snapshots do not need a live heartbeat. Transport failure also retains current values. Stale data must not be reported as fresh simply because the database answers.

Recording truncation, replacement and generation changes invalidate old owners and saved-card fallback. Source-guarded legacy display files are read-only in the normal viewer; they never seed private checkpoints, cumulative counters or grading eligibility. Fresh pregame state takes precedence over an old party. Comparisons/frontier grading retains its separate source validation.

For a service-only rollback, run `just current-stop`. This unloads the root-specific owned agent and saves its plist as `.plist.disabled`. Recordings, SQLite and old card files remain. A failed upgrade restores the previous own launch configuration and attempts to restart that service.

To roll back the viewer, use the retained pre-rollout compiled CLI with `scripts/viewer-restart.sh <old-cli> 8790 <canonical-runs> <canonical-.env> <viewer-log>`, after coordinating the shared refresh. This restarts only the viewer. Keep derived data and pinned builds for diagnosis; do not delete source files or replay old metadata into active recordings.

Do not run two projector instances against one runs root, remove lock files to bypass ownership, restart games to fix viewer freshness, or overwrite an active runtime checkout during preparation.
