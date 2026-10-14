# State-driven decisions experiment

## Problem Statement
The operator explicitly authorized this side conversation to update the worklog, implement state-only decisions and run them, then add/run last-transition feedback, then add/run verified memory. Main chat owns higher-priority named-interaction work and gameplay access. Each decision gets a fresh coherent screenshot + structured/readable game state; no model-selected observe tool, no conversation history. Selective historical observations are independently flagged.

## Skills Loaded
Feature-worklog, agent-observability, pokebench-patch-evaluation; game-state reference for coherent observation contracts. Main chat coordination requested via send_message_to_thread. No subagents permitted in this side conversation. Local models reserved for gameplay, never review.

## Architecture
Separate state-decision engine calls existing observation owner before each model decision, uses pinned pi transport with one fresh user snapshot, accepts exactly one validated action (buttons or host-time wait), and executes through existing recorded press owner. Retain budgets/operator controls/native milestones/recording/loop diagnostics. Three independent flags: state-only-decisions-v1; last-transition-feedback-v1 requires state mode; verified-observation-memory-v1 requires state mode. OFF remains incumbent behavior. No environment/ROM writes or navigation solver.

## Invariants
- INV-S1 Fresh one-snapshot decision context, no earlier assistant/tool history or observe tool. Tests stale/history deletion and exact transport payload.
- INV-S2 Strict one-action response, legal buttons and bounded frame timings; wait requests an explicit bounded host-time delay; no guaranteed emulator-frame advancement. Invalid responses never execute an action. Tests malformed types/multiple actions/abort.
- INV-S3 Native evidence/state recording remain owner-produced; pause/stop/budgets prevent model requests or actions after terminal state.
- INV-S4 Last transition and verified memory remain independent, bounded and provenance-linked; never preserve speculative model claims. Mutation tests prove omitted/replaced payloads fail.
- INV-S5 Main chat priority: isolated worktree; shared source integration and serial gameplay only after coordinator clears ownership/lease. Do not stop/reconfigure its services, mutate its artifacts or land across active measured builds.

## Security Review
No arbitrary model code, filesystem operations, RAM writes or gameplay rescue. External ROM remains outside git. Typed JSON boundaries, argv-only subprocesses, exact run-scoped receipts; no local model review calls.

## Milestones
- [ ] M1 RED engine contract -> state-only engine -> gates and reviewed integration -> run/report before M2.
- [ ] M2 RED last-transition contract -> flag/context -> gates and reviewed integration -> run/report before M3.
- [ ] M3 RED verified-memory contract -> bounded native memory -> gates and reviewed integration -> run/report.

## Closing the Loop
Predeclare exploratory run and comparison protocol with coordinator before launch. Proposed Think Fast, fresh boot, no milestone cutoff (target:null), equal30-minute/1500-turn/medium4096/retry3, objectivesOFF; named-interaction setting identical to main's frozen build. Each stage gets an initial recorded exploratory run. Any benefit claim requires four-per-arm counterbalanced comparison and no automatic promotion. Do not expand exploratory request into unbounded trials. Model outcome versus harness/infrastructure failures remain distinct; zero completion regression tolerated, successful median10% improvement threshold for later comparison. Full prompts/flags/source/build/model/ROM/start identities retained.

## Session Log
2026-10-13 user authorized staged implementation and gameplay. Sent exact scope/ownership request to main chat 00000000-0000-4000-8000-37545a12fb13; it has priority. Created isolated state-decisions worktree basedf67a147. Registration failed for side-conversation thread but filesystem checkout exists; reuse returned path, never create duplicate. Work restricted initially to new state-decision modules/tests; integration awaits coordinator. No experiment launched here.

## Surprises
Side conversation is absent from normal thread listing; tool returned existing created worktree with registration error. Main may not be able to message this side thread directly; durable worklog is coordination fallback.

## Multi-Model Review Log
Pending; external reviewers only, no subagents here.

## Boy Scout Log
No unrelated cleanup; UI and named interactions remain main-owned.

## Archive Milestone
- [ ] ASK USER: archive worklog after completion.

M1 RED: 12 semantic tests fail at not-implemented engine. Initial import failure retained separately, corrected fixture import/model declaration; semantic-red.log is the actual behavior RED receipt.

M1 checkpoint: RED commit825f0db. New engine/test modules only; no shared source changed. Eighteen pinned-pi contract tests now pass. Full agent coverage passes statements98.06/branches93.47/functions98.20/lines98.87, lint and recursive build pass. Five independent deleted operands (raw types, one action, fresh snapshot, input recording, truncated-response rejection) each fail targeted assertions; restored18 GREEN in runs/state-decisions-proof/mutations. Initial failed test/import/lint attempts retained. Production observation/action/recording integration, flag wiring, external review and live proof remain pending main-owned file release. This is not a playable build yet.

Main coordinator replied: named-interactions feature/schema/files reserved through its freeze/landing; Think Fast gameplay reserved through eight clock trials. Side engine modules permitted; no gameplay or local review calls until slot release. Last-transition/memory work remains deferred until M1 actually runs. Need explicitly account for loop-warning feedback in state-only mode: passive diagnostics stay; either preserve independently flagged current warning delivery or turn the intervention OFF explicitly and qualify equal comparison settings. No silently enabled but undelivered recovery warning.

Checkpointfd83b46 recorded independent engine. Subsequent stop/transport checks bring focused tests to20. Final model-gate transport deletion failed its assertion and source restoration passed20. The action wire schema has object-root parameters for OpenAI compatibility while strict raw discriminated-union validation rejects coercions/mixed variants. Model errors are bounded by Governor and start fresh each retry. All source remains new engine/test modules; no flags/shared live path edited. M1 engine is prepared, not integrated/reviewed/landed/live-qualified. Waiting coordinator freeze and gameplay slot; do not claim the user-requested stages complete.

2026-10-13 main coordinator update: named-interactions landed main059cc7c, but cohort stopped after trial3 following invalid nativeCLOCK_SET in trial1 during field_transition (seq3163 stable1F intro5clockfalse ->3165 transientmap0/0intro0clocktrue ->3171 stable2Fintro5clockfalse). Main owns reader/native-grading repair. Physical gameplay lease is free but measured milestone runs are withheld until qualified repaired build. Trial2 consistent clock completion, trial3 censoredoperatorabort,4–8withheld; preserve all original/correction evidence. Fresh-context tests do not establish snapshot/native evidence correctness. Verified-memory stage must never persist unqualified transitional save-owned facts. User discussion about active_ui union, typed controls/clock, diagnostic separation and local-map ablation remains a proposal, not implementation authorization for restructuring historical event schema.

2026-10-13 main transition repair landed67e0c963; bringing isolated engine checkout onto repaired build. Named-interaction full no-target eight-trial cohort owns gameplay slot; state exploratory stages target:null, no milestone stop, passive native grading. No gameplay launched here.

2026-10-13 root extended gameplay reservation: named8 then navigation16 (baseline/topology/A*/combined). No automatic launch when lease disappears; wait explicit release. New state-decision-wire.test exercises actual pinned provider HTTP conversion against a test-owned loopback SSE gateway (no inference endpoint called): two fresh system+user requests, exact act/object-root schema, current image/text, no earlier reasoning/results/snapshot.21 focused tests across engine/wire; lint passes. Actual RAM observation/action/decision-input persistence, feature integration and gameplay remain pending; don't equate transport proof with live gameplay.

Adapter RED: nine semantic tests fail before implementation. Tests coherent snapshot delegation, existing press hooks/timing, explicit WAIT order/payload, strict types, abort/rejected action. Shared files remain main/navigation-owned.

Adapter RED commit7003d9a, then existing observe/press owner integration in new state-decision-adapter.ts.12 adapter tests pass: coherent response validates through existing owner, presses retain ordinary10/8 timing/hooks, WAIT60 sends nativeWAIT opcode/60hold/0release, drains queue, settles then checks native state; no invented button_press for wait. Four actual adapter mutations fail and restore. No live RAM/model/game calls; fixture evidence only. Snapshot persistence hook is still caller-owned and needs shared recorder/event wiring after navigation lands; no claim of fully observable playable engine. Remaining flag/live/persistence/viewer integration and independent reviews block live readiness, separate from reserved gameplay slot.

2026-10-13 navigation main3611aa89 frozen256bf234 landed; merged committed main only into this isolated checkout. Canonical human-playthrough/transition WIP untouched. Shared source integration is now authorized by coordinator; gameplay still reserved. M1 smallest production path: state-decision engine/adapters, additive state-only flag/preset normalization and live branch, recorder decision_input (exact state_seq/frame/readout with next-decision index) and wait_input events, schema, existing viewer frame/timeline/history folding. Historical schema unchanged; no active_ui redesign. Require objective/loop interventions and bounded-navigation OFF for M1 to avoid undelivered warnings/hidden history or silently ignoring a declared helper; passive loop diagnostics remain. These compatibility checks are explicit, no automatic feature override. Stages2/3 flags arrive only after prior stage runs.

Recording RED: two selected recorder tests fail at deliberate not-implemented methods; unrelated tests not selected by focusedfilter, no testdisabled. Input event must pair exactstate_seq with savedframe/readout and decision_turn1 while native state0 reflects before first decision. Wait event records emulatorframes, neverfakebuttons.

Runtime RED: compatibility/prompt/legacy flag tests fail before wiring. State-only is a declared composite: automatic observation, history reset, single act schema and explicitWAIT availability; no claim that history removal alone caused a later result.

Viewer event test RED then GREEN proves schema parsing -> frame selection/replay cursor -> mounted history/raw inspector/timeline; off-window inputs retained inhistory. Passive detector RED reveals act tool results were not classified as game actions despite actual button_press records. Normalize successful act/press to existingpress completion, act/wait to no-button observation completion for passive diagnostics; never rewrite original tool events or fabricate presses. This is part of preserving existing measurement across the declared state-mode composite.

M1 integrated source checkpoint ready for review, not landed/live-qualified.731 agent and238 viewer tests pass, lint/recursive build pass, all independent coverage floors pass (agent branches93.14/functions98.37/lines98.87; viewer91.89/96.94/98.42). Python/env source and dependency pins unchanged from reviewed navigation base; inherited Python qualification is not a new native-state-mode proof. All failed intermediate receipts retained. Six integration mutation tests each fail intended assertion and restore, in addition to earlier engine/adapter mutations.

Freshness: snapshot is captured after model pause gate, with a pause-duration epoch recheck during async observation; changed epoch rereads instead of reusing stale input. Snapshot budget abort preserves governor terminal reason; real snapshot failure remains an error. Raw registeredact JSONnull from pinned provider is preserved through narrowact-only raw-args telemetry variant, rejected before execution and ends boundedmodel_error after3, with zero action requests; ordinary tool argument schema/behavior unchanged.

Explicit compatible settings: objectives/repeat/native-objective enforcement OFF, loop intervention OFF (passive diagnostics retained), bounded-navigation OFF, legacy press-result feedback OFF because it is not delivered into a fresh next-turn context. State-only is an explicitly composite intervention (automatic fresh observation, oneact action schema includingWAIT, fresh context and prompt). For later controlled benefit claims use equal common OFF settings in botharms, not old incompatible runs. Current request authorizes one exploratory run at each sequential stage; no four-per-arm expansion silently scheduled. Each exploratory run target:null,30m1500turns, medium4096,retry3. Last-transition/verified-memory implementation deferred until previous stage actually runs.

Remaining M1 blockers: frozen independent review and principles synthesis, landing coordinated with main, viewer served schema/modules update, native production entrypoint/frame/RAM/prompt qualification and exploratory gameplay after explicit root release. HTTP fixture tests prove actual pinned transport + existing observation/press/wait/recording seams only; they do not boot a ROM, use a real model, verify new live serving bytes or establish gameplay benefit. Main owns named8 + navigation16 reservation; no automatic launch on lock disappearance. Conditional UI redesign/map ablation remain proposals, excluded from this patch.

## R1 review and R2 correction
Root independent Sol/Astra R1 BLOCKING; PB4/PB7/PB11 self-review invalidated, not waived. Exact pinned bbab97 vendor WAIT forceshold0, ignoresrequestedhold, and clearscurrent_action onlyinsidepositivehold completion; release-only change cannotrepairit. Initial HTTPfixturequeue_empty:true falsely masked production semantics. R1 source9eff58c, packet, failedreceipts retained; no game/native/model calls made here.

Accepted subtraction within original TS domain (root confirmed): no vendorWAIT requests at all. Wait action now {kind:wait,duration_ms:1..2000}, abortable hosttimer then fresh snapshot/nativecheck. It guarantees requested hostdelay only, not emulatorframe progression; all prompt/schema/event/history/timeline/terminal units corrected. Env/vendor remain unchanged; no new nativeaction owner. Earlier frame-count claims in session entries and mutation receipts are superseded/unqualified.

Consumer proof strengthened through actual mountedApp and production event stream ingress: exactWAITrow independentlyasserted in ActivityHistory; selectedinput/WAIT rawinspector verified; actualframehref, timeline markers, replay cursor and off-window retention asserted. Detached helper now scopes WAIT assertion to its exacthistoryrow, eliminatingSVGtitle fallback. Schema-valid recordedact/wait sequence with no fakebuttonpress covers passiveobservation interpretation. Six R2 independent deletions (timer, WAIThistory, WAITtimeline, frameingress, selectedWAITinspector, passivewaitbranch) mustfail andrestore; no native gameplay qualification implied.

R2 review packet must reference r2-build-final-pass.log (passing), retaining old failedbuildreceipt. Principles PB4/PB7/PB11 rescored onlyagainst correctedhost-time scope and performedconsumer/branch proof. Nativequalification/gameplay stillwait rootreservednav16 release; M2/M3 deferred.

R2 GREEN:732 agent239 viewer tests, lint/recursivebuild and independent90floors pass. Agent branches93.25/functions98.37/lines98.87; viewer91.89/96.94/98.42. Actualtimerabort and zeroNativeWAIT/action assertions pass; mountedApp exacthistory/selectedinspector/frameingress plus passivewaitsequence mutations allfail/restore. Receipts r2-coverage-final.log/r2-lint-final.log/r2-build-final-pass.log and r2-mutations/index.json. R2 scope correction hosttime wait explicitly supersedes failed R1 emulator-frame claims; independentreview/landing/live proof stillpending.
