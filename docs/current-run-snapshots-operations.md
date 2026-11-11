# Current-run snapshot operations

The independent projector is the only normal current-state writer. Source JSONL recordings remain authoritative. The viewer's API workers open the derived SQLite store read-only. No game-server or agent restart is part of these commands.

## Normal operation

Run `just current-main` to prepare an immutable build of local main and install or upgrade the current user's launch agent. Its `KeepAlive` and `RunAtLoad` cover projector crashes and login recovery. SQLite commits the reducer checkpoint, consumed-byte cursor, public current state, revision journal and sparse history index atomically. A new process replays only uncommitted source bytes. One root lock prevents competing projector writers.

Run `just viewer-main` for a coordinated refresh: the backward-compatible web viewer starts first, then the projector, both from the same immutable build. Gameplay and recording processes are not restarted. Both preparation commands acquire `/private/tmp/pokebench-latest-main-prepare.lock` nonblockingly; do not acquire that lock again around either command. Coordinate the shared refresh through the repository owner before invoking it.

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

Before activating the compact-publication projector, take a consistent SQLite backup of the derived current database and retain the matching compiled viewer/projector builds. Do not copy a live SQLite file without its transactional state; use SQLite backup.

A viewer-only rollback is supported only while the database still contains legacy publication rows. After any compact rows have been written, an old viewer cannot read them. Rolling back only the projector is also insufficient: completed rows are not automatically republished in the legacy format. Prefer a forward repair while retaining the compatible new reader.

If a full rollback is required, coordinate it and stop both viewer consumers first: unload the owned projector with `just current-stop` and stop the validated served-viewer process using the same ownership checks as `viewer-restart.sh`. With no readers or writers open, restore the compatible pre-activation SQLite backup as a consistent database, then start the retained matching projector and viewer pair. Verify root binding, source anchors and the selected run after restart. Without such a backup, do not deploy an old reader over compact rows. Restoring the prior database also restores its prior display limitations, including the original 64 KiB failure; it is a recovery checkpoint, not a fix.

Keep derived backups and pinned builds for diagnosis. Restore only derived viewer data: never delete, truncate or replace original recordings, native checkpoints, gameplay directories, or active runtime code to roll back the display.

Do not run two projector instances against one runs root, remove lock files to bypass ownership, restart games to fix viewer freshness, or overwrite an active runtime checkout during preparation.


## Durable live publication boundaries

Current checkpoints, consumed byte offsets, counters and sparse event indexes stay
in SQLite. Normal restarts resume those offsets; changes to independent grading
receipts do not invalidate event-derived state. A changed event source identity,
byte anchor or restoration prefix still requires validation/reconstruction. The
original recordings remain the authority for grading.

The 64 KiB per-run live-summary bound applies to current facts, not run length.
Immutable header/configuration is stored once by SHA-256 reference in
`current_metadata`, and the browser caches it across polls. Effective extensions
remain in the live record. Current summaries carry at most the furthest reached
card milestone and the latest anchor. Full observed milestone records remain in
the durable checkpoint, available in 64-record progress pages with incremental
cursors; these are explicitly unverified display data, not graded splits.

Current, metadata and progress reads do not scan the game event log. The normal
viewer avoids legacy full-log card enrichment when the current snapshot contains
configuration and party facts. Opening a completed run with `#run=` keeps its
final snapshot; explicit `#replay=` retains full playback. Same-epoch list refreshes
keep existing cards until pagination completes, and a selected last-known card
stays visible when health or publication reports a problem.

The migration adds metadata storage and accepts old publication rows/checkpoint
evidence. It does not delete snapshots, indexes, run data or recordings. A coupled
refresh is needed to install the protocol on both consumers. Reload an already
open browser page once to load the new client.
