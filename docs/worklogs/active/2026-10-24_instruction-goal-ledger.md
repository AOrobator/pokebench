# Instruction goals and menu option selection

## Authorized outcome
The operator approved the proposed evidence-grounded model-maintained multi-goal ledger, behind a new switch enabled only in bundle, coordination with stale-goal chat, preserved active runs, and recorded PokéNav failure proof. He additionally requested a menu-option selection tool behind its own switch, also bundle-only. No gameplay launches or inputs to measured runs are authorized.

## Frozen scope
One implementation milestone: RED → GREEN → offline replay and production delivery → gates → independent cloud review → serialized local landing. New instruction-goals schema/state/context/tool modules and menu-option-tool module; production play-wiring/play-config seams; feature registry/preset/default/config boilerplate; existing ledger_context event and Activity History/raw event consumers; tests/fixtures/explainers. No new route policy, objective catalog, hidden game facts, trainer-card changes, timeline marks or native matcher duplication. Reuse task-goal-completion.ts from stale-goal owner after its landing.

## Design and invariants
- `instruction-goal-ledger-v1`: delivered whole field dialogue, including unnamed speakers, enters review queue. The playing model interprets it and manages cited goals, parents and active/deferred/blocked/reported-complete/superseded/abandoned states. Native verification stays distinct. Ordinary action tools accept a structured goal_review, with review_goals as a standalone alternative. New delivered dialogue must be accounted for before the next game-changing call; observation/search remain available. Review may explicitly declare dialogue not a request. No goal/action is selected by the harness.
- Persistent event-sourced ledger is pinned before every model decision and reconstructed from history; completion claims retain evidence and rationale. Unknown facts never certify completion, age/arrival/another active goal do not retire anything, and individual goals retain independent lifecycle.
- Replace the extracted destination's authoritative goal wording in ON output; full quotes stay history. Archive tools retrieve exact older dialogue and goal records; bounded headers disclose counts.
- `menu-option-tool-v1`: select_menu_option accepts menu identity and visible option, uses checked ordinary UP/DOWN and A on source-qualified vertical menus; no opening unseen menus, hidden options, wrap guesses, or success claims from a request alone. Stop on changed owner, missing readiness, no cursor movement, interruption or transition. Never select a next menu option automatically.
- OFF prompt/tools/readout are byte-equivalent. Defaults/control false; only bundle recipes true. Menu and goal switches are independently testable.

## Coordination
Stale-goal chat owns task-goal-completion.ts/story-destinations.ts/harness-trust.ts/play-wiring.ts and shared switch/config registration until landing. Our modules remain separate; shared integration follows its landing. No shared CPU gate or viewer restart without coordination. All browser proof headless/background only.

## Evidence and checks
Recorded control 2026-10-24T08-12-35_qwen36-gpu1_0517: seq39430 tutorial dialogue, seq39462 select request, seq39512 BAG, seq39566 PokéNav highlight, seq40378 trainer row. Source pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7. Offline replay may prove input/readout behavior; no gameplay benefit claim.

- [ ] RED tests and commit
- [ ] GREEN implementation with pinned pi model-delivery proof and recorded failure replay
- [ ] OFF and independent switches; atomic invalid-update rejection; stale/missing/wrong-run proof rejection; context compaction/history restore; checked menu input interruption tests
- [ ] ≥90% coverage, lint, build, tests, vendor; operand deletion/restoration receipts
- [ ] Explainers, Activity History/raw event/replay proof on isolated viewer
- [ ] Principles PB1–PB13 and Claude/Grok/GPT review, frozen packet
- [ ] Coordinated landing and live proof, active run identities preserved

## Session log
- 2026-10-24: read rules/worklog and feature/tool-prompt/observability/explainer skills. Created isolated app-managed worktree branch codex/instruction-goal-ledger. User approved both independent bundle-only switches. Sent scope/owner messages to stale-goal chat and Claude coordinator; received TaskGoalCompletion interface and shared-path boundaries.
- RED: two focused suites fail because instruction-goals.ts and menu-option-tool.ts do not exist; receipt /tmp/instruction-goals-red.log. Fixture holds exact event text/state plus per-event hashes and source pin; originals untouched.
- Initial implementation: focused production-shaped suites pass 40 tests; a temporary schema-export test also passed and was removed after regenerating the tracked event schema. New-module coverage: lines 100%, branches 93.91%, functions 100%, statements 98.72%. This is focused coverage, not the full required gates.
- Pinned pi HTTP fixture delivers the exact scientist request and goal_review schema, applies the scripted model's cited goal update before ordinary DOWN,A, and retains the ledger in the second request. This uses a loopback scripted model and simulated post-confirmation state, not live inference or historical PokéNav success.
- Durable bookkeeping lives in optional ledger_context.instruction_goals transactions; existing history/raw event paths carry it, no new timeline marks. Native task completion uses the stale-goal owner's structural interface; import integration awaits safe dependency merge.
- Stale-goal owner approved isolated dependency merge of prepared head 6f6f69aa545a447332a4705d946285517097cc91. Its final gates/review/landing remain pending. We must re-sync its final landed head before our review.
- Found decision-probe's derived-event filter would erase goal transactions. Its existing projection seam now retains those transactions only under our switch, and its tool schema includes inline review fields. No probes launched.
- Shared CPU slots are externally queued; no full gate/build/viewer restart begun. Small focused tests and no-emit type checks remain local preparation.
- Prepared GREEN commit cd69dc462 follows RED adb1ba126. Before dependency integration, a no-emit typecheck found two test-only type issues (optional walking field and event-union narrowing); both corrected without changing runtime behavior.
- Merged prepared stale-goal dependency 6f6f69aa545a447332a4705d946285517097cc91 into this isolated branch. Kept all of its native matchers/production behavior and main fixes intact; resolved additive registration/context seams. contextTools now passes a real TaskGoalCompletion into InstructionGoals; no copied native rules.
- Both new switches are false in default/control base and appended to bundle switches in the same five canonical recipes authorized for the stale-goal treatment. Historical pinned recipes and active loop configs are untouched.
- Shared native-proof factory test now passes against the stale-goal owner's exact Norman fixture: first-gym goal transitions to native_verified after delivered state/result34806/34807, while source page3's four-badge goal remains deferred.
- Operand deletion/restoration receipts in runs/instruction-goal-proof: context-wiring, checked-menu-owner, native-completion, durable-review-replay each failed after deletion and passed restored. No failed receipt overwritten. Registration/prompt subset passed164 tests. Agent no-emit typecheck passed after fixture-only fixes.
- Appended two switches; adjusted only literal registry positions/counts in older tests and disabled both in the shared legacy-feature test owner. Protected trainer-card assertions/baselines untouched.

## Problem Statement
The recorded 0517 model acknowledged “Please select the POKéNAV” while repeatedly choosing an escape plan. Place extraction still foregrounded an obsolete Norman instruction. Goals need explicit model-owned interpretation and lifecycle, and menu execution needs a separately switchable visible-option tool.

## Skills Loaded
feature-switch, tool-prompt-sync, agent-observability, feature-explainer, viewer-e2e, talk-to-claude, execute-worklog, close-the-loop, canonical multi-model-review. Earlier forensics/game-state work was read-only; current implementation is explicitly authorized.

## Architecture
Existing contextTools/playGameTools factories share one InstructionGoals instance. Dialogue/source and review transactions reconstruct from existing typed events; the new optional ledger_context field is schema-validated. Recorded observation IDs are supplied for completion citations. The shared native TaskGoalCompletion is injected, never duplicated. Menu selection drives ordinary checked input. Decision-probe projection preserves actual review transactions and exposes the same schemas without executing tools.

## Invariants
- INV-1 OFF restores original prompt/tools/readout/input; new flags default/control false. Exact OFF factory/context tests plus unchanged legacy baselines.
- INV-2 model chooses goals and menu choices; no catalog/route/new matcher. Named/unnamed exact quotes and source attribution preserved.
- INV-3 completion reports need newer delivered observation evidence; verified native completion uses the shared owner and remains independently labelled. Mixed future instructions stay unfinished.
- INV-4 invalid reviews commit nothing; persistence failures commit neither memory nor game input. Review transactions precede input, survive compaction and history reconstruction.
- INV-5 menu inputs revalidate identity/readiness/cursor before each press, verify adjacent movement, A once and stop. Interrupted states never receive a confirmation.
- INV-6 active runs, original recordings, frozen checkouts, live controllers and GPU routes untouched. All browser proof headless, no focus changes.

## Security Review
Boundary JSON uses TypeBox; unknown/foreign evidence rejected. No subprocess shell interpolation in production, new dependency, remote service, save write, RAM write or story catalog. New model bookkeeping is untrusted interpretation, not grading evidence. Durable storage errors propagate and stop input rather than masquerading as invalid model requests.

## Milestones
M1 is the single approved implementation milestone. RED adb1ba126, prepared GREEN cd69dc462, dependency merge 3b580f47e. Focused runtime/native proof passes; full gates/review/landing remain unchecked above.

## Closing the Loop
- Source archive reparse receipts in runs/instruction-goal-proof/recorded-ram.json verify original hashes and exact BAG index2 / trainer-row index4. Original source files untouched.
- Headless explainer screenshots at1280/1440/375 inspected for both pages; document widths equal viewport widths, no console errors. Mobile diagrams scroll within their cards. Card click-through and Activity History/raw event checks await built isolated viewer.
- Four performed guard mutation receipts failed when deleted and passed restored; snapshots remain under runs/instruction-goal-proof.
- Added a fifth correctness check: storage failure before transaction append leaves the ledger and game unchanged. Completion observation IDs now appear in decision headers.
- Latest focused coverage:100% lines,92.91% branches,100% functions; full gates still pending CPU admission. Shared gate thresholds/exclusions unchanged.

## Surprises
The existing probe projection drops derived ledger_context events; transactions must be retained while display-only context is regenerated. The existing place-trust prompt also incorrectly describes the extracted goal as the latest instruction; the new switch replaces that sentence and disables its destination-away supervisor without affecting OFF.

## Multi-Model Review Log
Not started. Must sync final landed dependency/main and pass gates before freezing.

## Boy Scout Log
None. Existing positional registry tests shift by exactly two new switches; no unrelated assertions removed.

## Archive Milestone
- [ ] ASK USER: archive this worklog after completion

## Authorization provenance
Goal ledger+bundle authorization: user message 00000000-0000-4000-8000-17d58bbbe5bf. Menu tool:00000000-0000-4000-8000-c1d4f512d5e5. Separate menu switch+bundle ON:00000000-0000-4000-8000-24dc9f0e7cc0. Original human messages remain visible in chat 00000000-0000-4000-8000-1297530e0d96.
