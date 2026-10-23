# Party health from battle RAM

## Problem Statement
The operator requested repair of stale/missing party health. In real run `roxanne-autonomous-16gpuh-20261023_gpu0_explore-1`, seven state events omit party while retaining initialized battle RAM. State 18175 has player HP 22 while the retained party from 18174 has HP 39; 18255 has HP 6 while retained party has HP 22. Viewer ignores battle health. Discovery is read-only; no game process or recording modified.

## Skills Loaded
- pokebench-game-state
- viewer-e2e
- close-the-loop

## Architecture
Viewer-only health overlay, matched by party slot and persistent identity, with source-state provenance. Preserve roster/profile/moves from the latest readable party; overlay only HP/max HP/status from validated player-side battle RAM. Never mutate original events or change agent observations. Retain fresh health through missing samples, reset on a new readable roster. Replay applies only events at/before its cursor. No new timeline marks.

## Invariants
- INV-1: opposing, absent, uninitialized, mismatched identity/owner and invalid HP cannot update a player party slot.
- INV-2: party samples supersede overlays, and replay never sees future samples.
- INV-3: partial recovery never claims current health for inactive party members.

## Security Review
Pure recorded-data presentation. No network additions, emulator inputs, RAM writes, or benchmark policy changes.

## Milestones
**M1 — Repair and verify party health**
- [x] RED regression tests, commit 7dcfd12ea; 11 expected failures before implementation
- [x] GREEN implementation
- [x] Tests, lint, build and coverage
- [x] Read-only real-log before/after evidence: all seven missing-party samples recovered
- [x] Background browser verification at desktop and phone widths
- [x] Independent review and coordinated landing (standing Grok waiver; receipts below)

## Closing the Loop
Isolated candidate preview against scratch recordings. Preserve desktop focus. No active runs restarted or launched. Shared viewer remains unchanged until reviewed landing and coordinated restart.

## Session Log
- 2026-10-23: Isolated branch codex/party-health-live from main 24d71e151. Source reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean. PlayerHandleSetMonData updates gPlayerParty HP/status from controller buffers; battle health is independently recorded in gBattleMons. Coherence guard deliberately omits save-backed world readout mid-callback and must not be disabled.

## Surprises
- Missing party and valid initialized battle HP coexist in the same state event.

## Multi-Model Review Log
Completed. Exact packets, findings, correction, waiver provenance and literal verdict receipts are recorded below.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog

- GREEN verification: 18 party-health tests included in 1779 viewer coverage tests; 4053 agent coverage tests. Coverage agent 99.13% lines / 92.93% branches / 97.61% functions; viewer 98.04% / 91.61% / 95.18%. TypeScript lint and build pass; Python ruff/format and mypy pass. Vendor remains clean at its pinned SHA.
- Fresh worktree initially lacked ROM environment and the built mGBA module, causing native suite failures; configured the established external ROM path and linked the existing read-only native binding into the owned venv. Initial agent suite hit the existing tiny hung-child deadline under parallel load; the complete agent suite and subsequent coverage suite both passed without test changes. Python rerun with native dependencies is pending at this receipt.
- Wiring-deletion proof: removing updatePartyHealth(event) causes four health-propagation/replay tests to fail; restored the production call.
- Read-only full-log before/after HP: 18041 39→39; 18175 and 18177 39→22; 18255 and 18257 22→6; 19346 and 19348 39→39. All seven now carry same-sample battle health source, with zero original event mutation.
- Headless Chrome preview at 127.0.0.1:8798 against a scratch recording prefix proves party list and summary show 22/39. Profile and Stats screenshots inspected at 1280×900, 1440×900 and 375×812; no new layout overflow. Real event-tail streaming in a separate scratch run updates an already-open Stats panel 39→22→6 and preserves the selected tab, with no page errors, across multiple poll cycles. Screenshots: canonical runs/mockups/party-health-live/shots; before-after.json retains table. Scratch metadata uses an unused server port and a synthetic terminal event; no real game is controlled.
- Limits: this repairs recorded-sample presentation, not 60 FPS health capture. The existing video stream has a separate cadence. Reserve members without fresh data stay explicitly labeled; unknown identity never becomes a guessed match.

- Final native gate: 4050 Python tests passed, no skips, coverage 97.37% lines / 93.30% branches / 100% functions. Complete `just coverage` passed all three stacks on the candidate. GREEN commit 09f8074f9. Full lint was reconstituted from passing TS lint, ruff checks/format and corrected-environment mypy (120 source files).

## Review round 1 receipt and correction
Frozen head 4aacb4940, diff SHA256 786f30776c2586b39452778e6423c596c970a5ae9bad1526d124d9bbfc8f14ab. Claude CLI, independent GPT, and Astra fallback returned VERDICT: LGTM. Grok Cursor failed with ActionRequiredError out-of-usage. Sol fallback found a concrete in-boundary defect: conflicting identities sharing one active player slot were filtered by identity before checking slot uniqueness. **Fix:** reject duplicate slot assignments before matching identity. Added regression; observed 1 failed / 18 passed before correction, then complete viewer coverage passes 1780 tests, 98.04% lines / 91.61% branches / 95.18% functions. TS lint/build rerun. No new production domain. Claude's optional per-slot source-label expansion is follow-up; current notice explicitly labels untouched members as last-recorded.

## Standing review authorization
The project coordinator relayed the operator's blanket Grok waiver from 2026-10-22 10:47 AM EDT. Independently verified the server-copied user citation in local Claude transcript `[private transcript]`, line 6309, message [private message reference], author user, timestamp 2026-10-22T14:47:31Z: "land without grok. you're not a very good coordinator if you force me to go into chats". Current coordinator confirms Claude + GPT + distinct fallback approvals cover this branch. Use that existing authorization; do not request it again. Queue order and exact frozen-packet review still apply. No hold of main.

## Round 2 and landing-window handoff
Frozen production head 4889526403a2ced7c0cdf878605b3937fe8b7ca3, cumulative binary diff SHA256 f39106a32d52e2055fbbd568945984dd107e6f36af85f6189b6feb6197d6529e. Claude CLI, independent GPT, Sol fallback and Astra fallback each returned exactly VERDICT: LGTM with clean pre/post receipts and identical packet. Sol independently passed all 1780 viewer tests. Claude terminal result was validated as a single successful result, terminal LGTM, empty stderr. Full receipt directory is canonical `runs/reviews/party-health-live/` (ignored). Final frozen-build headless browser reruns passed profile/stats at all three widths and open event-stream39→22→6 with no page errors.

**Not landed / not live:** coordinator has promised ELEVATION then favicon the main/8790 window. Latest correction: after favicon lands, join board behind whoever is ready and already queued; do not wait for unready CYCLE/story/battle-history. Coordinator will relay release to this chat (00000000-0000-4000-8000-ab5c8b20009e). No board join yet, no shared viewer restart. Main was still24d71e151 at this handoff. Re-sync main, rerun required gates and preserve/recheck frozen own diff before joining. If the packet changes, re-freeze/re-review; no blockers remain from round2. This evidence-only documentation commit records results but is not itself a newly reviewed code packet.

Active gameplay process snapshot before waiting: agent PID53193 and game serverPID53718 (8077) untouched. Shared viewerPID54431 on8790 untouched. Owned preview8798 stopped after verification; scratch recording prefixes retained under owned runs/party-health-preview. Screenshots stay served at8791/party-health-live/shots/.

## Sync onto released ELEVATION main
- ELEVATION released source1389e21a5/evidenceba4a1a945; merged ba4a1a945 cleanly into owned branch at e096c8899. Production/test patch content is unchanged from round2; the binary diff changes only panels.ts blob IDs plus accumulated worklog receipts.
- Synced default build and complete lint passed (ruff279 files, mypy122 source files). Default agent coverage4072 tests passed:99.13% lines/92.94% branches/97.61% functions. Native4065 tests passed:97.37% lines/93.30% branches/100% functions. Initial default viewer coverage retained one existing malformed-lines5s timeout while shared host was busy. A reduced-worker1782-pass run was diagnostic only. After other owners released heavy workers, **unmodified default viewer coverage passed1782 tests across126 files**,98.04% lines/91.61% branches/95.18% functions. No test, timeout, concurrency limit or coverage threshold changed.
- Real shared8790 browser before-proof at original replay scrub145: raw party fallback39/39 and unavailable notice. Headless screenshots1280/1440/375 inspected. After landing/restart, replay this same position to require22/39 and battle-RAM source18177. Receipts under canonical runs/reviews/party-health-live/shared-before.json; shots/shared-before-*.png.
- Heavy synced gates now released for other owners during cloud-only frozen-review refresh. Post-main test/restart window remains coordinated. No board join until final packet approvals.

## Final landing and live proof
- Synced frozen packet: base ba4a1a945fb874897d1ba083525703fd2818eab2, source c249f81eeb5dc5416de9e51321a7db37bc31ff66, binary diff SHA256 ea46338f0e4f6be30fd495e6680bcedda5336450cdca1e83ba1757873eb3677a. Claude CLI, independent GPT, Sol and Astra each VERDICT: LGTM on the same clean packet. No unresolved blockers. Grok remained unavailable; the verified standing operator waiver applied.
- Joined landing board with verified chat 00000000-0000-4000-8000-ab5c8b20009e and obtained slot1 at3:17PM EDT. Canonical main was clean and exactly the frozen base; landed fast-forward source c249f81ee. Canonical build passed.
- Initial post-main default justtest: agent4072pass, viewer1781pass/1pre-existing malformed-lines5stimeout while battle-history/trainer suites were active. Retained failure. Owners safely yielded; actual process check and handoff confirmed quiet. Unchanged default justtest then passed **agent4072, viewer1782, native4065** (native38.39s). No skips, timing/concurrency changes or threshold reductions.
- One justviewer-main restart completed at 2026-10-23T15:23:05.884551-04:00: served clean build stamp c249f81ee, listener12556→44482 (PPID1), exactly one loopback8790 listener. Agent53193 and game53718 stayed alive; active GLM run still shows live with no problem.
- Real original replay at scrub145: **before39/39 plus unavailable notice; after22/39, battle-RAM state18177**, roster/profile source18174 preserved. Real paired frame018178_0.png also shows22/39. Headless screenshots1280/1440/375 and paired game frame opened and inspected; no page errors. Phone proof and paired frame links at8791/party-health-live/shots/shared-after-375.png and shared-after-game.png returned200.
- Active GLM session independently verified in headless Chrome after restart: screen-note live, blob frame source, visible MARSHtomp/ARON battle frame; no page errors. API/workbench lists526runs, active run live/problemnull, **zero older-viewer-build warnings**.
- Final receipts: canonical runs/reviews/party-health-live/ contains frozen packets, default gate logs, failure receipts, reviews and shared-before/after/live JSON. This evidence-only main commit touches only this worklog, then releases board and8790 to next ready owner. No gameplay runs launched/restarted or game inputs/RAM writes performed.
- Remaining boundary: updates follow recorded RAM samples, not every video frame. Inactive members without a newer trusted sample retain explicitly labeled last-recorded health. Worklog archival remains operator-gated.
