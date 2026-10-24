# Gym labels in both arms

## Problem Statement
The operator explicitly requested enabling the existing gym-door-label-v1 in both arms and landing it in parallel with the parent exit work. The analyzed control runs omitted GYM because their feature receipts have this existing fix OFF.

## Skills Loaded
CLAUDE.md; talk-to-claude; execute-worklog; feature-worklog; close-the-loop; local-inference-stack multi-model-review.

## Architecture
Only evolving bundle-v-control and bundle-v-control-2h definitions change: move gym-door-label-v1 from switches to onInBoth and set base.features true. Use existing armPreset and server feature transport. No observation code or global defaults change. Required existing dependencies named-warp-destinations-v1 and exit-labels-v2 also move to onInBoth in bundle-v-control; otherwise the production parser rejects gym ON in control. bundle-v-control-2h already has this dependency ON in both. Preserve pinned control-base files, all other recipe values, historical definitions and active runs. This recorded plan implements the operator's approved request; no new scope or launch.

## Invariants
- INV-1: Both normalized arms enable gym labels through serverFeatureEnv. Production parser/arm/preset test.
- INV-2: Other recipe values and pinned bases remain unchanged. Structural comparison against approved baseline.
- INV-3: Ordinary defaults stay OFF. Default/preset assertions.

## Security Review
No new input, network, data access or persistence owner; JSON recipe activation only.

## Milestones
**M1 — Activation**
- [x] RED production recipe test: both approved recipe activations fail before config change; omitted-default test corrected to include required flags.
- [x] GREEN recipe amendment; focused agent 47 PASS, viewer affected batch 19 PASS; build and vendor checks PASS. Full gates pending.
- [x] Gates: all test constituents, lint, build, coverage >=90%, vendor (counts and runtime correction below)
- [x] Frozen review: Claude/GPT + distinct Astra/Sol fallback LGTM; unavailable Grok covered by independently verified standing user waiver (below)
- [x] Landing board, main test, coordinated viewer restart and receipts

## Closing the Loop
Read-only production arm expansion proves future control/bundle presets and server transport. No gameplay launch or benefit claim. Coordinate shared viewer restart with parent; preserve gameplay processes.

## Session Log
- 2026-10-24: Owned branch codex/gym-label-both-arms from ebed5a7f3. Parent confirmed exactly two evolving recipes. User authorization: “have a subagent enable gym-door-label-v1 in both arms and land that”.

## Surprises
Production parser caught the required exit-labels-v2 dependency OFF in the older control. Parent informed; dependency activation is necessary to honor gym labels in both arms.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog

- RED commit 91cdc1b55. Production recipe failures captured in /tmp/gym-label-red2.log; default check corrected to use the valid legacy preset shape (features omitted entirely).

- GREEN: production normalized arm/server tests 3 PASS; affected viewer tests 19 PASS. Exact JSON structural comparison against ebed5a7f3 proves only intended gym/dependency base values, factor membership and onInBoth membership changed. Existing tests updated for authorized both-arm behavior and exact shifted factor indices. Initial full agent pass 4 failures, all expected changed recipe assertions (4224 passed); corrected.

- Sync current main 42edb3f22 (independent trigger-boundary promotion) before review. Keep all incoming production recipes/tests; resolve only overlapping exact index expectations and gym=true assertion. Full prior pass: agent4228 PASS; viewer1830 PASS, two remaining shifted frontier index checks now corrected. Coverage failed unchanged live-human timeout/secondary leaked call and serial-comparison child stdout under concurrent load; no test suppression or threshold change. Focused eslint on gym test PASS after prior concurrent edit lint failure.

- Integrated coverage: agent all4228 PASS and all floors PASS; viewer1839 PASS/1 FAIL solely incoming battle-history factor positions (our removed factors shift3/1); corrected those exact indices. Full rerun required after correction.

- Worktree qualification setup corrected: local @pokebench package link now resolves this worktree (direct shared node_modules had produced duplicate-private-type tsc errors); .env links canonical runtime configuration and mGBA links installed binding. Initial direct uv Python invocation lacked dotenv/binding; retain its failures as setup diagnostics, not source verdict. Final unmodified just gates run sequentially with correct setup; no tracked runtime/dependency changes, test retries/limits/serialization or floor changes. Synced evidence-only main7133032cc.

- Final qualification on integrated tree: just test source suites agent4228/viewer1840/Python4106 PASS. Its protected-art step initially lacked ignored local art; documented POKEBENCH_CARD_ART path restores unmodified trainer-card-check, all3 baselines PASS. Full just coverage PASS with agent L99.14/B92.73/F97.53, viewer L98.04/B91.68/F95.18, Python L97.37/B93.33/F100; full lint/build/vendor PASS. Unchanged app-controls at121 timed out once earlier; isolated unchanged file14PASS, subsequent full viewer1840PASS. No test policy changes.
- Minimal activation copy correction: existing registry description removed stale “bundle only”; existing explainer names exact two both-arm recipes. No registry ID/order/default/wiring or HTML layout change.

- Existing explainer changed activation sentence only; zero-network pages check PASS, screenshots at1280/1440/375 captured via headless Chromium and inspected (all text visible, no overflow/cutoff); no desktop focus or UI activation. Focused registry/name tests2PASS after copy correction; no runtime behavior changed by copy. Review evidence under runs/reviews/gym-label-both-arms.

## Landing and operator-facing receipt — 2026-10-24

- Reviewed source landed fast-forward at `2594c77ab908d24e73000cef78f70d25bd782aac` from main `7133032cc1da7cd49363b6bd32a53294afcdb557`; binary diff SHA256 `ef392aa0a29d822c26ad5557fa52254d4421966ca1b335fbfada70a0e5271564`. Candidate and main were unchanged from frozen review before the merge. Landing board number1 bound to actual child CODEX_THREAD_ID `00000000-0000-4000-8000-7574d8edff27`.
- Normal Claude CLI and fresh no-history GPT-family reviewer each returned literal `VERDICT: LGTM`; two standing outage fallback reviewers (fresh `gpt-6-astra` and `gpt-6.1-sol`, distinct models) also returned `VERDICT: LGTM`. Each independently reproduced frozen digest/status and ran focused agent47/viewer23 PASS. Cursor Grok exited1 with usage-limit ActionRequiredError and no verdict; reduced vendor diversity is explicit.
- Missing Grok verdict covered by original human standing waiver, independently checked here and by parent: trusted server-copied user citation `[private message reference]`, author=user name=the operator, 2026-10-22T14:47:31Z: “land without grok. you're not a very good coordinator if you force me to go into chats”. Source record `[private transcript]` line6309. Coordinator confirmed standing applicability; current human request explicitly authorized this independent gym landing. No other gate waived.
- Post-main `just test` PASS: agent4228, viewer1840, Python4106, protected trainer-card baselines3. Main production arm expansion proves all six phase/arm combinations enable gym labels and existing prerequisites. Global ordinary defaults remain OFF; existing runs and historical recipes untouched.
- Default service worktree `/private/tmp/pokebench-viewer` contained101 preexisting tracked deletions, including production modules. Its documented restart failed during build BEFORE old listener termination. Preserved that checkout unchanged and saved status/binary patch; told coordinator to investigate separately. Used documented `POKEBENCH_VIEWER_WORKTREE=/private/tmp/pokebench-viewer-gym-label` override for fresh clean worktree, with parent agreement.
- Required shared8790 restart succeeded. At4:09PM New York the actual served fresh-worktree stamp is clean `2594c77ab908d24e73000cef78f70d25bd782aac`, sole loopback listener PID41245. All three protected gameplay PIDs14929/53861/63776 retain identical start times and command hashes. Current3b6e/0517/4f08 appear LIVE in workbench; zero older-build problems. Pre-restart old workbench had classified them unresponsive; no changes to their sessions were made. Cold historical loading remains in progress (446/536 pending at receipt); this is explicitly not proof all historical summaries are loaded.
- Headless actual8790 browser selected current3b6e with visible game frame and RUNNING status, clicked HARNESS CONFIG, searched exact gym ID, and clicked READ EXPLAINER to correct updated scope. Historical feature status remains NOT RECORDED; it is not silently marked enabled. Browser pageerrors empty. Live config and explainer screenshots inspected; prior candidate explainer1280/1440/375 inspected. No OS focus, run inputs, launches or timeline additions.
- Complete frozen packet, normal/fallback reviews, synthesis, waiver provenance, protected-process and served-stamp receipts, browser screenshots and main-arm expansion retained in `runs/reviews/gym-label-both-arms-20261024/`. Existing prerecorded runs retain their recorded configuration; this activation applies only to future generated presets. No gameplay benefit claimed.
