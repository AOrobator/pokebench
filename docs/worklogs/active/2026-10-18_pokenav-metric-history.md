# PokéNav LLM metric history

## Authorized outcome and scope

The operator approved the compact screenshot on 2026-10-18 and requested implementation, independent subagent review, bug fixes, and local main landing. Append four synchronized strips under the existing LLM Stats Counters and Budgets: TTFT, inference/request, output/request and prompt composition. Reuse existing PokéNav screen styles and actual mobile arrows/dropdown unchanged. No stats time slider. Preserve existing viewer/replay lifecycle.

Viewer-only scope: RunView completed-response samples, pure SVG metric-history renderer, Stats consumer wiring, existing HTML/CSS and browser-module serving allowlist, targeted tests. Prompt composition uses recorded input/cache-read tokens; instruction/history/tool counts and separately measured reasoning tokens are unavailable in existing recordings and must be labeled honestly. No prompt changes, experiment launches, schema changes, JIT-branch landing, timeline changes or dependencies.

## Invariants

- Values come from assistant events in this run at the current replay position, never mock values.
- Shared elapsed-time axis; missing TTFT breaks the line, zero is retained, unavailable data is not fabricated.
- Each completed response remains distinct, including multiple responses in one turn.
- Current Counters/Budgets, theme and production navigation remain intact.
- Polling/replay/run switching update through existing rendering owner.

## Validation and review

- [ ] RED/GREEN focused metric, replay and mounted consumer tests
- [ ] Required test/lint/build/coverage/vendor gates
- [ ] Candidate browser at1280/1440/375; live-update/replay proof and screenshots
- [ ] Principles self-review and frozen packet
- [ ] Claude, Grok and isolated Codex review; findings fixed and re-reviewed
- [ ] Fast-forward local main; preserve unrelated dirty work
- [ ] Coordinate8790 restart and verify real recorded data at merged build

## Session log

- Dedicated worktree created from main00aa1e69; canonical checkout has pre-existing changes and is not an editing workspace.
- Applying viewer-e2e, close-the-loop and multi-model-review. PokeBench overrides prohibit local inference reviewer lanes. Launch hold remains intact.

- Implemented native-theme strips from replay-bounded shown RunView, with distinct response sequence identities, null/error gaps and explicit composition limitations. Latest300 display samples bound SVG work; tiny injected bound2 pins window behavior without filling a production cap.
- Focused consumer/projection tests pass (71); adversarial deletion of projection and consumer each failed the intended test and was restored. First full gates exposed missing browser allowlist entry and absent worktree mGBA package; fixed registration and linked existing pinned native binding, without source/dependency changes outside viewer.
- Full test run after native environment setup:2425 agent +1152 viewer +2707 Python passed, zero skips. First coverage/lint passed90% floors after environment setup; rerunning exact committed candidate gates before sealing review.
- Candidate actual browser uses a scratch copy of first10 wall minutes of archived eb60 recording (129 responses, synthetic terminal marker only). Original recording unchanged, no inference, queue or autorun. Browser review found overlay scrollbar obscuring rightmost mobile values; scoped Stats gutter/padding and compact y-axis ticks fix it. Existing native pager untouched.
- Cloud Claude standalone profile reports loggedIn:false; standing-approved equivalent Cursor Claude harness will be used. No local inference reviewers.

- Round1 frozen63ef7a3f/diff50212977: Grok LGTM; isolated GPT found P2 disclosure state reset (root browser confirmed). Claude returned LGTM but violated read-only review by running the mutation script against tracked source, then restored it; no approval is carried forward. All packet bytes restored/clean. Fix classification: in-contract; static disclosure moved beside the dynamic chart host, same existing index/renderer/style paths. Regression fails old replacement semantics and asserts node/open-state preservation. Round2 will prohibit tracked writes explicitly and monitor reviewed bytes.

- Round2 frozen1502cfbb/diff7024736d: cloud Cursor Claude and Grok plus isolated GPT each VERDICT: LGTM. Both external receipts exit0/trackedWrites[]; GPT independently reran71tests. Full5gates pass at1502; native browser129realresponses replay/phone proof and screenshot sheets inspected by root. Main fast-forward landed1502cfbb. Shared live restart deferred to single combined experiment-pin restart.
- Combined candidate cf2f browser proves cachewrite-aware partial historical totals, persistent definitions and unchanged native mobile navigation at1280/1440/375. Canonical unfinished81files preserved by direct user authorization in separate attachedworktree; final JIT candidate includes approved graph source.
