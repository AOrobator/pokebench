# Frontier mistake mitigations

## Problem Statement

Status: APPROVED FOR IMPLEMENTATION — 2026-10-22. All new treatments go in the bundle, control/default OFF. No experiments or probes may launch.

The operator approved implementation on October 22, including parallel subagents, default/control-OFF treatments and future bundle ON. Eleven new treatments are integrated, including the generic stationary-NPC approach packet. No experiment or probe is authorized to launch. Branch implementation, reviewed landing, viewer delivery, later-run activation and measured benefit remain separate stages.

The October 22 holistic Frontier report records 16 episodes in run `2026-10-21T13-33-54_qwen36-gpu0_ea04`. Several interventions already existed in that run; others have landed since. We need to distinguish missing capability, incomplete feedback, harmful intervention and ordinary gameplay cost before adding more switches.

Evidence lives in the canonical checkout `/Users/user/dev/pokebench/` (ignored report/run files are not copied into this worktree):

- `runs/reports/run-analysis/2026-10-22_holistic-frontier/index.html`
- `runs/reports/run-analysis/2026-10-22_holistic-frontier/sections/frontier_ea04.md`: episode IDs, event sequences, observations and limitations.
- `.../sections/bugs.md`: cross-run interface and infrastructure findings.
- `.../sections/arms_sub_mitigation.md`: existing switches, delivery evidence and candidate ablations.
- `runs/2026-10-21T13-33-54_qwen36-gpu0_ea04/events.jsonl`: actual historical feature vector; retain original logs and RAM.

Planning source pin: `4967a3ca955bb8696c9ed44725805c7696af9c78`. Refresh before implementation. The report's snapshot predates the evolution-result correction and milestone-drought suppression; navigation-recovery-v1 is also now registered. These are existing work to verify, not features to implement twice. Main presence does not establish activation in any measured run.

Priority reflects severity, recurrence, evidence quality and prerequisite relationships. Reported segment gaps overlap and are not additive causal savings. In particular E16's 29.5 minutes were after the original two-hour cap; the report's projected 42-minute recovery and 92.8-minute win are hypotheses, not acceptance targets.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`
- `.claude/skills/feature-switch/SKILL.md`
- `.claude/skills/feature-explainer/SKILL.md`
- `.claude/skills/experiment-queue/SKILL.md`
- `.claude/skills/pokebench-trace-forensics/SKILL.md` (preceding analysis)
- `.claude/skills/pokebench-patch-evaluation/SKILL.md` (preceding analysis)

Load the relevant game-state, agent-observability, tool-prompt-sync, close-the-loop, viewer-e2e, experiment-design and landing-board skills before those execution phases. This plan does not claim those execution checks have run.

## Architecture

### Delivery and authorization

Implement in the owned branch/worktree after plan approval, one independently reviewable treatment at a time. Do not replace another task's canonical WORKLOG.md pointer. New behavior uses default-OFF switches with exact OFF parity, production wiring tests, explainers and pending experiments. Existing switches retain historical semantics; a changed threshold, action policy or readout gets its own treatment switch rather than silently changing an old ON arm.

Plan approval authorizes the agreed implementation scope; it does not approve gameplay probes, measured cohorts, preset promotion or new defaults. Prepare concrete evaluation designs for operator approval. Landing follows repository gates and the shared landing board; any viewer restart is coordinated. No GPU/service changes are part of this plan.

### Priorities and proposed treatments

| Order | Mistakes and evidence | Proposed work | Completion evidence |
|---|---|---|---|
| P0 / M1 | E14 menu loops, ~5.5-minute window; cross-run B1/B6 input faults | Verify the already-landed evolution-result correction; add a separately switched battle move-learning YES/NO ownership correction if still missing. Preserve learn_move, early comparison, fingerprint and interface feedback. | Recorded RAM confirms ready/waiting ownership; accept and decline terminate normally; no automatic move/evolution selection. |
| P1 / M2 | E1/E6/E8/E16 trigger barriers and walking cuts; E6 had 47 cut turns; E16 had 45 trigger refusals | Verify trigger-navigation-boundary-v1. Prototype `rejected-movement-stride-v1` (provisional ID) as an alternative to the single-step fallback using the existing checked-stride executor. Prepare a rejected-movement-step OFF ablation. | Bounded execution of the model's requested directions; receipt of requested/submitted/dropped inputs; stop and return at hazards or transitions; OFF preserves incumbent execution. |
| P1 / M3 | E12/E13 resisted attacks, repeat losses, invalid battle calls; E15 unloaded leader refusals | Improve leader-attempt feedback with a compact observed last-loss/current-party comparison. Correct generic static NPC template targeting behind a separate switch. Keep ledger/coverage tools. | Explicit changes/unchanged/unknown fields; only observed opponents/outcomes; unloaded targeting does not assert current presence or activate a target without fresh evidence. |
| P1 / M4 | E7 heal at 23/29; E11 heal at 30/33; E4/E12 had justified low-HP heals | Unify duplicate healing messages under a new switched policy, distinguish danger from minor damage and state HP without always ordering a trip. Prepare gym-heal-warning OFF ablation. | Minor-damage cases do not command full healing; 3/21 and 14/35 retain meaningful warnings; unknown party states remain unknown. |
| P2 / M5 | E3 self-tile loop; E9 unreachable north edge; E2/E6 wrong whereabouts; E15 invented puzzle | Add boundary-crossing facts to already-here feedback and qualified connectivity facts for reachable exits. Improve person-goal handling only from delivered dialogue; include unnamed-speaker place evidence with provenance. | No hidden route/objective; section/terrain gates and uncertainty preserved; no claim that gym completion status disproves a puzzle. |
| P2 / M6 | E2/E3/E6 repeated priors, broader report's identical-call loops; guards interrupting training | Prepare explorer v1 ON/v2 OFF and fixed-point-breaker ON candidates. Audit navigation-recovery and drought suppression coexistence; extend cycle-progress recognition only if replay shows a remaining gap. | Prompt precedence and effective flags verified; productive EXP/level/trainer changes distinguished from actual loops; no added autonomous talk/walk. |
| P3 / M7 | All episodes | Freeze evidence-backed candidate definitions and evaluation designs; document deferred interventions and operational proof requirements. | One treatment per primary comparison, explicit composite exceptions, current readiness, starts/denominators/budgets, pending entries and no execution without operator approval. |

M3 and M5 each contain independently switched subchanges and must be split into separate RED/GREEN review packets. Milestone grouping is organizational, not permission to bundle attribution.

### Full episode disposition

| Episode | Switch posture and improvement | Owner |
|---|---|---|
| E1, seq 1832–2169 | Retain trigger-navigation-boundary ON in candidate; verify trigger step returns before further movement. | M2 |
| E2, 2709–3222 | Retain field-ownership-feedback/tool-prompt-docs; test explorer v1 ON with v2 OFF. Stale-plan-fact is conditional on repeated reasoning, not a general hallucination detector. | M5/M6 |
| E3, 3228–5203 | Retain navigate-already-here; add direction/destination at verified connection tiles. Person/location evidence must be heard before it is promoted into a goal. | M5/M6 |
| E4, 5213–6950 | Retain grass-cost and semantic navigation; keep story-battle-heal-gate OFF. Expose verified adjacent interaction alternatives when a requested NPC tile is occupied. Do not automatically RUN from battles. | M3/M4 |
| E5, 7196–7603 | No established switch-only remedy. Inspect actual delivered heal/goal evidence before attributing the detour to warnings. | M4/M5; exploratory |
| E6, 8191–10033 | Trigger boundary plus checked requested-direction strides; clear stale barrier feedback after the live condition changes. Route facts do not guarantee the model follows them. | M2/M5 |
| E7, 11122–11530 | Gym-heal-warning OFF ablation; revised heal policy and truthful no-battle interface feedback. | M3/M4 |
| E8, 11776–12047 | Trigger boundary plus replacement for cut-to-one-press fallback. | M2 |
| E9, 12057–13333 | Keep exit-reachability/reachable-story-guidance; expose qualified Woods connectivity without selecting a route. | M5 |
| E10, 13348–14253 | No dedicated new intervention. Segment was faster than the human reference; ordinary trainer/wild battles are not automatically waste. Verify trigger boundary only. | M2; otherwise deferred |
| E11, 15014–15460 | Revise gym-heal-warning, story-battle-heal-first and heal-before-trainers-v2 interaction under one independent treatment; do not disable useful low-HP facts. | M4 |
| E12, 15780–16609 | Keep low-HP warnings; the 14/35 heal was justified. Improve observed battle-outcome comparisons instead of removing effectiveness readouts. | M3/M4 |
| E13, 17183–19160 | Preserve leader-attempt/party-coverage/seen-trainers. Add last-loss comparison, no-battle feedback and safe unloaded-target approaches. Rematch gate deferred. | M3 |
| E14, 20057–21101 | Retain move-learn tool/comparison/early-comparison/fingerprint/stale-plan feedback; verify corrected evolution-result input and fix remaining battle YES/NO ownership. | M1 |
| E15, 21680–22036 | Safe unloaded-leader approach and current observable facts. Gym-evidence completion status does not detect imagined boulders. No scripted puzzle solution. | M3/M5 |
| E16, 22670–26278 | Trigger boundary candidate; use post-badge state for correctness proof. Keep this post-cap window separate from two-hour outcome claims. | M2 |

### Original configuration candidates and chosen implementation

- Retain existing trigger boundary, move-learning comparison/tool/fingerprint, field ownership and tool-prompt documentation in candidates where dependencies are satisfied.
- Prepare `rejected-movement-step-v1=OFF` with navigation-tool-use-guard unchanged. This means zero-input rejection, not unrestricted full batches. The checked-stride treatment is a separate comparison.
- Prepare `gym-heal-warning-v1=OFF` alone first. Other heal messages remain; only the new unified-policy treatment may address all overlapping messages.
- Prepare `explorer-guidance-v1=ON`, `explorer-guidance-v2=OFF` as an explicitly composite prompt replacement, because v2 wins if both are ON. Do not falsely register this two-flag swap as a single-feature experiment. Use a valid composite design or a separately registered replacement treatment after design review.
- Prepare fixed-point-breaker ON while holding auto-talk and duplicate-collapse settings explicit and unchanged. Do not silently enable harness-selected movement through inherited defaults.
- Keep story-battle-heal-gate OFF; preserve general low-HP observations and legal model overrides.
- Retain milestone-drought-suppression as an explicit candidate setting already present in the bundle. Measure the tradeoff: ea04 pivoted after a drought briefing. Do not delete stall-briefing or assume map-cycle warnings are suppressed too.
- Do not blindly switch off drought-battle-heal-hold: the schema crash has been fixed and drought suppression changes its effective context. Audit overlap and attribution first.
- Keep caught-dex-input available; any baseline repair gets a new explicit baseline revision and both arms are requalified. Never silently rewrite historical control identity.

### Current episode dispositions


All “ON” below describes the future candidate bundle; all new switches are default/control OFF. None has measured benefit or later-run activation proof.

| Episode | Retain / turn ON | Turn OFF / supersede | Scope or remaining gap |
|---|---|---|---|
| E1 | existing trigger-navigation-boundary; new rejected-movement-stride | old one-step/rejection superseded only when new stride handles a request | Trigger entry remains its separate bounded step; no story continuation. Exact historical native fixture proof not located. |
| E2 | field-ownership-feedback, tool-prompt-docs, delivered-place-evidence, explorer-family-guidance; conditional stale-plan-fact | explorer v2 section replaced through new treatment, original bits not blindly swapped | Does not detect every invented nickname belief or infer a named daughter identity. |
| E3 | navigate-already-here, boundary-crossing-facts, delivered-place-evidence, explorer-family-guidance | none required beyond treatment precedence | Current verified crossing fact only; no hidden route. |
| E4 | grass-cost and semantic navigation, coherent healing, npc-approach feedback for qualified trainers; existing occupied-person neighbour checks | story-battle-heal-gate stays OFF | 3/21 danger preserved; automatic RUN deferred. Generic stationary non-trainer approach is implemented under static-npc-template-approach-v1; automatic activation remains prohibited. |
| E5 | coherent factual healing and historical place evidence where actual exposure qualifies | no proven single switch to turn OFF | Wrong-turn/heal causality not established; no claimed fixed detour. |
| E6 | trigger boundary, checked requested stride, boundary/place facts, explorer-family | one-step fallback superseded under new stride | Existing live trigger expiry retained; model still selects crossing/route. |
| E7 | coherent healing, field ownership/no-battle feedback | overlapping heal advice bypassed under coherent policy; standalone gym-warning-OFF remains optional | Native invalid battle calls retain current Interface facts, not new mandatory advice. |
| E8 | trigger boundary and checked requested stride | old cut-to-one-step fallback superseded when treatment applies | Requested prefix only, stops before relevant hazards. |
| E9 | existing exit reachability/reachable-story guidance + reachable-section-alternatives | none | Shows currently reachable departure alternatives and existing section facts; does not prove/choose a path through Woods. |
| E10 | existing factual navigation/trigger behavior | no dedicated change | Ordinary battle cost not established as mistake; segment faster than human. |
| E11 | coherent-healing-feedback | minor damage no longer triggers combined heal directives; old warning bits kept explicit | 30/33 production case covered, no arbitrary 80% threshold. |
| E12 | battle-effective-damage/coverage, coherent low-HP feedback, leader-loss comparison when actual prior leader-loss context exists | do not disable useful low-HP facts | 14/35 heal justified; delivered effectiveness/outcome pages supplied, no damage predictor. |
| E13 | leader-attempt/party-coverage/seen-trainers retained; leader-loss comparison + qualified trainer template approach | mandatory rematch gate deferred | Factual changes/unchanged/unknown; no selected strategy/training requirement. |
| E14 | learn_move/comparison/early comparison/fingerprint/stale-plan retained; battle-move-learn-input + owned-battle-context; existing evolution result correction | stale battle-context interpretation superseded only for verified non-battle owner | Native B6/d951 and 83d7 reparsing qualify correctness separately from gameplay benefit; no forced evolution or move selection. |
| E15 | qualified leader trainer approach, existing gym evidence, delivered historical facts | no puzzle solver or rematch gate | Completion status does not disprove imaginary boulders; generic stationary non-trainer approach is separately switched. |
| E16 | existing trigger boundary plus safe requested strides where relevant | old unproductive one-step fallback superseded under treatment | Preserve post-cap status; do not fold 29.5 minutes into an additive two-hour speedup. |


## Invariants

- INV-1: Each new treatment OFF reproduces the immediately preceding behavior exactly. Test prompts, tools, results, state fields and action receipts where affected.
- INV-2: The model selects goals, targets, directions, moves, evolution and rematches. No hardcoded May/Roxanne route, automatic move choice, training requirement or rematch refusal in the initial scope.
- INV-3: Movement never exceeds the requested directions or bounded stride contract. Stop at unknown state, relevant obstacles, triggers, encounters and transitions; return an observation before continuation.
- INV-4: Observations distinguish current, last observed, static template and unavailable. Proposed connectivity requires live gates and section reachability; topology alone is not proof of a usable route.
- INV-5: Healing feedback preserves danger cases, uncertainty and party ownership. No arbitrary 80% threshold is treated as validated; choose the concrete policy during M4 design from evidence and document it before coding.
- INV-6: Recorded raw evidence and historical presets are immutable. Source SHA, effective flags, dependency checks and run_start receipts distinguish branch, merge, candidate and actual activation.
- INV-7: No new timeline marks. Existing diagnostic events, Activity History and raw inspector carry attribution; model-visible feedback must be shown to reach the model.
- INV-8: Ordinary battles, training, healing and backtracking remain executable. New cycle handling cannot turn productive activity into a no-progress stop.
- INV-9: Terminal crashes, operator extensions, post-cap progress and infrastructure failures remain separately labeled. No sum of segment gaps becomes a claimed speedup.

## Security Review

Use existing typed event/readout contracts and verified ROM/RAM access. No new external service, message recipient, network publication, save mutation or arbitrary memory write. ROM, saves and native states remain outside Git; fixtures use existing repository-approved sanitized forms and provenance. No vendor edits, secret output or shell-string subprocesses.

## Milestones

- [x] ASK USER: approved 2026-10-22: "Go ahead and implement the worklog in priority order. Keep the changes behind switches and don't launch any experiments yet. these changes all need to go in the bundle. launch subagents to reduce wallclock time on implementation".

**Shared execution checklist — required for each implementation packet M1–M6**

- [x] Refresh base, ownership, concurrent worklogs and feature inventory; record packet boundary and chosen switch contract before edits.
- [x] Ground behavior in game source and recorded event/frame/RAM fixtures; add failing regressions and exact OFF tests.
- [x] COMMIT RED tests; record SHA and actual failing assertions in this worklog.
- [x] Implement one treatment with concrete types, production wiring, append-only registry/default-OFF handling and prompt synchronization where relevant.
- [x] Delete guarded behavior/wiring once; observe the named regression fail, restore it and record both receipts.
- [x] Run `just test`, `just lint`, `just build`, `just coverage` (at least 90% lines/branches/functions per stack), and `just verify-vendor`; record counts and receipts.
- [x] COMMIT GREEN; record SHA and gate results. Update tracked explainer/card link, pending experiment and current readiness before landing; keep experiment unapproved.
- [ ] Complete PB1–PB13 self-review and repository-required cloud review on the frozen packet. Do not treat this checklist as authority to replace a missing lane.
- [ ] Prove delivery through replay/model input and browser surfaces as applicable. Synthetic rehearsals are labeled and do not establish gameplay benefit.
- [ ] Land only through the shared board and reviewed-tree rules; record merge SHA, coordinated viewer proof and actual later activation separately.

**M1 — Interface correctness before menu benefit claims (P0)**

- [x] Reparse d951/83d7 decline-result fixtures using corrected evolution code; verify existing tests cover decline, accept, ready result and animation without reimplementing landed B1 correction.
- [x] Reproduce B6 from 97a0/d548 battle YES/NO RAM: ready choice must not be called battle_resolving. If current main still fails, implement the independent correction using the shared checklist.
- [x] Verify comparison delivery before learn_move decisions, tool availability/prompt consistency, and refusal paths preserving owned Interface/frame evidence.
- [x] Acceptance: both learning and declining return to normal input; no default selection of Double Kick or forced evolution. Replay success is correctness evidence only.

**M2 — Trigger navigation and direction batch execution (P1)**

- [x] Verify E1/E8/E16 trigger boundary behavior against source/current tests; add only missing coverage rather than changing that switch's contract.
- [x] Specify checked execution for repeated and mixed direction sequences, hazard endpoints and batch-remainder disposal. Reuse existing stride primitives; do not infer a route.
- [x] Implement the independent stride alternative; freeze compatibility/precedence with rejected-movement-step and navigation-tool-use-guard.
- [x] Acceptance: requested plain-corridor movement makes bounded multi-tile progress; scripts/maps/battles interrupt and return; old fallback remains exact with treatment OFF.

**M3 — Repeated-loss evidence and verified NPC approaches (P1)**

- [x] Packet A: last-loss/current-party comparison using observed levels, EXP, moves, party and damage/effectiveness; distinguish no change from missing data.
- [x] Packet B: qualified unloaded static NPC approach and occupied-tile interaction alternatives. Honor hidden flags, map identity, movement uncertainty, obstacles and trainer sight; do not auto-start a battle on inferred presence.
- [x] Verify no-battle errors deliver current screen/interface; avoid redundant notices when existing feedback already suffices.
- [x] Acceptance: E13's unchanged-rematch facts are prominent and accurate; the model retains all choices. Leader template approaches work without false current-presence claims.
- DEFERRED: proposed leader-rematch-gate-v1. Try factual feedback first; a new action restriction needs separate design/approval based on evidence.

**M4 — One coherent healing policy (P1)**

- [x] Replay E4/E7/E11/E12 and identify every contributing warning; choose and document the new treatment's exact trigger and deduplication rule before implementation.
- [x] Separate factual HP/cost/heal-location observations from advice to leave. Consider team viability, readable state, available healing and immediate battle context without inventing a battle outcome predictor.
- [x] Test minor-damage and severe-damage pairs, full HP/low PP, multiple party members, unknown ownership, stale heal facts and repeated map entry. Use the shared checklist for the independently switched policy.
- [x] Acceptance: 30/33 does not produce three heal commands; genuine low-HP information survives; no inferred mandatory trip or hidden action gate.

**M5 — Useful route and person-location facts (P2)**

- [x] Packet A: verified edge direction/destination on already-here results, plus expiry of prior trigger barriers when live conditions change.
- [x] Packet B: section-aware reachable exit connectivity toward the model's stated destination, explicitly qualified and with alternatives; no automatic route selection.
- [x] Packet C: person/place evidence from delivered dialogue, including unnamed speakers, with exact quote/source/turn and story relevance/expiry. Normalize contradictory displayed place labels where source verifies identity.
- [x] Acceptance: E3 states the crossing fact; E9 explains relevant Woods connectivity with terrain/gate limits; person-goal handling never supplies unheard May whereabouts.

**M6 — Existing switch ablations and productive-progress handling (P2)**

- [x] Prepare explicit explorer replacement and fixed-point candidates in future bundle definitions as subsequently authorized; preserve historical control-base files. Check conditional auto-talk behavior and dependencies.
- [x] Audit navigation-recovery-v1 and milestone-drought-suppression against these windows; preserve independent loop/stop attribution and legitimate backtracking.
- [x] Replay EXP/level/trainer-win windows against progress-aware-cycles. Only if a gap persists, design a separately switched bounded exemption with regressions for endless unproductive grinding/revisiting.
- [x] Acceptance: no duplicate new recovery feature; feedback does not call verified productive training a failed plan; loop handling retains bounded behavior and model agency.

**M7 — Evaluation plans and operator review (P3)**

- [x] For each candidate, resolve activation milestone from the pinned native catalog and assess readiness using current qualifying evidence. No READY claim is made by this document.
- [ ] Prefer validated checkpoint designs for late-game mechanisms; require save provenance/hash/load proof. Boot designs need the documented 3-of-last-4 activation criterion. A named milestone is not a restorable checkpoint.
- [ ] Freeze primary outcomes, regressions, start, complete effective flags, source/model/serving identity, caps, power/budget and balanced order with experiment-design. Screens use eight trials per arm/model; confirmation size follows the design skill and approved budget.
- [x] Measure target reliability first, then turns/tokens/time, interface failures, invalid calls, unchanged rematches and heal trips. Preserve all outcomes and separate infrastructure losses.
- [ ] Specify regression checks preserving useful healing, no softlocks, no premature guard stops and downstream progress. Fix numerical acceptance margins before execution; do not select them after results.
- [x] Present concrete experiment artifacts for operator approval. No probes/cohorts launched, no queue approvals, no incumbent promotion or defaults changed by plan approval alone.

## Closing the Loop

Plan delivery: this Markdown worklog and its priority summary, with all E1–E16 dispositions. Documentation-only validation checks section completeness, evidence paths and the diff; application tests are not evidence of this plan's quality and are not run for this edit.

Implementation delivery: source and test receipts, independent reviews, exact merge pin, linked local explainers and real-browser card/replay proof; no claim of behavioral improvement until measured. Landing does not prove that a later run uses the change: verify source SHA, recipe SHA and effective feature vector in its actual run_start.

## Session Log

- 2026-10-22: The operator requested this plan before implementation. Created isolated branch `codex/frontier-mistake-plan` at source pin above; read-only evidence refresh plus this worklog/pointer only. Canonical main and its unrelated worklog pointer are unchanged. No source/tests/presets/experiments edited and no gameplay/service actions taken.
- 2026-10-22: Cross-checked the ledger with registry contracts and current evolution-result/navigation-recovery worklogs. Existing battle-preparation readouts were already ON in ea04; they cannot be proposed as newly enabled cures. This is the historical planning state; implementation was explicitly authorized later on October 22.

## Surprises

- rejected-movement-step OFF retains the navigation guard's zero-input rejection. It does not restore unrestricted multi-direction movement.
- Explorer v2 takes precedence over v1. A v1/v2 swap is a two-flag composite, not a valid single-changedFeature experiment.
- The report's open B1 evolution freeze has since received a correction. Verify it and preserve its scope; the separate B6 battle YES/NO contradiction still needs current-source qualification.
- Navigation recovery was appended after the earlier answer; its bounded recovery feedback does not add missing route facts and must not be mistaken for measured recovery benefit.

## Multi-Model Review Log

Implementation exists on the owned integration branch. Child self-reviews and local tests do not replace the frozen Claude/Grok/GPT cloud review. No final review verdict is claimed until the packet identity and actual lane receipts are recorded below.

## Boy Scout Log

None. Keep unrelated cleanup outside these evidence-backed packets.

## Archive Milestone

- [ ] ASK USER: archive only after the agreed scope and evidence are complete.

- 2026-10-22 execution: explicit approval received. M1, M2 and M3 delegated to isolated implementation worktrees; parent owns M4 and later integration. Integration/review order follows priorities. Existing factual-healing-guidance-v1 is present at base and will be reused, not recreated. New treatments default/control OFF and bundle ON per latest authorization.

### M4 RED and policy decision

- `coherent-healing-feedback-v1` will supersede overlapping warnings only when ON; OFF preserves existing wrappers. No new 80% threshold: reuse existing verified weakParty criteria (lead below half, fainted member, or verified no damaging PP). Minor damage retains the ordinary party readout with no heal command. One factual warning per unchanged risk/map/party profile; known healing places remain options. Disable the independent repeated heal-first wrapper only under this treatment.
- Production factory regressions on recorded b300 gym entry with ledger HP variants: all 3 tests fail as intended; receipt `/tmp/frontier-m4-red.log`. Source reference pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, clean read-only checkout. No game inputs executed.

### M4 GREEN candidate (integration gates/review pending)

- Coherent warning uses existing weakness criteria; minor damage returns unchanged ordinary readout, one danger warning at most, unchanged profile suppressed, unreadable/foreign party not guessed. Legacy heal-first bypassed only under the new switch. Existing typed warning event stores exact delivered text.
- Production regressions: 3 pass (`/tmp/frontier-m4-green3.log`); wiring deletion: all 3 fail (`/tmp/frontier-m4-delete-wiring-01.log`), restore 3 pass (`/tmp/frontier-m4-restore-wiring-01.log`). Initial GREEN test harness expected bare text while unrelated harness-trust correctly added a header; isolated unrelated wrapper in fixture before final proof.
- Agent tsc/build pass. Six normalized generated bundle/control preset tests pass (`/tmp/frontier-m4-bundles.log`); default/control OFF, bundle ON. Explainer themed and pages-check clean. Pending experiment explicitly blocked/unapproved; full gates, browser and review remain open for integrated packet.
- Commit sequence: planning 45a8891b9; M4 RED 601ab609d; GREEN commit follows. Parallel implementation is per operator authorization; integration and review prioritize M1 then M2/M3/M4.

### M6 explorer replacement RED

- New explorer-family-guidance-v1 independently selects the already-existing family/re-talk section without mutating explorer v1/v2 historical precedence. Default/control OFF, bundle ON. This makes the approved prompt replacement one effective experimental difference; fixed-point-breaker will also enter the bundle with explicit existing auto-talk bits unchanged.
- Production prompt test fails on missing replacement (`/tmp/frontier-m6-explorer-red.log`); OFF precedence cases pass. No story names or routes added.

### M6 explorer GREEN candidate

- Independent prompt replacement implements exact existing family/re-talk text; OFF precedence unchanged. Focused tests 2 pass; deleting selector fails 1 replacement regression while OFF test remains green; source restored. Six future bundle definitions enable this treatment and fixed-point-breaker while preserving explicit existing auto-talk settings. Explain/pending entry added, themed/check clean. Full integration gates/review and browser remain pending. No trial launched.

- M1 integration: cherry-picked RED/GREEN; resolved append-only registry and future bundle JSON conflicts preserving parent healing/explorer treatments and existing flags. Child worklog retains its independent RED/native regression evidence. No main changes.

- M2 integration: checked-stride RED/GREEN cherry-pick, append-only registry/list conflicts combined. All parent/M1 flags preserved. Broad historical fixture reconciliation deferred until every new treatment is integrated.

- M3A integration: observed leader-loss comparison RED/GREEN cherry-picked with production wiring and exact unknown/change distinctions; no rematch gate. Review/gates remain pending on cumulative branch.

- M3B integration: qualified unloaded trainer-template approaches preserve hide filtering/current-state checks and never press A or claim live presence. Safe template facts currently cover trainers, including the leader; non-trainer templates remain unavailable and are not guessed.

- M5A integration: current-boundary crossing facts added only for unique delivered edge + current foot reachability and no matching trigger; zero inputs. Existing blocked-exit feedback already retires changed live trigger conditions, so no duplicate stale-barrier treatment added.

### Integration qualification in progress

- Fixed duplicate append-position conflicts in metadata and two browser-test closure conflicts introduced by cherry-pick union. Historical registry/order/default-OFF fixture expectations updated for appended treatments; no weakened production assertions. Initial combined agent pass4504/fail65, later4531/fail38; failures triaged as registry tails, raw ALL_ON fixture drift and explicit baseline updates. Full gate not yet passed.
- First parent Python invocation used repository root and omitted dotenv ROM environment; 515 skips and fixture failures are an invalid environment attempt, not an implementation verdict. Repeating through just commands with isolated venv/native binding and initialized exact vendor pin. No GPU/emulator inputs executed.

- M5C integration: exact delivered historical person/place statements, unnamed-source provenance and source-milestone retirement are preserved; no daughter→MAY inference or automatic walk-away goal action. Native ea04 retention/retirement replay and failed-delivery exclusions in child packet.

- M5B integration: repeats already-delivered section exit facts only for currently foot-reachable departure warps, explicitly no guarantee of reaching the requested coordinate and no chosen route. Exact b300 Woods/Route104 section fixture verifies evidence.

### Integration and operator steering

- All9 initial new treatments now integrated; every active six-recipe bundle explicitly ON/control OFF. Existing fixed-point-breaker enabled only bundle; auto-talk bits stay explicit. Current-source M6 replay shows cited training warnings already covered, so no EXP exemption introduced.
- Advisory review caught v1-only low-HP rival fallback missing under coherent treatment; restored original v1 facts/record path and added production regression, 4 tests pass.
- Responsive document QA caught mobile source-path overflow and unreadably scaled diagrams; local wrapping/scroll containers added, 27 screenshots and9 composites rechecked. Static production-rendered cards clicked9 links; not live8790 proof.
- Operator instructed all browser work remain background with no stolen focus. Foreground interaction stopped across agents immediately; no further foreground validation.
- Operator added direct owned battle context correction via coordinator at12:41 EDT (verbatim yes pls). Separate P0 switch owned-battle-context-v1 forthcoming, uses d951 seq17461.
- Parent Python qualified run:3952 pass/16 fail, no skips; remaining failures are old default-OFF/server-tail/forwarding expectations for appended B6 switch. Those expectations corrected; full rerun pending. All earlier test attempts remain diagnostic, not final gates.
- Historical fixture repair accidentally changed one unrelated duplicate-shape .at assertion in harness.test; restored original -2/toolResult assertion immediately. No harness behavior change. Future registry compatibility uses explicit frozen treatment-OFF helper for old receipt positions, retaining separate current registry tests.

- P0 owned-battle-context integration: separate RED/GREEN packet imported; shared predicate handles verified evolution and move-learning ownership rather than stale in_battle. Native d951 archive and model-delivery regressions retained; integration/full review pending.

- Final owned-context integration exposed duplicated new-only metadata/receipt entries from overlapping child append hunks; removed duplicate leader/NPC additions and restored exact registry order with no existing ID reordering. Registry bijection tests remain strict.
- Viewer projection fixture now uses6500 synthetic heavy splits instead of6000 because the expanded current feature catalogue grew the small card metadata; the unchanged20× compression assertion remains. No projection source behavior or coverage threshold changed.
- Agent prior9 candidate reached4597 pass/3 fail before final P0 registry append; viewer1724 pass/3 fixture-shape failures; Python3968 pass/1 expected default-OFF membership mismatch. All remaining failures corrected or being rerun; no final gate claim yet.

- Synced reviewed source prerequisite main fbfea5d71 (future potion/factual-healing bundle activation). Conflict resolution preserves all ten new treatment bits and main potion activation. Static baseline comparison tests explicitly exclude only additions after their historical pins. Latest diagnostic agent4606 pass/2 metadata-tail failures; correcting those before full frozen gates.

### Final qualification before frozen review

- `just test` now passes4611 agent +1733 viewer +3969 Python =10313 tests, no skips (`/tmp/frontier-test6.log`). Full ten-feature generated-arm/pending comparison tests additionally16 pass.
- New integration regression found and corrected an unreachable duplicate stateOnlyProblems return from append conflict: all three historical/prompt treatments must be rejected in state-only mode. RED1 fail/2 pass then GREEN7 combined pass. No production tests or thresholds weakened.
- All pending entries share an explicit complete future-bundle feature vector with their own treatment OFF; single-bit candidate parses and validates. All entries blocked/unqueued/unapproved; registration numeric fields remain explicitly inherited placeholders pending operator-approved budget/start/cap/power design.
- Main focus-preservation policy61c26ca0c is a pending documentation sync. Agent-owned headless proof for the tenth owned-battle-context page now passes with unchanged desktop front application before/after. No live8790 change yet.
- M3 trainer-template support is proven; the approved generic non-trainer static-template scope is still open and will be finished in a separate packet before closing the worklog.

- Integrated ten-treatment coverage passed (`/tmp/frontier-coverage1.log`): agent lines99.18%/branches93.20%/functions97.95%; viewer lines97.96%/branches91.42%/functions94.43%; Python lines97.39%/branches93.41%/functions100%. All tests in coverage passed, zero skips; no thresholds/exclusions changed. Python format-only fix for owned-context regression applied after the previous lint correctly rejected its layout. Final generic NPC packet and transport/replay qualification will receive final-tree gates before review.

- Additional M1 native qualification: 83d7 state35031 raw archive00013848 reparsed by current production read_state/result_message_waiting and pure EvolutionGate. Verified ready evolution_result and A passes gate; zero emulator inputs applied. Receipt `/tmp/frontier-83d7-native-reparse.json` includes original archive SHA/frame/ROM identity. This verifies already-landed B1 correction rather than introducing a duplicate fix.
- Additional M4 production matrix: full-HP lead with all damaging PP exhausted and a separate fainted teammate each retain exactly one factual warning without full-heal directives. Focused suite5/5 passes (`/tmp/frontier-m4-additional-matrix.log`); TypeScript pass. Fixtures are explicit native-shaped variants, not historical episode reenactments.
- Synced main e441abb1d human-play URL correction before final packet; no review packet has yet been sealed. Ten-treatment full lint now passes (`/tmp/frontier-lint7.log`) and `just verify-vendor` passes (`/tmp/frontier-vendor-final.log`). Final gates will follow remaining packet integration.

- Exact ea04 healing source audit retained `/tmp/frontier-ea04-healing-warning-audit.json`: E4 warning5871 at3/21; E7 warning11114 (before ledger window start) at23/29; E11 warnings15000/15001/15002 at30/33; E12 warning15803 at14/35. New12KB provenance fixture preserves exact final result-state observations5873/11115/15003/15804 and original warning records plus source events SHA.
- Native-window test attempts1–3 failed because the first extraction used pre-warning states (some transitional/locked), then because final recorded states omit richer heal/trainer facts. Corrected extraction uses the exact post-warning/pre-tool_result state and preserves the missing facts rather than filling from adjacent snapshots. Six production tests now pass (`/tmp/frontier-m4-native-windows4.log`), TypeScript passes. E4 danger survives; E7/E11 minor damage yields no new warning; E12 context remains unknown in that sparse final snapshot. Separate qualified14/35 production case proves warning retention when context is available. This is no claim that all historical context was durably recorded.
- Catalogue correction integrated as e064f7f41: actual owned-context metadata, normalized future fixedpoint proof and current collapse+note semantics. Historical fixedpoint note-OFF instruction retained and its contradictory trial design explicitly blocked; no historical switch semantics or effective experiment arms changed.

- Normalized recipe audit found four inherited bundle switch lists still enabled story-battle-heal-gate-v1, contrary to this approved worklog's explicit OFF choice. Existing factual-healing guidance currently bypasses that gate, but the effective bit must also match the contract. Added regression requiring OFF in every normalized arm; RED4 failures/12 pass (`/tmp/frontier-heal-gate-config-red.log`). Fix will remove only that inherited bundle bit, keep base/control false and preserve all new treatment ON bits. No mechanism semantics or historical control-base file changes.

- Heal-gate configuration GREEN: all16 normalized bundle/pending tests pass (`/tmp/frontier-heal-gate-config-green.log`). Four future switch-list removals only; all base/control values remain false, historical control-base files untouched. Current branch explicitly enforces worklog story-battle-heal-gate OFF rather than relying on another switch's bypass.

- Generic M3 packet integrated as626557d21 plus format/type-only followups: static-npc-template-approach-v1 reads current-map, hide-filtered scripted stationary placements, never live presence; dedicated static_object intent cannot auto-activate if the object loads. Native47c3 archived RAM proof,20 Python/90 semantic/7 viewer focused checks, deletion/restore and headless pixel receipts are in static-NPC child worklog. Parent corrected recipe scope to the six active future bundle definitions and restored three obsolete recipes byte-for-byte to prepacket.
- Generic registry append required one more historical fixture migration: default-off server environment gains the new ID, current registry positions shift by one, frozen historical comparison vectors explicitly exclude only the new treatment. Initial integrated agent46 fixture failures→10→4630 passing; viewer114 diagnostic failures traced to stale compiled agent package before rebuilding, not accepted as final gates. Python29 fixture failures being corrected (server ordering/defaults/forwarding and exact historical new-switch-OFF snapshots). No assertions/coverage thresholds skipped.
- New delivery-owner qualification integrated: checked stride, loss and coherent-heal tool results reach the next pinned-pi request and durable RunRecorder event; exact ea04 delivered historical place quote reaches both requests through production contextTools and ledger_context. Existing Activity History/raw-inspector/replay folding preserves these exact producer texts. No timeline additions. Frozen isolated headless replay at childbb1b6d873 verified seven served asset hashes, selected raw JSON and start/end cursor behavior with no page errors; explicitly synthetic rehearsal, not main/live or gameplay benefit.

### Integrated implementation status before final review

- M1–M6 code is implemented with eleven independent new default/control-OFF treatments, future bundle ON. Existing fixed-point treatment is bundle ON with its historical collapse+note semantics. All six future recipes explicitly set story-battle-heal-gate OFF in both arms. Deterministic acceptance checks do not claim a completed gameplay trial.
- M3 trainer-template contract remains separate from generic stationary non-trainer approach. Generic request intent, readout, prompt, schema and auto-dialogue boundary are switched together; current presence is never inferred.
- M4 final production case matrix8/8 passes: exact available ea04 snapshots, minor/severe HP, full-HP/no damaging PP, fainted teammate, unknown ownership/HP, unavailable healing-place evidence, unchanged-profile deduplication and map detour. Source snapshots missing richer context remain unknown.
- M5 section alternatives repeat delivered qualified terrain facts rather than compute a hidden route. Source map display/name provenance is retained, not a general rewrite of map labels.
- M6 audit is complete for the three cited training windows; no new training-cycle treatment justified. The original literal explorer v1/v2 swap is replaced by one independently testable selector, preserving old switch semantics.
- M7 preparation catalogue and one-bit blocked definitions are complete. A launch-ready study is intentionally NOT complete: checkpoint hash/load/context, post-start primary/exposure, matched cap/baseline, operator budget, power/N and numeric margins require a later approved design. No trial, probe, queue approval or incumbent promotion occurred.
- Three obsolete bundle-cook4h/6h/6h-v2 files restored to prepacket; historical control-base hashes untouched. Current generated arm validation uses offInBoth for the explicitly disabled heal gate, retaining strict frozen-control provenance checks.
- Latest component passes:4630 agent,1755 viewer,3975 Python (zero skips). These are diagnostic component runs; final same-tree just test/lint/build/coverage/vendor and frozen review follow after source-pin commit.

- Complete eleven-treatment implementation source commit:93f46ce6a. All eleven blocked pending entries now pin `93f46ce6a70197e2901c78ec7a0bde0b3cfc9ded` instead of their stale planning/child bases; full future-bundle vectors and one-bit treatment deltas preserved. No approval, queue position, external cohort or launch written.

### Final gates (source7f7a32dda, synced maina0c3d6138)

All required gates pass on the clean complete implementation tree: just test4632 agent +1755 viewer +3975 Python =10362, zero skips; just lint TypeScript/ESLint/Ruff/mypy115 files; just build clean stamp7f7a32d; just coverage above90 for each required metric; just verify-vendor clean pinned bbab97ad73e460b7cd7c08527d10ced30cc03fbe. No gate threshold/exclusion change.

| Stack | Lines | Branches | Functions |
|---|---:|---:|---:|
| Agent |99.20%|93.21%|97.77%|
| Viewer |97.96%|91.43%|94.43%|
| Python |97.40%|93.46%|100.00%|

Durable gate receipts and SHA256 manifest: canonical ignored runs/reviews/2026-10-22_frontier-mitigations-r1/gates/ and gate-metadata.json. This worklog-only evidence update does not alter tested application code. Rebuild its clean stamp before final background card proof and freeze the exact review tip. All eleven tracked explainers plus catalogue and static study page pass local pages-check; game source remains clean731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. Independent cloud review and main landing remain pending.

### Round 1 review and bounded fix batch

Frozen review a0c3d6138→df25ebcd3, binarydiff SHA2567aed193e3ba8490a49aff0d118b7afa711eecff6c6b3d75ec87880857c8cf9b0: Claude BLOCKING, independent fresh no-history GPT5.6-sol/xhigh BLOCKING, distinct Sol6.1/high and Astra6/high fallback BLOCKING. All independently verified clean immutable HEAD/digest. Full reports, exact repros and mandatory nine-check synthesis: canonical ignored runs/reviews/2026-10-22_frontier-mitigations-r1/.

Grok4.5 and discovered alternate4.7 Cursor attempts both rc1 with ActionRequiredError out-of-usage and no verdict. Operator blanket approval relayed verbatim via Codex coordinator (claim6933, original Claude project message [private message reference]): “land without grok. you are not a very good coordinator if you force me to go into chats”. Relay explicitly authorizes all waiting Codex branches to land with Claude+GPT+distinct fallback LGTM while Cursor usage is exhausted. Record reduced vendor diversity; never count failure as Grok approval. No local inference review.

Four unique accepted in-contract fixes, all within original production paths:

- Restore historical4h/6h/6h-v2 recipes to exact a0c3d6138 bytes. Earlier “restored prepacket” statements only undid the generic static-NPC subpacket; three earlier treatment bits still remained. That claim was incomplete. New tests separately verify exact SHA256 and normalized both-arm OFF for all eleven IDs. True RED6fail17pass, GREEN23pass; /tmp/pb-redacted-id-historical-{red2,green}.log. Historical run logs/control-base files remain unchanged.
- Template approach forwards existing trainer-sight v1+v2 checked options with confirm and no selected-trainer exclusion (approach is not asked-to-talk). Real navigation+semantic factory cases cover both kinds, unconfirmed/refused, clear, confirmed, requested trainer and existing flag-OFF combinations; zero A/facing. RED and exact forwarding deletion each8fail2pass, restored focused100pass; /tmp/pb-redacted-id-sight-*.log.
- New leader-loss game pages wait for matching successful tool-result ID/name; failure and pending receipts cannot claim delivery. Original battle attribution survives field completion, multiple batches remain four-page bounded. Exact native fd95 companion restores183 source dialogue rows/176 result receipt metadata/two full parser-coherent states, with source SHA/provenance; no fabricated historical success. Production dialogue finish→record→rejecting final observation is tested. Delivery guard deletion makes3 tests fail, then restored. Legacy EXP path and OFF text unchanged.
- Party membership and comparison align unique stable identities rather than slot order. Reordering the same party preserves available comparisons; changed/missing/ambiguous facts stay separate. Alignment deletion makes reorder regression fail. Same-path null-level regression RED1fail27pass; missing source/current/both now unknown, no legacy partyExp changes. Final training+delivery32pass; /tmp/pb-redacted-id-training-evidence.log.

Nonblocking follow-ups retained separately: shared old/new explainer font-src policy mismatch (readable Courier fallback; no CSP widening), delivered-memory convenience retention/sort metadata, stale fixedpoint test comment, extra in-memory place projection, and unproposed state-only/leader-loss combination. No new runtime/public/persistence/permission domain or production file added for review.

Synced main1990105e8 after reports-scroll and early-talk landed during R1. Merge preserves both existing/new flags, people-ledger header owner and delivered-place walk-away exclusion. Main’s three additional agent-only switches remain default OFF; frozen historical helper/explicit snapshots and registry positions reconciled without changing server registry offsets or strict current registry bijection. Diagnostic runs/command errors preserved under /tmp/pb-redacted-id-sync-*.log: initial48 failures, then32, then3, then4693 agent PASS; these are not final integrated gates. No coverage threshold/exclusion/assertion weakened, skipped tests or no-verify. Final same-tree gates and new frozen cumulative-fix review follow this batch.

Final headless UI proof at df25: qualified receipt and font follow-up in runs/mockups/frontier-mitigations-final/. Parent independently opened all11 feature contacts and3 catalogue contacts;33card viewport cases,44navigations and12disclosures at375/1280/1440 pass with explicit font/isolated-resource console qualification. Actual served bytes match build. Synthetic ended rehearsal only, not live8790/gameplay/activation. A new final-pin proof will follow fixes; no foreground apps/input, experiments, queue approvals or services changed.

### Round2 all-green review; required final main-prefix sync

R2 frozen base1990105e8→140a2ba73, canonicaldiff5d2c571cd921ba46f777fd0f1d7e35f5089af021f576648a6a8957e08b65f850: Claude CLI, fresh normal GPT5.6-sol/xhigh, distinct Sol6.1/high+Astra6/high fallback ALL VERDICT: LGTM. All independently reproduced exact pre/post HEAD/digest/clean tree; current gate hashes verified. Mandatory synthesis in canonical runs/reviews/2026-10-22_frontier-mitigations-r2/synthesis.md. Zero new blockers, zero production-path growth. Reduced vendor diversity/operator Grok waiver remains explicit. No third blocker-fix cycle is authorized or needed.

Exact-source R2 gates all PASS:4694agent+1772viewer+3975Python=10441,zero skips; TypeScript/ESLint/Ruff/mypy115files;build;vendor. Lines/branches/functions agent99.20/93.31/97.78,viewer97.97/91.44/94.44,Python97.40/93.46/100. Initial stalecompiledagentdist18viewer failures preserved separately; required build first repaired dependency artifacts on unchanged source, all gates rerun. No code/test suppression. Final140a headless receipt:33cards/44navigations/12disclosures at3widths,72shots,allservedhashes match,parent independently opened all11feature+3cataloguecontacts. Knownsharedfontfallback+scratch404/503 disclosed,0JSerrors,notcleanconsole or actualactivation.

Main advanced during R2 to3d5cc66e6 (prefix code0cde4c948) after coordinator requests. The existing agreed overlap requires sync-only gates/review before ff landing. Merged existing default-OFF rejected-movement-prefix-v1 with exact precedence prefix>stride>step/guard; future eleven-treatment bundle policy unchanged and no unrelated prefix promotion. No M1–M7 mechanism expansion. Current source preserves independent PrefixRules and stride switch, existing currentregistry/default/control/historical snapshots. Parent reconciled prefix append in frozen legacy tests without altering server indices.

New actual factory crossflag cases:prefix/stride/step/guard, sourceprefixOFF whole-result parity. Focused37pass; removing prefixdispatch makes1precedence test fail, restored37pass;scopedlint+agenttscPASS. Evidence /tmp/pb-redacted-id-prefix-stride-{green,deletion,restored,lint}.log. Parent diagnostic fullagent4723PASS,zero skips (/tmp/pb-redacted-id-r3-agent1.log); final integrated clean-source gates and sync-only review still pending. All four prior accepted fixes remain unchanged. Work remains on ownedbranch; main landing/liveviewerproof still separate. No experiments/probes/approvals/current-run/model/GPU/service/foreground operations.
