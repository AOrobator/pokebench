# Preserve trace reading position

User: phone trace refresh jumps to the newest turn. Approved fix: scrolling back or expanding a trace holds the reading position; new activity can be reached with Jump to latest. User clarified that scrolling to the top should also resume following.

Single milestone: regression tests, implementation, background desktop/phone browser proof, gates, cloud review, landing board and live proof. No gameplay or trainer-card changes.

## Invariants
- New events preserve the visible row and offset while reading older content, including after more than 50 turns arrive.
- Returning to top by user scrolling or Jump to latest resumes following.
- Expanded rows remain expanded; touch works without hover; programmatic compensation does not resume follow.
- Run/replay resets clear reading state.

## Progress
- [x] RED regression: phone reading test fails because no trace-latest control exists.
- [x] GREEN implementation: explicit reading hold, top/jump resume, retained oldest displayed turn, native anchoring disabled, hover snap removed.
- [ ] Gates and browser proof
- [ ] Cloud review
- [ ] Landing and live proof

## Evidence
Pending.

Initial full test attempt: 4389 agent and 1915 viewer tests passed. Python failed because isolated worktree lacked ROM env and native mGBA package; supplied the existing ROM configuration and read-only native package link in the isolated worktree, then reran via coverage. Inherited lint issue at workbench-store.test.ts:599 will be rechecked after synchronization with the milestone owner.

Browser proof: headless Chromium, 375x812 touch and 1280/1440x900 desktop. Expanded turn 40 remains open after 60 new turns over two 3.1 second update cycles; relative offset -120.125 to -120.5 px. Pointer, touch return-to-top, click and keyboard Jump checks passed, zero page errors. Final screenshots reserved button layout pending recheck. Full pre-sync coverage: 4389 agent / 1914 viewer / 4159 Python tests passed, Python coverage 97.40/93.43/100. Initial environment failure corrected without changing test or application code.


## Expanded user scope: whole-page mobile reload and lazy history
The user confirmed the whole viewer restarts and closes the sheet, and explicitly requested lazy loading run history. No explicit reload exists in app source. Current live Qwen recordings measure 1.33/1.51 GB; the old app eagerly opens the entire /events stream after a recent head and retains it in browser memory. This is a concrete memory-pressure path; a native phone crash is user-reported and has not been directly instrumented.

Implement a read-only paged trace-history endpoint (max 4 MiB / 50 turns) sought by sequence number, replacing eager full-history client download. Explicit Load older turns merges one page with current live events. Preserve selection, reader anchor, run sheet and newer tail; ignore stale responses after run switches/reconnects. Replay range and stats are explicitly limited to loaded history; full canonical recordings stay on disk. Complete server-derived milestone splits remain visible while history is partial. The separate PokeNav bootstrap owner changes only sparse head hydration in runs.ts/model.ts, not this API or app UI. This remains one viewer interruption fix milestone.

Paged history checks: 139 focused tests pass (app, phone header, paged server). Server pages are validated, bounded to 4 MiB and 50 turns, seek by sequence without sending the whole prefix; oversize/corrupt records fail explicitly. Tests cover consecutive pages with no gaps/duplicates, multibyte data, partial appends, invalid cursors, foreign/disordered data and real HTTP. App tests prove no eager history with sheet idle, live tail wins asynchronous page merge, reconnect retains older events, stale page ignored after run switch, page failure leaves current view and retry intact. Existing full test suite passed 4389 agent / 1923 viewer / 4159 Python before expanded lazy scope; trainer-card visual proof initially lacked scratch art and must rerun with existing POKEBENCH_CARD_ART path. No protected baseline edits.

Principles self-review (PB1-PB13): PB1 PASS, native facts unchanged and server splits retained. PB2 N/A no run grading/filter changes. PB3 N/A no benchmark benefit claim. PB4 PASS no model-facing advantage or tool changes. PB5 PASS one viewer interruption scope with user-approved lazy loading. PB6 PASS tests exceed rolling retention window and page a large recording. PB7 PASS original logs untouched; paged events retain provenance and sequence. PB8 N/A no model guards. PB9 PASS requested follow/resume behavior and expanded lazy scope explicitly confirmed. PB10 PASS no skipped/weakened tests or baselines, environment repaired in owned worktree. PB11 PASS pinned vendor verified; current main synchronized with separate sparse-bootstrap owner. PB12 PASS all browser work headless, no focus/TCC operations. PB13 PASS candidate browser checks and regression gates; landing/live proof pending.
