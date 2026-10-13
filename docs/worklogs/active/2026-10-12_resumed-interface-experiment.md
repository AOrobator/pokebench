# Resumed contextual-interface experiment

## Problem Statement
User said "ok lets resume the runs" after the reviewed objective type/error fix landed. Restart the approved three-per-arm/model experiment as a fresh matched cohort on current harness. The previous two launched trials remain separate: source changed and one was operator-aborted. Do not pool them into the new12-run comparison.

## Skills Loaded
Previously loaded feature-worklog and multi-model-review govern provenance and existing reviewed runtime. This resumption changes no production code or prompt.

## Architecture
Use normal agent play CLI, fresh boot,300turn/30minute cap, objectives enabled. Six paired waves; one run per endpoint. Qwen baseline/treatment/treatment/baseline/baseline/treatment; Swarm treatment/baseline/baseline/treatment/treatment/baseline. Only contextual-interface-docs-v1 differs between arms. Registered model identities discovered from existing local Qwen endpoint and gateway. One-shot supervisor and manifest are ignored operator receipts.

## Invariants
- INV-1: every trial shares one clean frozen current harness revision, budgets/tools/sampling/start. Validate actual run_start and retain prompts.
- INV-2: one active run/model endpoint, isolated game server/run folder; no gameplay intervention or silent retry.
- INV-3: every launched run visible live and retained with terminal reason, including failures; stopped prior cohort untouched and separate.
- INV-4: report N3perarm only if actually launched; median/range/DNF alongside counts, no statistical significance or inferred gym progress.

## Security Review
Normal argv launcher, configured external ROM reference and symlink only. Credentials read privately from existing endpoint config, never in argv/log. No runtime/preset/permission change or RAM writes.

## Milestones
**M1 — Resume current matched cohort**
- [x] Operator approval and worklog before launch
- [x] Current reviewed production build,897gates/selected-roster LGTM retained
- [x] Discover endpoints, launch12normaltrials and verify viewer/live provenance
- [x] Validate terminal logs, report observed results and reconcile worklog

## Closing the Loop
Tracked worklog and source freeze before launches. During runs update ignored runs/launch-receipts/interface-docs-resumed/progress.md and observer-notes.md so later trials stay clean and samecommit. Reconcile here after terminal outcomes. User instruction authorizes12plannedtrials under previously approved protocol. No new naming skill/navigation/retry policy.

## Session Log
2026-10-12: both requested registered models available;8061/8062free, viewer8791listening. Qwen auto-unloaded; existing supervisor warms registered model before measured start and records warmup separately. Reviewed productionf63d7a5, closeoutc4e3cdb. Newcohort required after NEW_GAME_CREATED and type/error fixes; old5d0f/0893 remain original failed/aborted observations, not current controls.

## Surprises
All12trials reached30minute budget; no starters or gyms. Qwen clock2/3baseline versus1/3treatment; Swarm truck1/3baseline versus2/3treatment, clock0botharms. Swarm metadata loop95calls was initially misread as one long inference because state turn40 remained stale while agentadvanced136; correction retained. Post-name confirmation cancellation, weak objectivecondition and misidentifiedstairs are separate evidence-backed failure classes. Viewer8791process vanished; exactcauseunknown, detachedrecoveryverified200. Usercurrentlyviews separate8793viewer-game-stream preview; preserve its uncommittedchanges for coordinatedreview/landing.

## Multi-Model Review Log
No production/prompt changes in resumption. Reuse reviewedf63d7a5, allfive selectedLGTM with documented Claude availability fallback;897tests/gates in objective-types-review. New documentation/one-shot scheduling receipts do not add model-visible helpers.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER: archive worklog after closeout.

2026-10-12 CLOSEOUT: actualmanifestcomplete at20:03Eastern,12ended/unique start+end/type-validated logs. Source40262a0 clean and allwithin-model metadata signatures unchanged. No intervention/rerun; rawcohortretained. Findings docs/findings/2026-10-12_resumed-interface-experiment.md and ignoredmanifest/analysis/promptcaptures. Userauthorized threeparallel fixes: deterministicloopguards (loop_detection), activeconfirmation/unknownstate diagnostics+repo skill (confirmation_state), nativeobjectivecompletion (native_completion). Eachisolatedworklog createdbeforeimplementation; rootcoordinatesreviewed integration. Objectlabels/navigation and roundtripoptimization remaindiscussiononly. Bothmodels selectedfor exploratorypost-integrationrun, not another12trialcohort.

COMMIT: `docs(experiment): report twelve matched prompt trials` (`16c8939`), doc-only trackedcloseout; typed12terminalchecks anddiffcheck passed.


## Side-conversation design proposal — harness-owned milestones (2026-10-12)

Status: requested plan documentation only. No production, prompt, viewer, benchmark or landing changes authorized by this side-conversation entry. This supplements existing implementation worklogs; it does not replace them or claim their work complete.

### Hypothesis and architecture
The harness owns the next required objective and its completion predicate; the model chooses how to achieve it. Determine the next eligible milestone from game-owned facts and an explicit prerequisite graph, including branches and already-satisfied prerequisites, rather than a flat next-unchecked list. Each milestone has a stable ID, clear display name, concise immediate objective and game-owned done description/evidence. Model-chosen easier conditions or model claims cannot advance the trusted objective frontier. Keep provisional local plans distinct from verified completion.

Separate three context layers: (1) a short permanent prompt with overall goal, evidence/tool rules and contextual controls; (2) the current harness-owned milestone objective and trusted completion facts; (3) automatically selected, versioned interface/place documentation. Select documentation from verified active interface/phase, not milestone alone: a name objective spans keyboard, transitions and YES/NO confirmation. Replace irrelevant interface documentation as the interface changes; do not append an ever-growing walkthrough. Retain the overarching objective through those phase changes.

Interface documentation explains mechanics, readiness, selected control, entered values, available tools and observable map/warps/interactable objects. It does not prescribe a solving route or button sequence. Place descriptions and target labels must reflect qualified game state and visible/grounded object identity. Unsupported ownership/readiness is a logged harness coverage bug or unavailable fact, never invented world state. Known transitions must be explicitly distinguished from unrecognized screens. Repair workflow belongs to development and must not mutate a measured run's harness silently.

### Avoiding reversals and unnecessary planning — discussion, not implemented
Distinguish draft, submitted/pending confirmation and game-accepted state. Entering a name or closing the editor is not yet accepted completion. Maintain a concise game-grounded phase/last-result reminder, especially around confirmation: B may cancel rather than advance. Favor bounded execution of an evidence-supported action when controls are ready; if selection/readiness is uncertain, observe first. Do not globally bias toward arbitrary buttons or ban B across interfaces. Expected-versus-observed outcome feedback can identify that an attempted advance returned to an earlier phase; new event IDs or objective wording are not evidence of recovery. Proposed prompt wording and recovery mechanics require a separate implementation decision.

### Deterministic speedrun diagnostics proposed for the viewer
Use recorded native events, state snapshots and tool timing as the live source of truth. Exact metrics: milestone arrival/splits and completion counts/DNF; turns, submitted/executed press-call counts and tool mix; tool/model-response intervals, tokens and error/retry counts; time since last interaction/observation/verified milestone. Keep model-response intervals distinct from pure inference/decode time. Derive naming entries/submissions/cancels/reentries only when qualified phase/owner transitions establish them; otherwise mark unavailable or inferred. Record repeated-state/action/cycle and stall episodes with detector policy, evidence sequences, warning/recovery/stop and confidence/coverage limits. Detector flags and state-changing-action ratios are deterministic proxies, not proof that time was wasted or an action was useful.

Viewer proposal: immediate objective with native done description and verification evidence; per-milestone time/turn/token breakdown; measured action/observation/planning/error totals and flagged episode durations; links from cancellations/cycles/readout gaps to exact events/frames; baseline/best comparisons restricted to declared compatible cohorts with missing splits explicit. Do not collapse all diagnostics into an opaque efficiency score. Denominators must show eligible versus unknown/unobservable cases.

LLM judgment, if used, runs after the fact as a separately labeled annotation: whether backtracking was justified, an action advanced a sensible strategy, a target was misidentified despite adequate evidence, or a different action was likely better. It must cite recorded evidence, keep model/harness/infrastructure attribution separate, disclose uncertainty and never override native milestones or affect the measured agent retrospectively.

### Evaluation and next decisions
Test the harness-owned-objective/interface-documentation hypothesis against the current design on the same qualified readouts, loop policy, start, sampling, tool set and budgets. Record objective-policy/documentation versions and all harness advantages. Compare repeated runs per arm including failures, milestone splits, naming cancellations/restarts, planning-only episodes, interaction cycles and turn/token cost. Names/branch choices and incomplete readout coverage remain covariates; do not infer causality from a single run. Existing 12-run cohort is separate and does not establish benefit of this unimplemented policy.

Open design decisions: milestone prerequisite/branch contract; which interface documents and observable target identities are qualified; bounded context replacement and retained facts; exact versus inferred cancellation metrics; detector thresholds and coverage; viewer layout and comparison compatibility. Object interaction/navigation changes and model-turn optimization remain discussion-first.


## Side-conversation follow-up — individual-fix hill climbing (2026-10-12)

Status: operator requested worklog updates and discussion of a measurement skill. This entry documents the plan; it creates no skill, feature flags, implementation, runs or commits, and does not alter ongoing implementation work.

### Proposed fixes to prevent undoing work
Expose a qualified lifecycle for editable tasks: draft/entered, submitted/pending confirmation, accepted by game-owned evidence. Include active confirmation phase, selected option, readiness and contextual confirm/cancel semantics in the observation. Keep a concise native last-result reminder so a cancellation or return to an earlier phase is explicit. Do not equate entering text or closing an editor with accepted success. Do not globally ban B or classify legitimate cancellation/backtracking as a mistake. Expected-versus-observed phase feedback should identify reversals only when active ownership/readout is reliable; otherwise record a coverage gap. Measure cancellations/restarts and completion splits before claiming the fix improves speed.

### Proposed bounded action bias
Candidate prompt instruction: when the interface is ready and the next action is supported by observed evidence, execute a small action; if selection/readiness is uncertain, observe first; replan when new evidence requires it; cancellation should be intentional. This is bias toward evidence-supported execution, not blind button presses. Harness-owned objectives should reduce unnecessary objective-editing calls. Treat action-bias text and objective-policy changes as separate experimental factors; action feedback injected into model context is an intervention, not passive diagnostics.

### Speedrun diagnostics remain available across arms
Passive recording, native milestone grading, timing/token/tool counts, state coverage diagnostics, viewer metrics and post-run annotation are common measurement infrastructure, not a with/without-diagnostics experimental arm. Derive metrics from existing recorded events where possible; do not add emulator reads, model calls or feedback to measured gameplay solely for operator diagnostics. Track overhead if new instrumentation is required and hold instrumentation versions constant within comparisons. Loop detection flags may be logged passively, while warnings, action restrictions and termination are separately declared/flagged interventions.

Live deterministic measurements: native milestones/splits and DNF; turns, presses/tool mix, tokens, response/tool intervals; qualified naming submissions/cancellations/reentries; no-interaction/observation intervals and detector-flagged episodes with evidence and policy version; unknown/readout coverage counts. These do not establish strategic usefulness or wasted time automatically. Post-run LLM judgment is separately labeled and cannot alter progress grading, agent inputs or completed run outcomes. Viewer comparisons must expose denominators, missing/unknown cases, policy vectors, evidence links and compatible baseline/best cohorts.

### Proposed skill: pokebench-fix-evaluation (discussion only)
Purpose: every behavior-changing fix carries a hypothesis and an individual measured comparison before it is described as a speed improvement or promoted into the best-known configuration. A skill cannot enforce this by prose alone; propose a typed experiment manifest, flag/dependency validation and result checks as the executable counterpart.

1. Register a stable fix ID/version, hypothesis, expected failure mechanism, targeted native milestone, primary completion/speed criterion, secondary diagnostics, dependencies and rollback policy before trials. Distinguish correctness qualification from measured model benefit.
2. Keep a frozen incumbent reference configuration. Prefer baseline/candidate on the same reviewed executable with exactly one fix flag differing. Record the complete effective flag vector, commit/build identity, prompt/skill hashes, model/artifact/endpoint identity, sampling, start/ROM/vendor, budgets and instrumentation version in run_start. Reject invalid dependencies or unexpected flag differences rather than enabling hidden changes. Feature flags govern model-visible readouts/guidance/policies; do not disable ROM isolation, truthful native grading, type validation or evidence integrity for an ablation.
3. Evaluate one factor at a time on top of the incumbent. If a change necessarily combines behavior, label it a composite and explain why; do not claim individual attribution. Multiple detectors should have individual intervention switches where practical, with common passive diagnostics. A flag for action bias is distinct from phase readout, harness-owned objectives and contextual-documentation flags.
4. Start with an explicitly exploratory paired check to catch obvious failures, then repeated counterbalanced fresh-start trials (at least three per arm/model for this project's promotion comparisons). Keep endpoint contention, resource configuration, budgets and gameplay intervention controlled. Predeclare number/order/stop rules; retain all launched outcomes and infrastructure failures separately. Do not rerun until a desired result appears or promote from a single lucky trial.
5. Assess completion rate jointly with time-to-target milestone, per-segment times, turns and token cost. Show median/spread only alongside reached/total and censored runs. An early loop stop is a bounded failure, not a faster speedrun. A missing split is not zero; a milestone flagged present_at_start is not earned traversal. Use overall later milestones as regression checks so faster naming does not hide slower clock/starter progress.
6. Classify improve/regress/inconclusive against predeclared meaningful margins and completion tolerance, not an automatic statistical-confidence claim from N3. On inconclusive data, retain the incumbent or run a predeclared additional batch rather than silently promote. Candidate improvements need a fresh confirmation batch or held-out repetitions to reduce selection bias from repeated hill climbing. Keep model-specific effects separate; do not average a regression away across models.
7. Save receipts/report and a regression ledger: fix ID, compared configurations, hypothesis, target outcome, DNF, time distributions, side effects and proposed promotion/rollback decision. Preserve a reproducible incumbent and old runs. Stable native split definitions and common passive diagnostics support longitudinal comparison; do not choose the single luckiest historical run as the experimental control.

Open skill-design decisions for discussion: acceptable regression/completion margins; which milestones define early screening versus promotion; trial budget for inconclusive results; whether best-known configurations are model-specific; checkpoint starts for segment diagnosis versus mandatory fresh-start end-to-end qualification. Implementation and skill creation remain a separate decision.


## Operator decision — patch evaluation skill (2026-10-12)

Use **patch**, not fix, for an unevaluated behavioral change. A patch is not an improvement until comparison supports that claim. Operator approves completion-first regression logic and changes the prospective comparison protocol to **four runs per arm per model**. This supersedes the earlier three-per-arm skill proposal; the completed historical twelve-run experiment remains three-per-arm and is not relabeled.

For early milestones, predeclare the target and equal maximum budgets in both arms, stop when the game-owned target is verified, and retain failures/censored runs. Extend the target incrementally (game creation, accepted name, truck exit, clock, starter, later milestones), with downstream checks before broader promotion. A configuration validated only through naming is not best-known through the starter or gym. Saved checkpoints can diagnose a later segment if identical/provenance-verified across arms, but cannot replace end-to-end validation through the claimed frontier.

Track a reproducible, model/environment-specific best-known configuration: named immutable configuration revision, complete effective feature-flag vector and dependencies, compatible build/source/ROM/start/sampling/budget/instrumentation identities, validated milestone frontier, evidence runs, completion/time distributions, and promotion/regression history. Restoring it must resolve the full flag vector (including explicit OFF values), not rely on changing defaults. A single lucky run is not the incumbent. Confirm candidate winners on fresh predeclared comparisons before promotion; on regression or inconclusive data keep the incumbent.

Behavior-changing patches should be independently switchable when feasible. Initial calibration may need retroactive flags to reproduce the current reference behavior; validate both branches and record effective settings. Dependencies/conflicting flags must be checked explicitly, and an invalid combination must fail before launch rather than silently enable another patch. A flag cannot recreate deleted code: record the compatible executable/version needed for a preset. Passive diagnostics and native grading remain common to both arms; warnings/context changes/action restrictions/early loop stops are interventions. Flagging model-facing readouts for comparison never weakens truthful native grading, ROM isolation, input validation or evidence integrity.

Created repository skill `.claude/skills/pokebench-patch-evaluation/SKILL.md`, discoverable through `.agents/skills/pokebench-patch-evaluation`. This side-conversation change is limited to the skill and worklog. It does not add runtime flags, configuration resolver, early-stop implementation or launch trials; those remain coordinated harness implementation work.

Skill validation: skill-creator quick_validate passed; git diff --check passed; Codex discovery symlink and both referenced repository skills resolve. No runtime implementation or trials performed by this side-conversation update.


## Operator request — reporting and implementation handoff (2026-10-12)

Operator asks to land the patch-evaluation skill/worklog, then assign individually owned, reviewed behavioral patches with explicit flags and a four-per-arm test plan. Reporting belongs in the patch-evaluation skill: compare against the incumbent, explain measured wins/failures, recommend keep/discard/improve (or inconclusive), and track actual preset promotion/rollback separately from advice. Added that reporting contract to the skill, including plain harness-bug attribution, authorized repair/test/review and qualified re-evaluation. Wrong harness observation/grading is not model inability. Preserve original/affected/superseding cohorts; common harness repairs require compatible fresh controls, while recoverable analysis-only errors can be corrected from immutable evidence. No silent replacement runs or mid-run source edits.

Proposed ownership queue for the main coordinator (reuse existing owners rather than duplicate work):
- Land the skill/discovery link/worklog documentation with required review/gates, preserving unrelated edits.
- Registry of independently switchable behavioral patches, retroactive reference flags where needed, immutable incumbent presets and dependency/identity validation.
- Harness-owned next-milestone/prerequisite policy and native completion, coordinated with the existing native-completion owner.
- Active-interface mechanics documentation/context replacement and concise permanent prompt, with versions/ablation flags.
- Pending-versus-accepted state and evidence-backed cancellation/reversal feedback, coordinated with the active-UI owner.
- Bounded evidence-supported action-bias prompt as its own patch.
- Common passive speedrun diagnostic aggregation and viewer comparisons/reporting; do not create a diagnostics-off behavioral arm. Existing loop intervention flags and native/UI patches need individual measurement plans, not duplicate implementations.
- Four-per-arm counterbalanced runner/manifest, native target termination for short-stage evaluation, incremental downstream checks and incumbent promotion/regression ledger.

Each behavioral owner must document hypothesis, target native milestone, exact flag/dependencies, equal-budget incumbent/candidate plan, completion tolerance and speed criterion before trials; tests/review/landing do not establish model improvement. Scope-limited probes are not a substitute for the four-per-arm measured comparison. Initial configuration/frontier is reproducible even if retroactive flags are required. Object interaction/navigation changes remain discussion-first as previously recorded.

Side-conversation boundary still prohibits sub-agent interaction here. No agents launched, no source/flags/configuration implemented, and nothing committed or landed by this entry. Main-chat handoff requires the user's authorization to message that chat; this entry is the concrete reviewable handoff plan.


## Coordinated documentation preparation — patch evaluation (2026-10-12)

Problem: the authorized side-conversation draft must become a reviewable documentation change without colliding with runtime integration or passive-report ownership. Parent coordinator authorized isolated preparation of the existing skill, discovery link and appended design decisions; source side-chat `00000000-0000-4000-8000-7a092cd82c45`. Earlier side-conversation status entries describe their historical authorization at writing time; this coordinated preparation does not rewrite them or their completed-cohort provenance.

Scope frozen before skill refinement: preserve all canonical draft worklog text and the existing `16c8939` report commit record. Managed checkout `/Users/user/.codex/worktrees/patch-evaluation-docs/pokebench`, base `16c8939`, branch `codex/patch-evaluation-docs`. Only this worklog, `.claude/skills/pokebench-patch-evaluation/SKILL.md` and `.agents/skills/pokebench-patch-evaluation` are included. No runtime code, flags, resolver, presets, runner, diagnostics module, gameplay or new resource authorization. Parent owns runtime integration, selected-roster review and landing; passive reporting has a separate existing owner.

Skills: skill-creator and feature-worklog; referenced story-milestones/game-state guidance checked. Documentation-only preparation records the RED waiver because it changes no executable behavior. Runtime test/coverage/build gates are not claimed by this documentation packet. Focused gates: skill quick_validate, discovery/reference resolution, native catalog target-ID inspection, append-only draft preservation and diff whitespace/path checks.

Invariants: completed twelve-run cohort remains N3 per arm/model; future comparison protocol is N4 per arm/model with exactly one effective behavioral flag difference on the same reviewed build; passive diagnostics stay common; truthful native grading, concrete input validation, isolation and evidence integrity are never ablated. Reports advise and disclose actual trial counts; they do not mutate the incumbent automatically. Authorizing documentation does not authorize trials, additional batches, endpoint/resource changes or runtime implementation.

Preparation status: copied the canonical dirty additions into the isolated checkout before refinement; tightened prospective-versus-historical wording, target-ID/catalog semantics and explicit promotion authority. Historical `PLAYER_NAME_SET` remains distinct from native `PLAYER_NAME_CONFIRMED`; new termination/configuration paths are requirements, not implemented capabilities. No shared model/reviewer endpoint used while owner reviews are active. Multi-model review and landing remain pending coordinator receipt.

Principles self-review: PB1 PASS native evidence/catalog predicates; PB2 PASS all launched/censored outcomes retained; PB3 PASS prospective N4 with historical N3 preserved; PB4 PASS complete advantage/flag provenance and common immutable measurement; PB5 PASS one-factor comparisons; PB6 N/A no runtime/context changes; PB7 PASS immutable run receipts; PB8 PASS retain model/infrastructure errors without new retry policy; PB9 PASS authority/frontier boundaries explicit; PB10 PASS no weakened gates; PB11 PASS catalog/source references verified at frozen base; PB12 N/A no ROM access; PB13 PASS review/landing pending explicitly. Pre-existing principles header still calls itself draft while CLAUDE.md calls it operator-approved; CLAUDE.md is the repository override, and this doc-only packet does not edit that unrelated inconsistency.

Focused gate receipt: skill-creator quick_validate PASS; append-only comparison against both committed base and canonical dirty snapshot PASS (canonical snapshot SHA-256 `99c3fedeb4d4eaf53f632ad1e72e9a52975ed6a016d951c86da0458d15b0263f`); Codex symlink and both relative skill references PASS; six catalog IDs PASS; git diff --check PASS. Independent-agent review unavailable during preparation because all four team slots were occupied; this is pending review, not LGTM. Prepared documentation commit is `docs(evaluation): define measured patch comparison contract`; exact SHA is recorded in the worktree-local pointer after commit and returned to the coordinator.
