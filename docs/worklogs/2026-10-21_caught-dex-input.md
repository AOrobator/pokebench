# Post-catch Pokédex input ownership

Request: fix registration reading as no input open; enable in bundle only.

Branch: codex/caught-dex-input. Baseline fc40a11a1. No measured runs authorized.

Evidence: c6c2 state 12066 / raw 5393 frame 165639 has CB2_BattleMain
0x08038421 and task 0x080C0089 with dex number 263. Earlier raw 5388
has display task 0x080BFE39. Source pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881,
src/pokedex.c Task_HandleCaughtMonPageInput checks JOY_NEW(A_BUTTON | B_BUTTON).
The standalone dex reader requires CB2_Pokedex, so it misses this battle overlay.

Plan: register default-OFF caught-dex-input-v1; detect task-owned page under battle
callback without dereferencing standalone PokedexView; stop battle wait/auto-advance
at the page, expose A/B controls, retain previous behavior OFF; enable both active
bundle definitions, register pending experiment and explainer. Verify source/ROM,
archive paired frame, red/green regressions, production wiring, gates and review.

## Implementation and verification

- Native source/ROM mapping verified read-only: 0x080C0088 reads gMain.newKeys
  with mask 3; its task replacement literal at ROM 0xC00E4 is 0x080C012D
  (Task_ExitCaughtMonPage). Corrected the provisional exit address before testing.
- Production archive reparse: SHA-256 19a7c10a…3066bdf4 verified through load_raw_ram,
  matching external US ROM. Raw 5388 is transition, 5393 is input-ready. The paired
  frame frames/012067_0.png was opened and shows registration completed for ZIGZAGOON.
- National dex number 263 is distinct from the displayed Hoenn number 012; the
  readout quotes the visible registration heading, stores national_dex_number separately.
- OFF remains busy/battle_resolving; ON yields screen/pokedex_caught_entry and A/B
  controls. Display/exit/invalid owners stay non-ready. No button is chosen automatically.
- Agent regression uses production-reparsed OFF/ON snapshots through parseGameState,
  observe/press wrappers: requested A is sent, no battle wait. Existing event schema
  and viewer rendering carry the state, without adding a timeline mark.
- Mutation receipt: removing rerender.caught_dex_enabled fails the production factory
  test; restoring it gives 6/6 targeted tests. Unique receipts in
  runs/diagnostics/caught-dex/mutation-factory-{removed,restored}.txt.
- TS coverage run: agent 3283 pass, viewer 1602 pass; lines/branches/functions clear 90%.
- Python coverage run: 3589 pass; lines 97.23%, branches 92.98%, functions 100%.
  Initial failed attempts lacked the worktree vendor checkout/ROM environment or
  needed append-only registry expectations; all were repaired, no test disabled.
- Both fixed bundle definitions pass fixed-cli check; control base remains matching.
- Global experiments-check also reports existing unrelated malformed starter-decision-
  salience trial ledger rows. No ledger edited; new pending definition parses in tests.
- Browser: isolated viewer on 8794 with a scratch reconstructed registration record
  (not a measured run); Harness Config search finds CAUGHT POKÉDEX INPUT ON, and
  READ EXPLAINER opens the correct locally served document. 1280px view inspected.
- Synced to main 8f98367d1 (unrelated party HP class fix); final lint/build and viewer
  regression recheck precede landing. No gameplay session changed or run launched.

## Principles Adherence

PB1 PASS: source task/RAM/frame establish readiness; no model-narration grading.
PB2 N/A: no measured run or failure excluded; historical records untouched.
PB3 PASS: correctness claim only, no performance inference from one capture.
PB4 PASS: default-OFF registered/server-forwarded switch and run metadata; vendor pristine.
PB5 PASS: one repair with independent OFF/ON; bundle-only treatment declared.
PB6 N/A: no context retention, compaction or long-run policy change.
PB7 PASS: existing state and tool-result schema/recording paths retained; scratch data labelled.
PB8 PASS: missing/duplicate/invalid task ownership never guessed ready; busy waits bounded.
PB9 PASS: requested bug and bundle scope explicit; no game policy or automatic choice added.
PB10 PASS: append-only expectations updated; complete gates, no lowered floor or skipped test.
PB11 PASS: reference revision plus exact ROM instructions and archived memory verified.
PB12 PASS: external ROM remains at ~/.roms; no TCC path or game asset committed.
PB13 PASS: worklog, regressions, coverage, lint and review packet; landing/live proof separate.

## Independent review, round 1 and corrections

Frozen 145e117a5 / packet SHA256 ab3fc58f373049a36e1fb12b66422ec8e6ce14004e7dc766b6c0b1b8b59fc8f7.
Grok (cursor-grok-4.5-high) returned VERDICT: LGTM; exit 0 with only allowed
post-verdict reconnect diagnostics. Claude Opus/Sonnet Cursor and Cursor GPT
were usage-limited; standalone ~/.claude-review loggedIn=false. Preserved exact
failures under runs/reviews/caught-dex-input/. Applied standing-authorized
outage fallback: fresh no-history gpt-6.1-sol/xhigh (/root/review_sol) and
gpt-6-astra/high (/root/review_astra), retaining available Grok. Reduced vendor
diversity is explicit. Both verified frozen digest and clean pre/post status.

Both fallback reviewers returned VERDICT: BLOCKING: central game_state phase
replacement lacked an automated native-RAM caller-seam regression. Astra also
reproduced a scheduler race in the waiter test's timed polling. Accepted both.

Corrections (same frozen production boundary, no production behavior changes):
- Wait test now signals registration from the released memory-lock context,
  and includes explicitly delayed-worker scheduling. No polling or sleeps.
- Tracked exact raw5393 native archive (SHA256 verified) and tests execute real
  read_state -> game_state -> render with OFF/ON, expanded/plain readouts,
  and a task-owned display transition. External ROM remains untracked and is
  SHA1-verified by resolve_rom.
- Separate adversarial removals of phase override, battle header treatment and
  interface copy each fail the intended assertions; restored suite passes 9/9.
  Receipts: runs/diagnostics/caught-dex/{phase-override-removed,battle-header-removed,
  interface-copy-removed,production-mutations-restored}.txt.
- Pending experiment source now pins implementation 145e117a5, which contains the
  switch; entry remains unqueued and unapproved.
- Explainer inspected at 1280px, plus 1440px and 375px iframe viewports; phone
  diagram scrolls within its section. Screenshots saved under canonical
  runs/mockups/caught-dex-input-v1/shots/. Card click verified on isolated 8794.


## Final integration

Round 2 fallback reviewers Sol and Astra both returned VERDICT: LGTM on
12b16d37b / packet cf36a17bc366043b70ae7e5de694f1212735fae0f9af5880f1c6f133d7422a79.
Sol additionally exercised 50 delayed/scheduled waiter cases under CPU load.
Full corrected Python suite: 3592 passed. Grok round-2 transport exceeded its
240-second bound without a terminal verdict; preserved incomplete stdout/stderr,
never counted as LGTM. The two standing-authorized independent fallback models
therefore cover the unavailable roster; reduced vendor diversity remains explicit.

Main advanced to 4e6d5bb32 during review (native move-learning Menu line fix).
Rebased cleanly onto it; no candidate production edit or domain added. Pending
source pin follows the rebased implementation commit. Final identity verification
and narrow integration re-review required before the ff-only landing.

Final pinned integration base is 52b086acc1c8b32255d05a0529926d863ab6a4f1,
including the independently landed move-learning menu and party HP fixes.
An intermediate review manifest used stale base4e6 while a live main ref
advanced before rebase; both reviewers identified that packet identity drift.
It is superseded. Final packet uses the immutable52b hash passed to rebase.
Caught-dex production patch remains unchanged; integration checks95/95 pass.

Concurrent switch integration: rebased onto pinned5534f2850, which already
contains gym-door-label-v1. That switch remains before caught-dex in registry
order, retains its own defaults/control and bundle selections, and keeps its
pending experiment and explainer. Combined registry expectations are rechecked.

## Combined bundle gate and landing checkpoint

Gym-door integration leaves the caught-dex decoder, battle wait and readout
mechanism unchanged. Both server feature lists append gym-door before caught-dex;
legacy/default/control paths keep caught-dex OFF, bundle arms turn it ON.
Registry/snapshot tests were updated to preserve both treatments. Python combined
suite3609 and agent3284 pass; the viewer was rebuilt before final registry tests
(stale dist first reported unknown gym-door). Repositioned the new explainer-route
test as a sibling of the Gym test, retaining both.

STOP before local-main landing: repository-local execute-worklog skill says
"If a cloud lane is unavailable (usage limit, auth, model rejected), there is no
self-merge. Record it in the worklog and ask the operator." The broader fallback
review skill authorizes independent reviews but does not override this local
landing restriction. Claude cloud remains unavailable; leave this reviewed
branch concrete and ask the operator for approval before merging. No launch approved.

## Operator-authorized landing, 2026-10-21

The operator explicitly approved: "Yes, land it on main using the fallback reviews
and restart the viewer." This clears the cloud-lane landing checkpoint above.
Main has meanwhile landed mart-stock-readout-v1 at54640622b. Integration
preserves the incumbent Gym and mart switches, appends caught-dex after them,
and rechecks all combined registry/default/bundle/native readout paths. The
caught-dex decoder/wait semantics and source fixture remain unchanged. No
experiment or gameplay launch is authorized by this landing approval.

Mart integration native suite:3647 passed. Registry expectation updates append
caught-dex after gym-door and mart-stock without changing their existing order.
Earlier stale expectation failures were retained in logs and corrected; no
assertion or test was removed. Final frozen review follows clean combined gates.

Final integration gates: agent3287 and Python3647 pass. The card-projection
fixture's fixed 5000 tiny historical rows missed its 20× reduction assertion
by8 serialized bytes after one registered feature increased fixed header cost.
Preserved the 20× assertion and production code; raised the bounded historical
fixture to6000 rows so the test measures omitted history rather than a marginal
header-size boundary. Both explainers remain sibling tests. Viewer full suite
and final lint rechecked before freezing the operator-approved landing packet.

## Completed and archive authorized, 2026-10-21

Operator requested archival and branch/worktree cleanup after landing.
Landed 4cfce22ec540c397e2d801a500e1a6680614f6b5 with two approved fallback
reviews. Viewer restarted and browser-verified on that clean build.
Post-merge coverage suites: agent3292, viewer1609, Python3647 passed (8548 total);
all coverage dimensions exceed90%. Bundle ON, control/default OFF.
No measured experiment was launched. Further merges paused for landing-board
coordination. Canonical WORKLOG.md points to another task and is preserved.
Evidence retained under runs/reviews/caught-dex-input/ and
runs/mockups/caught-dex-input-v1/shots/landed-main.png.

## Commit coordination correction, 2026-10-21

Operator clarified that committing never waits on the coordinator. Archived this
log and updated execute-worklog and feature-worklog skills on the isolated
codex/caught-dex-closeout branch. The landing board gates moves to main only.
Validation: git diff --check; archive contains the full prior worklog; changes
are documentation only. Main and its unrelated WORKLOG.md pointer are untouched.

## Landing notification routing correction, 2026-10-21

Operator requested skill instructions requiring this chat's actual session ID
with --codex-thread on every landing-board join, and authorized landing the change.
Updated talk-to-claude and execute-worklog: use CODEX_THREAD_ID, verify the exact
board ID, and repair routing by rejoining without losing position. Titles remain
human labels only. Docs-only validation: git diff --check and scope inspection.
