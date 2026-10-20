# Viewer head-first loading

Authorized: improve run switching so controls, current turn and timeline become usable from the head before history; review, merge local main and restart viewer.

Scope: viewer event transport, bounded head loading, background history hydration, browser rendering and regression tests. Preserve exact recording/replay, run identity, validated events and backend control authority. No gameplay, experiment or timeline-mark additions.

Plan: RED regression; GREEN head-first bootstrap with stale-selection and history handoff guards; full gates; browser proof on owned scratch data; frozen Claude/Grok/GPT review; fast-forward landing; viewer restart and live proof.

Baseline: main 0924e149. Existing Chrome tab 1657055904 at inference.example:8790 selects 2026-10-20T13-54-28_qwen36-gpu0_b300. Listener PID 90353, detached /private/tmp/pokebench-viewer. Current controls gated on caught_up after forward log replay; /head currently feeds thinking only. Existing recordings and live games preserved.

Status: investigating transport and control state for a bounded bootstrap. No source edits yet.

RED: built agent dependency first; targeted server-stream test fails (missing head message), existing 17 pass. Protocol chosen: bounded head on primary SSE, then tail from exact complete-line byte boundary; separate history SSE folds into a detached view. Historical replay remains exact after hydration. Head is recent, not a complete aggregate, and is labeled while history loads.

## GREEN candidate (2026-10-20)

- Primary `/events?head=1` validates the bounded present and resumes at its exact complete-line byte cursor. A separate stream hydrates history into a detached view; sequence deduplication preserves a newer tail at handoff. Reconnect heads refresh the present; stale selection/history callbacks cannot overwrite a newer pick.
- Existing controls and current timeline render from the head. Sparse old pause/extension acknowledgements are recovered asynchronously only for runs with the control-request sidecar. This reads the prefix for metadata without validating/reducing or transporting historical gameplay. Ordinary runs read only the existing 30-turn/8-MiB head bound before readiness.
- Completed recordings open at their recorded head and retain exact rewind after hydration. Malformed/skewed compact heads fall back to the diagnostic stream. Cached complete splits remain atomic during hydration; partial history is visibly labeled. No timeline marks added.
- Tests: 2,846 agent + 1,410 viewer + 2,896 Python = 7,152 passing, zero skips. `just test`, `just coverage`, `just lint`, `just build`, `just verify-vendor` passed; final viewer-only cached-split fix reran all viewer tests under coverage plus lint/build. TS agent lines 99.16%, branches 92.91%, functions 97.61%; viewer lines 97.70%, branches 90.99%, functions 93.84%; Python lines 96.95%, branches 92.46%, functions 100%.
- Six independent mutations (primary ownership, history ownership, reconnect deduplication, tail handoff, old control metadata and byte cursor) each went RED; restored focused suite passed (146 tests). Cached-split regression separately observed RED then GREEN. Receipts: owned worktree `.cache/head-evidence/`, `/tmp/head-*.log`.
- Preview uses scratch copies only on 8792. Real browser switch measured at 533 ms: current turn482, RUNNING, four enabled controls and timeline mark while older history remained visibly loading. One observation, no latency-distribution claim. Transport-only comparison on 189-MB recording: head 7.6MB/0.544s versus full history 189MB/1.121s.
- Browser rehearsed PAUSE/RESUME, EXTEND acknowledged (+30m), STOP/CANCEL STOP, and ABORT click/release on scratch control files. Original games/recordings untouched. Initial fake UTC acknowledgement was rejected, fixture corrected to schema-valid New York milliseconds, reload recovered with no problems.
- Pointer Watch from comparisons selected gpu0_b300 and showed its live frame; return + keyboard Enter selected gpu1_35df and reached RUNNING with no problems. Inspected screenshots at exact CSS1280, CSS1440 and CSS375 (including phone sheet); no horizontal overflow or console errors. Images: canonical `runs/mockups/viewer-head-first/shots/`. Viewport restored.
- Build dependency setup: worktree uses canonical .env symlink and a copy of the already installed native mGBA binding. No ROM copied. A first dependency-incomplete gate was superseded by the zero-skip gates above.

## Review/landing boundary

Main remains 0924e149; this task owns no other landings or 8790 restarts. Freeze against that base, independently review the exact committed diff, then re-check main before fast-forward. Cloud Claude standalone auth probe is loggedIn=false; try the approved Cursor Claude harness on the frozen packet. No unavailable lane is approval. GPT/Codex lane uses a fresh read-only no-history reviewer. Boundary and every-PB principles table are in `.cache/head-evidence/`. No merge/restart claimed yet.
