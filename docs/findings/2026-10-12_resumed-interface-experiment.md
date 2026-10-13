# Resumed contextual-interface prompting experiment — 2026-10-12

All twelve planned trials completed on one clean harness. Every trial hit the 30-minute cap; no trial obtained a starter or reached the first gym. Added interface documentation did not consistently resolve naming or early-game stalls. This is a small exploratory comparison, not a statistically established effect.

## Protocol

Frozen source `40262a0d86bd5430e10db1df5e8ae502f41d6a06`; three baseline and three interface-documentation trials for each registered model. Fresh boot, objectives enabled, 300 turns / 30 minutes, unchanged sampling/tool set/start state within each model. Six paired waves, one active trial per endpoint. Qwen order B/T/T/B/B/T; Swarm T/B/B/T/T/B. Actual run_start records checked through production parseEvent; source clean, arm feature, budgets and within-model signatures matched. Older failed/aborted cohort excluded. No gameplay interventions or silent reruns.

## Observed outcomes

Times below are elapsed from run_start; keyboard span is first ready naming observation to native name confirmation, including returns to the editor. Different chosen names and navigation behaviors are part of observed model variance. A dash means not reached, not zero.

| Model | Arm | Wave | Name | Keyboard span | Name confirmed | Truck exit | Clock set | Furthest | Press calls | Turns |
|---|---|---:|---|---:|---:|---:|---:|---|---:|---:|
| qwen | baseline | 1 | MA | 2:49 | 6:20 | 10:01 | — | PLAYER_BEDROOM | 49 | 68 |
| qwen | treatment | 2 | ACE | 0:55 | 4:50 | 8:45 | 17:38 | MOM_RIVAL_INSTRUCTION | 62 | 80 |
| qwen | treatment | 3 | BERN | 16:42 | 21:27 | 26:07 | — | PLAYER_HOUSE_ENTERED | 61 | 87 |
| qwen | baseline | 4 | AAAAA | 1:26 | 6:05 | 10:06 | 29:58 | CLOCK_SET | 57 | 75 |
| qwen | baseline | 5 | A | 1:00 | 5:11 | 8:37 | 20:15 | MOM_RIVAL_INSTRUCTION | 64 | 80 |
| qwen | treatment | 6 | BREN | 6:04 | 10:45 | 15:20 | — | PLAYER_BEDROOM | 61 | 79 |
| swarm | treatment | 1 | unavailable | 1:03 | 3:26 | — | — | PLAYER_NAME_CONFIRMED | 31 | 136 |
| swarm | baseline | 2 | A | 0:27 | 2:59 | — | — | PLAYER_NAME_SET | 132 | 147 |
| swarm | baseline | 3 | unavailable | — | — | — | — | NEW_GAME_CREATED | 81 | 95 |
| swarm | treatment | 4 | ASH | 2:47 | 12:41 | 14:36 | — | PLAYER_BEDROOM | 110 | 160 |
| swarm | treatment | 5 | RED | 0:44 | 3:13 | 5:37 | — | PLAYER_BEDROOM | 138 | 162 |
| swarm | baseline | 6 | AR | 1:15 | 4:51 | 28:03 | — | LITTLEROOT_TOWN | 77 | 98 |

## Per-arm completion and timing

Median/range is among runs that reached the milestone; missing completions are shown explicitly. Do not compare survivor times without the reached counts.

| Model | Arm | Name confirmed | Truck exited | Clock set | Naming keyboard median [range] |
|---|---|---:|---:|---:|---|
| qwen | baseline | 3/3 | 3/3 | 2/3 | 1:26 [1:00–2:49] |
| qwen | treatment | 3/3 | 3/3 | 1/3 | 6:04 [0:55–16:42] |
| swarm | baseline | 2/3 | 1/3 | 0/3 | 0:51 [0:27–1:15] |
| swarm | treatment | 3/3 | 2/3 | 0/3 | 1:03 [0:44–2:47] |

Starter, gym arrival, gym completion and Stone Badge: 0/3 in every arm. These distinct milestones were checked separately; no overall speedrun completion time exists for this cohort.

## Failure evidence and priorities

1. **Deterministic loop guards (authorized implementation next).** Swarm treatment6746 executed31 press calls, then95 objective-only calls after its last A at17:06:55 Eastern. Valid metadata calls consumed neither button-failure nor error-retry budget. The initial operator description of one long thinking turn was wrong: last game-state turn remained40 while actual agent turns advanced to136. Other trials cycled through movement/interaction attempts. These logs motivate bounded planning, observation, ineffective-action, short-cycle and repeated-rejection detection; they do not establish that guards improve gameplay.
2. **Post-naming UI phase and selected option (implementation authorized after this cohort).** Qwen treatment3746 spent16:42 in its first-ready-to-confirmation span, entering BERN repeatedly. Turn26A left naming;27B returned to gender; further B batches and name entry repeated. Returned phase was unknown callback0x0802F6B1 with unavailable menu owner. Recorded frame000712_0.png shows the returning Birch text still printing. Verified reference pokeemerald731ad5 main_menu.c Task_NewGameBirchSpeech_ProcessNameYesNoMenu sends B/NO back to gender. Cancellation of confirmation is the source-consistent cause; a phase/selection RAM fix still requires matching ROM ownership/address and coherent-frame qualification.
3. **Native objective completion (implementation authorized after this cohort).** Swarm treatmentee5b named its objective Set the clock but chose HOUSE2F location as completion. That condition proves reaching the room, not setting the clock. Native CLOCK_SET already exists; current completion-tool schema does not accept story/milestone conditions. Expose verified milestone completion rather than treating model wording as proof.
4. **Visible target labels and evidence checking (discussion only).** In ee5b the model called7,1 the clock although its local map and target list identified7,1 as the staircase warp to1F. Readout included unnamed background interaction5,1; matching source map.json names it WallClock. Clarify visible target labels/stand tile/facing before building a navigation solver. No new route or walkthrough is approved by these findings.
5. **Reduce wasted response round trips (discussion only).** Across first five completed trials per model, median turn_start→assistant intervals were15.71s Qwen and10.41s Swarm, versus1.51s/1.01s median game-tool time. These observed intervals include network, gateway, queue and inference; they do not isolate decoding or qualify a serving bottleneck. Avoid cancellation/replanning first, then compare context and safe action batching separately.

## Limits and receipts

All outcomes, errors and original logs retained. Native flags/events grade progress; model claims do not. No causal guarantee from N3 arms, no pooling with original source variants, no inference that simply extending beyond30minutes would fix the observed stalls. The forthcoming loop-guard harness is a separate experiment.

Operator receipts: `runs/launch-receipts/interface-docs-resumed/{manifest.json,analysis.json,progress.md,observer-notes.md,failure-priorities.md}` plus per-wave prompt captures and launch proof. Viewer recovery receipt records detached restart and HTTP200; exact previous viewer exit cause was not established. Final logs remain viewable under their recorded run IDs.
- Wave1 qwen baseline: `2026-10-12T17-02-42_Qwen3.8-Flash-Next-UD-IQ4_XS_eece`
- Wave1 swarm treatment: `2026-10-12T17-02-21_think-swarm_6746`
- Wave2 qwen treatment: `2026-10-12T17-32-45_Qwen3.8-Flash-Next-UD-IQ4_XS_dfd2`
- Wave2 swarm baseline: `2026-10-12T17-32-45_think-swarm_6a93`
- Wave3 qwen treatment: `2026-10-12T18-02-49_Qwen3.8-Flash-Next-UD-IQ4_XS_3746`
- Wave3 swarm baseline: `2026-10-12T18-02-49_think-swarm_e0a6`
- Wave4 qwen baseline: `2026-10-12T18-32-53_Qwen3.8-Flash-Next-UD-IQ4_XS_0a23`
- Wave4 swarm treatment: `2026-10-12T18-32-53_think-swarm_b9af`
- Wave5 qwen baseline: `2026-10-12T19-02-56_Qwen3.8-Flash-Next-UD-IQ4_XS_a4ee`
- Wave5 swarm treatment: `2026-10-12T19-02-56_think-swarm_ee5b`
- Wave6 qwen treatment: `2026-10-12T19-32-58_Qwen3.8-Flash-Next-UD-IQ4_XS_bc89`
- Wave6 swarm baseline: `2026-10-12T19-32-58_think-swarm_2c69`
