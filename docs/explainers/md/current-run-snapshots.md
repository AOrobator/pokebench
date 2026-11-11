# Current runs before history

> Markdown twin of [current-run-snapshots.html](../current-run-snapshots.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The viewer reads a small persisted snapshot before reconstructing a recording. Existing JSONL recordings remain the source of truth. This changes the viewer's startup path; it adds no model tool or gameplay switch.

## Who maintains each part

### Recordings

Game and agent processes append their existing events. The snapshot service never writes these files.

→ bounded tail and reconstruction

### One projector

An independent Node service reduces current state. A root lock prevents a second writer.

→ one atomic SQLite transaction

### Durable current store

Public snapshot, private reducer checkpoint, source cursor, sparse history index and revision journal commit together.

WAL and FULL synchronization protect committed derived state.

### Viewer first read

`/api/current-runs` and the selected run's `/current` return persisted rows. These queries do not scan recordings.

### Current updates

The browser polls revisions every 500 ms. Epoch, source generation, sequence and revision fences reject late replies.

Active snapshots with no heartbeat for over 10 seconds become LAST KNOWN and disable controls.

### History later

The selected run's `/history` loads recent recorded turns by indexed source offsets. Older pages are explicit. History never adds to current totals or replaces the current party.

## What survives a restart

| Restart | Recovery |
|---|---|
| Viewer | The projector keeps running. The next viewer reads committed current state immediately. |
| Projector crash | launchd starts the pinned service again. SQLite restores the committed checkpoint and consumed-byte cursor. Uncommitted source bytes are replayed once. |
| Mac login/restart | The user launch agent starts at login. Its absolute Node path and immutable build live outside temporary storage. Source files and the derived database stay under the canonical runs root. |
| Recording replaced or truncated | Source identity and consumed-prefix checks invalidate that generation. Old replies and saved cards cannot revive its former party or totals. Reconstruction is explicitly incomplete until verified. |
| New or unindexed recording | Known current facts appear first; unknown lifetime values remain unknown. Initial reconstruction is bounded and can take time. An empty recent index still permits selecting an older catalog run. |

## Card persistence handoff

The SQLite current store becomes the normal saved-current owner. The old `.viewer-cache/cards-v1` remains a source-guarded, read-only display fallback. It cannot seed reducer checkpoints, cumulative token totals or grading eligibility. Fresh source state, including a pregame reset, wins over the saved roster. Card art, trainer identity and layout keep their existing owners.

Source-guarded card display splits can fill in independently. Global frontier ranking starts when the existing SPLITS page requests it, rather than blocking a fresh current view. Comparisons and grading retain their existing authority.

## Limits and provenance

The projector has one reconstruction at a time, a 20 MiB/s aggregate read budget with a 4 MiB burst, and a 10 ms processing slice. Current commits coalesce within 250 ms; health runs independently. The browser keeps at most 256 run summaries and 512 history events or 4 MiB. Oversized pages are refused visibly. Measured context and estimated context remain distinct.

Fast indexed startup is a target to measure, not a promise that unseen multi-gigabyte recordings reconstruct instantly. Recorded progress in the current API is explicitly unverified; the grading path remains separate.

## Operations and rollback

`just current-main` prepares a clean version-pinned build and installs the independent user launch agent. `just viewer-main` prepares a main build and restarts only the viewer. Both use the same nonblocking preparation lock; do not wrap them in a second lock acquisition.

`just current-stop` unloads only the owned projector and preserves its disabled plist, database, recordings and legacy card files. Roll back the viewer by serving the retained pre-rollout build through the existing viewer-restart script. Do not delete or rewrite source recordings. A failed service upgrade restores its prior own launch configuration.

<details>
<summary>Runtime paths</summary>

Default builds: `~/.cache/pokebench/<canonical-root-hash>/builds/<main-SHA>`. Database: `runs/.viewer-cache/current-v1/current.sqlite`. User agent: `~/Library/LaunchAgents/local.pokebench.current.<root-hash>.plist`. An explicit `POKEBENCH_VIEWER_WORKTREE` must already match the requested commit or be a new path; an existing served checkout is never retargeted in place.

</details>

## Rollout status

The rollout worklog records each milestone, review, measured gate and actual served build separately. The operator authorized service activation and shared viewer refresh after readiness. Active game and agent processes must retain their identities and start times. Consult docs/worklogs/active/2026-10-25_current-run-snapshots.md and the current runtime receipts for the activation state.
