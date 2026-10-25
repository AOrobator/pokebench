# PokéBench evaluation rubric

Version: 0.1. Recorded 2026-10-25 from the operator's grading discussions and explicit instruction to save this specification. This is an evaluation specification, not an implemented grader or a change to the live milestone catalog. Dimensions and objectives are recorded; numerical anchors require calibration. There is no approved weighted composite.

## Objectives and headline measures

Gym badges are the headline progression and efficiency objectives. Instrumentation milestones explain where effort went; their count is not the score.

| Objective track | Completion evidence and reporting |
| --- | --- |
| Eight gym badges | Report each named badge separately, verified from native game evidence. Show cumulative turns from the common start, turns since the previous named badge, elapsed time, tokens and primitive actions. |
| Elite Four | Retain each member's verified defeat and the completed Elite Four sequence. Distinguish partial attempts, resets and later rematches. |
| Champion / whole-game completion | Retain Champion victory and separately verified completed League/Hall of Fame registration. Eight badges alone do not mean the game is complete. Exact native predicates and ROM mappings must be qualified before automatic grading. |
| Mission Ray-Ray: capture Rayquaza | An explicitly operator-approved optional objective, reported alongside story completion. Encountering, battling, defeating, seeing a cutscene with, or registering Rayquaza as seen is not a capture. Require evidence of a successful capture and corroborating ownership in the party or PC, with provenance excluding an inherited save or externally injected Pokémon. |

Rayquaza capture does not replace the Champion objective, become a prerequisite for game completion, or imply a prescribed route/order. Grade it whether achieved before or after Champion completion. This optional milestone is an explicit exception to the ordinary story-only objective policy. Recording it here does not add model guidance, select a route, change the viewer axis, or claim an implemented detector.

Headline per-objective results:

- Reach rate within fixed turn, time and token budgets, including failures and incomplete follow-up.
- Cumulative decision turns to the same named badge or terminal objective.
- Segment decision turns between named badges, with starting capability and prior history declared.
- Time, measured tokens, tool calls and primitive actions to the same objective.
- Completion reliability across independent runs, plus best demonstrated capability separately.

Do not use total turns divided by number of badges as the sole efficiency score: badges differ in difficulty, and that average hides stalls. A run with no badge still belongs in reach-rate denominators. Missing arrival turns are unavailable, not zero. Gym/trainer/script milestones remain diagnostic splits rather than rewards for a more finely divided catalog.

## Three separate scorecards

### Run performance: measured outcomes and costs

| Dimension | Required measures |
| --- | --- |
| Progress | Named badges, Elite Four sequence, Champion/Hall of Fame completion, Rayquaza capture, and supporting story events |
| Reliability | Reached / eligible / failed / unknown at common budgets; independent-run uncertainty |
| Decision efficiency | Cumulative and segment turns; failed-action repetition; turns in reviewed recovery episodes |
| Action efficiency | Tool calls, submitted inputs, native input intervals, automatic inputs, held frames and navigation work where recorded |
| Token efficiency | Input, output, reasoning and cache usage to each objective, separately when available; repeated context processing included |
| Time efficiency | Actual wall time and acknowledged active time; model serving, queues, tool/emulator and orchestration overhead on a non-overlapping accounting basis |
| Resource efficiency | Measured compute time, cost and energy; disclose measurement and estimation basis |
| Battle outcomes | Wins/losses, faints, whiteouts, rematches, battle turns, item/PP use and resulting readiness |
| Recovery | Frequency, duration, recurrence and downstream task progress; local control recovery separately |
| Autonomy | Human inputs, external/oracle consultations, model changes, delivered guidance and automatic execution |

A decision turn, model request, tool call and emulator input are different units. Automatic dialogue/navigation can lower turn count without lowering primitive action count. Compare turn efficiency under compatible tool and batching contracts. Tokens per second, turns per minute and objective efficiency answer different questions. Unknown usage is never zero usage; the interactive Codex bridge's zero counters are not measured model token consumption.

### Model behavior: evidence-backed grades

| Category | Positive evidence | Failure evidence |
| --- | --- | --- |
| Perception and grounding | Correct player/speaker/location/menu identification; uses uncertainty honestly | Invented facts; stale assumptions overriding delivered evidence |
| Goal understanding | Tracks game instructions and prerequisites; resumes goals after interruptions | Forgotten or contradicted goals; repeated wrong destination |
| Navigation and exploration | Useful exploration; changed approach after refusal; handles elevation, triggers and moving NPCs | Repeats rejected paths without relevant state change |
| Interface competence | Correct naming, confirmations, shops, bag/party use, move learning and evolution decisions | Intended acceptance becomes cancellation; assumes a press succeeded |
| Team assembly | Acquires complementary capabilities, develops and uses them | Collection without useful roles; repeated unresolved coverage gaps |
| Training and development | Productive experience, useful move/evolution choices, readiness improvement | Unchanged losing rematches; training that fails to address the limitation |
| Battle tactics | Defensible moves, targets, switches, status, items and escapes | Ignores relevant known mechanics; repeatedly dominated actions |
| Resource management | HP/PP/items/money/travel managed across encounters | Waste, avoidable depletion, failure to restore a limiting resource |
| Risk management | Accounts for accuracy, incoming damage, switching and future threats | Repeated unnecessary low-probability gambles |
| Learning and adaptation | Updates strategy when results contradict expectation | Repeats an unsuccessful plan after recognizing its failure |
| Long-horizon coherence | Retains goals and useful lessons across scenes/context changes | Repeated rediscovery; loss of commitments or accumulated state |
| Evidence-based recovery | Restores control, changes approach and resumes meaningful progress | Narrative claims or local movement without downstream recovery |

Team assembly credit follows acquire → develop → deploy → useful outcome. Six occupied slots are not intrinsically better than an effective small team. Do not require a preferred starter, species, move, route or play style.

### Team assembly: marginal value, roles and duplicates

Judge each acquisition and retention by what it adds to the existing team relative to its cost. Filling six slots earns no credit by itself, and duplicates are neither automatically good nor automatically forbidden.

For each catch, replacement, storage decision or retained teammate, annotate:

1. **Marginal contribution:** new usable damage/status coverage, defensive switch, utility/HM role, ability/item value, stronger replacement or a distinct redundancy benefit. Species diversity alone is not strategic coverage.
2. **Role feasibility:** verify the claimed move compatibility, ability, acquisition prerequisites and actual known moves. A potentially learnable HM is not an equipped/used capability. Do not reward invented mechanics or unseen route knowledge.
3. **Planning versus realized benefit:** record any contemporaneous supported role claim, actual acquisition/development and later use separately. An incidental useful result can earn outcome credit without proving deliberate planning. No mandatory verbose explanation or post-hoc rationale earns credit by itself.
4. **Cost and opportunity cost:** balls, currency, travel, capture/menu turns, training effort and party-slot capacity. Repeated low-value catches can consume scarce resources and crowd out useful roles; assess actual storage/replacement opportunities rather than assuming a full party permanently prevents catching.
5. **Development and deployment:** does the model train/equip/use the intended capability, adapt after it disappoints, or retain several weak overlapping members while the observed challenge remains unaddressed?
6. **Goal consistency:** collecting new species, increasing catch count and building a badge-winning team are different objectives. Another individual of an already-owned species does not add a new species to the Pokédex. A deliberate duplicate can still serve another supported objective.

A duplicate is defensible when its incremental role justifies its cost: for example an actual useful ability/resource strategy, distinct moves or a stronger replacement. Penalize unsupported redundancy and failure to address demonstrated weaknesses, not duplication as a blanket species rule. Conversely, one instance of each species does not automatically earn a high team score.

Evidence example (descriptive, not a calibrated numerical grade): Qwen3.6 bundle run `2026-10-24T19-31-52_qwen36-gpu0_9e33`, arm bundle/trial2, shows the later-owned six-member party at turn4855: Combusken20, Poochyena5, Zigzagoon6, Poochyena3, Poochyena3, Zigzagoon2. Additional Poochyena appear at turns567/586 (state seq17849/18370). At turn1699, assistant seq65145 states a plan to catch another Zigzagoon "to fill out my POKéDEX"; the already-owned species appears in the prior party, and the new identity appears at state seq65357/turn1706 after a Great Ball. No explicit Pickup or HM plan was found in the scanned recorded assistant rationale; this does not prove the model had no unrecorded intention. The two Zigzagoon later hold Escape Ropes, so retain possible realized utility separately from unsupported planning attribution. One Poochyena was actually used to weaken that later catch, which is evidence of a role, not proof that all three were necessary.

Emerald source `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, `src/data/pokemon/tmhm_learnsets.h` Zigzagoon entry, lists Cut, Surf and Rock Smash, not Flash; `species_info.h` lists Pickup. These source facts constrain grading of asserted mechanics; they are not instructions to the active player or proof that this run deliberately pursued those capabilities. Temporary tutorial-owned parties must be excluded from acquisition histories.

Initial grade anchors, to calibrate against adjudicated examples:

| Grade | Meaning |
| --- | --- |
| 0 | Persistent consequential failure despite sufficient available evidence |
| 1 | Frequent mistakes, weak autonomous correction |
| 2 | Functional ordinary play with material weaknesses in tradeoffs or recovery |
| 3 | Consistently sound choices, preparation and adaptation across observed opportunities |
| 4 | Robust performance across varied, difficult opportunities, with documented coverage |
| Not observed / ungradeable | No relevant opportunity or insufficient/materially defective evidence |

Report opportunity counts, coverage and uncertainty with every grade. One good action does not establish robustness. Keep knowledge correctness, decision quality and native execution separate. Longer or more persuasive reasoning earns no credit by itself.

Battle alternatives must account for damage/KO probability, accuracy, speed, stat changes, physical/special effects, setup, residual damage, healing, PP, switch-in risk and future encounters. Grade from information legitimately available at the decision, not unrevealed enemy state. Use a defensible set of actions unless a qualified game model establishes a unique optimum or measurable regret. Luck affects outcomes without retroactively determining decision quality.

Recovery after an unchanged full-health loss has a dedicated historical test: acquire relevant changed capability, return and use it. Leaving, announcing training or changing tiles is insufficient. Preserve strict versus eventual recovery and distinguish restored health from newly improved capability. This test is not a universal rule requiring departure after every loss.

### Harness quality: contribution and obstruction

| Category | Assessment |
| --- | --- |
| Observation correctness | Text, images and native decoded state agree |
| State coverage | Actionable menus, transitions, capture screens and battle states represented |
| Freshness | Pending actions do not silently cross into a different input owner without an explicit contract |
| Tool fidelity | Requested versus applied actions, refusals, truncation and outcomes accurately recorded |
| Memory quality | Persistent observed facts and instructions remain accurate; stale claims are identifiable |
| Feedback quality | False warnings, missed loops, delivered facts and demonstrated recovery |
| Assistance and agency | Privileged facts, semantic corrections, automatic actions and human/oracle input declared |
| Runtime overhead | Observation, recording, tool and emulator costs measured |
| Evidence integrity | Exact source/runtime/ROM/configuration identity, retained failures and native evidence |
| Measured benefit | Controlled reliability, efficiency and recovery comparisons; regressions included |

A model can recover well from a harness defect while that defect remains a harness correctness failure. Wire/schema validation differs from semantic assistance. Detector clearance alone does not establish recovery or prove a warning helped.

## Interpretation and comparisons

Publish completion, decision efficiency, token efficiency, speed, behavior and harness profiles together. Use a Pareto frontier rather than inventing one universal winner. Completion reliability and deepest meaningful objectives stay visible; fast early progress or optional activity cannot compensate invisibly for failure to finish.

Any future weighted total requires explicit objective, frozen weights and sensitivity analysis. Milestone-count ratios and progress-curve area are supporting diagnostics only, never substitutes for badge/League completion. Do not average ordinal grades or run ranks and imply a calibrated continuous measure.

Distinguish actual system speed from hardware-standardized workload projections. Faster hardware may lower serving latency, but it can change a continuously running game's observations and subsequent decisions. Re-costing a recorded trajectory is a conditional projection, not proof of how the model would play on another machine.

Grade a run as its configured system. Aggregate model claims require comparable cohorts across declared harness/start/runtime strata. Harness-effect claims require controlled comparisons. Best runs demonstrate possibility; repeated independent runs establish reliability. Preserve floor, distribution and best frontier separately.

## Status and companion documents

This document changes no prompts, model tools, runtime behavior, milestones, viewer design or active runs. No new metric or automatic Rayquaza/League detector is claimed implemented. Existing measurement support is defined by actual recorded evidence and compatible tooling.

- [Grading protocol](grading-protocol.md)
- [Decision history and sources](sources.md)
- [Existing metric definitions](../../.claude/skills/pokebench-cross-model-analysis/references/metrics.md)
