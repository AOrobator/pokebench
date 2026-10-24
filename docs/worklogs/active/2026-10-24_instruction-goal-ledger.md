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
