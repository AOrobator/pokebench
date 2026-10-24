# State-owned interface guidance

## Problem Statement
Control 0517 reached the scripted PokéNav tutorial at turn 1027, opened PokéNav at 1101, then repeatedly pressed B. The native forced-call handler rejects B, while the decoder says B returns. The scientist's delivered instruction falls outside named-character instruction memory.

Authorization: The operator said "okay lets do that as it's own switch thats only on in the bundle. also think about how this can generalize to other screens and custom interfaces we might encounter later in the game" after approving observation delivery without JIT. This approves this concrete implementation; no additional design approval is pending.

## Skills Loaded
feature-switch; feature-explainer; agent-observability; pokebench-game-state; talk-to-claude; execute-worklog; multi-model-review.

## Architecture
`interface-guidance-v1`, default OFF, enabled in current fixed bundle recipes only. Native UI projection supplies truthful mode-specific controls through typed state and ordinary observation text. A small rule-based tool-result decorator recalls only a matching page from a previously delivered tutorial episode, with event/turn/attribution provenance, while that interface owns the current observation. Both delivery and recording use the normal tool path, independent of both JIT switches. Rules qualify actual UI owner, phase, mode and readiness; unsupported interfaces get nothing. First adapter: the forced-call PokéNav tutorial, including its field start menu and post-call exit phase. Generalization adds explicit source-grounded adapters, not inferred walkthroughs. No startup-task, global instruction-retention, navigation, action, timeline or grader changes.

## Invariants
- INV-1 OFF preserves existing tools, prompts, state and text exactly; assert omitted/false defaults and factory behavior.
- INV-2 Native controls follow verified owner/mode; test normal mode, forced ready, post-call, fades, diagnostics and mismatched handlers.
- INV-3 Reminder quotes only previously delivered tutorial instruction with original unknown attribution; no static invented quotation, no future recipients, no stale reminder outside tutorial.
- INV-4 JIT OFF still delivers guidance in tool results; deletion of production wiring must fail factory test.
- INV-5 Control remains OFF; bundle ON; legacy presets default OFF.

## Security Review
Read-only memory and delivered dialogue. No new endpoints, dependencies, filesystem runtime writes, game inputs or RAM writes. No active run changes. Unknown owners stay unknown.

## Milestones
**M1 — Tests and implementation**
- [x] RED tests and commit
- [x] Native controls and delivered-instruction decorator
- [x] Registry, defaults, bundle recipe and explainer wiring
- [ ] GREEN commit; gates and adversarial wiring deletion
**M2 — Proof and review**
- [x] Reparse recorded raw RAM with matching ROM and compare ON/OFF
- [ ] Principles self-review; frozen packet; independent cloud reviews
- [ ] Land on board only with required approvals; verify served state

## Closing the Loop
No gameplay/inference launch. Use archived real snapshots and a production tool factory test. Explainer verified without taking desktop focus. Future benefit evaluation starts at this tutorial checkpoint under a separately approved fixed-run design; test/readiness evidence is not a gameplay-benefit claim.

## Session Log
- 2026-10-24: Isolated managed worktree from main. Reviewed run 0517 seq 39430, 42004, 42533, native mode=1 callback 0x081C9521, source pokeemerald 731ad5bf (clean), ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. Raw sequence 15960 frame 793995 reproduces misleading controls. Existing active run remains pinned and untouched.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] Operator approves archive.

- RED: Python collection fails on missing interface_guidance module; TS factory/retention test fails on missing interface-guidance module. Tests use native PokéNav fixture and delivered dialogue from run 0517.

- RED commit 73644b420. Implementation adds two extension points: native control projection and delivered-page matching. No global retention or startup task changes. Current nine recipes append the switch in bundle-only `switches`, with base false and immutable control bases unchanged.
- Native archived proof: raw sequence 15960, frame 793995, SHA256 f11ddc15e7b258365041a61f4631fed18443c94bd982927b5ac7786c389d9a45. Production read_state and render with the matching ROM change only active_ui.controls and the Interface text. OFF: UP/DOWN selects; A accepts; B returns. ON: UP/DOWN selects; A opens MATCH CALL only; B cannot exit during this tutorial. Other native state equals OFF. Receipt under runs/interface-guidance-proof/native.json in this worktree.
- Verification setup: isolated package links and Python environment, initialized vendor from the existing pinned object reference. Shared environment path restored to canonical; gameplay processes and frozen run sources untouched. Initial viewer tests saw canonical agent imports until per-worktree workspace links were corrected; no application behavior was changed to hide those failures.

- Validation: full coverage passed 4,217 agent tests, 1,812 viewer tests and 4,072 Python tests, zero skips. Agent lines/branches/functions 99.14/92.67/97.51%; viewer 98.04/91.68/95.18%; Python 97.37/93.29/100%. Build, lint (TS + eslint, ruff, mypy) and vendor verification pass. A final equivalent extraction moves completion/transition predicates into each interface rule so future adapters do not inherit PokéNav-specific expiry; focused 8 tests + tsc and five deletion/restoration cases pass afterward.
- Literal `just test` still awaits a coordinated CPU window: full-gate attempts under shared load hit unrelated existing 5s live-human import/all-explainer-render limits or the child-stdout startup deadline. No test timeouts/retries/skips/thresholds changed. Coordinator requested via mailbox; no hold on main.
- Background browser proof: actual candidate viewer against an explicitly synthetic preview, Harness Config -> matching card -> READ EXPLAINER popup. Exact served bytes equal tracked HTML; no page errors; desktop 1280/1440 and phone 375 have no document overflow. Screenshots inspected through image tool without desktop activation. Missing trainer art in the synthetic root is not a trainer-card design change. Explainer local preview returns HTTP 200 at http://127.0.0.1:8791/interface-guidance-v1/interface-guidance-v1.html.
- Five adversarial receipts: removed native factory wiring, tool factory wiring, successful-delivery words check, readiness guard and expiry guard separately. Each intended test failed; each restoration passed. Logs and mutation manifest under runs/interface-guidance-proof, with unique per-case files. No exhaustive mutation claim.
- GREEN code and targeted proof ready for branch commit. Landing remains gated by final literal gate, frozen independent review and normal landing-board order. No source/run activation performed.

- GREEN commit: 20fe3b40f68fef4dcd282a2a32e999c0fbee28f7. Candidate clean; final literal test/coverage window requested from the Codex coordinator (prerequisites have priority). No heavy checks until an explicit grant. Cloud reviews may inspect the frozen packet read-only without running gates.
