# open-goal-prompt: a goal sentence that names no town, gym or leader

Branch `claude/open-goal-prompt` in worktree `.claude/worktrees/agent-a435148d642abaf94`, cut from local main `4070e250`.

## Problem Statement

The operator, 2026-10-16 (project thread): "Why does it think that the lab is in Rustboro? I have a feeling that this is because of the system prompt where we're telling it to reach the first gym. That seems a little bit biased … Maybe we should just tell it to like play the game … that's something that I feel like we need to test."

Run `2026-10-16T12-42-29_qwen36-gpu0_4caa` T273, right after beating MAY on Route 103: "The dialogue indicated I should head back to the LAB (Rustboro City)." No text the game showed the model in that run names Rustboro (scan below). The system prompt's goal sentence is the only source: "…and work toward defeating the first Gym Leader in Rustboro City."

Coordinator change (the operator, 2026-10-16 ~2:55 PM): the switch goes in the BUNDLE ARM of bundle-v-control, not a standalone experiment. Keep it a default-off registered switch with its pending experiment entry. No full experiment-design page; a short "what to watch" note in the explainer is enough. `experiments/fixed/bundle-v-control.json` is not edited on this branch (coordinator owns it).

## Skills Loaded

feature-worklog, execute-worklog (incl. Landing on main), feature-switch, feature-explainer, experiment-queue, pokebench-experiment-design (read; overview dropped per coordinator change), close-the-loop, multi-model-review.

## Evidence (pre-registered diagnostic, not causal)

Scanner and per-run manifest (tracked): `docs/experiments/open-goal-prompt/scan.py` writes `manifest.json` (run, cutoff seq, cohort, start, wall cap, counts); `scan.py check` rescans every run to its cutoff and exits 1 on drift (`POKEBENCH_RUNS_ROOT=~/dev/pokebench/runs` from a worktree). Round 1 numbers came from scratch scripts while runs d32e/1f7b were still appending; the manifest (written 2026-10-16 ~3:50 PM New York) replaces them.

Scope: every model run started on 2026-10-15, or on 2026-10-16 before 3:00 PM New York (`STARTED_BEFORE` in scan.py), on lanes qwen36-gpu0, qwen36-gpu1, think-fast with a run_start and at least one turn: 67 runs, 33,307 turns. Every one had the Rustboro goal sentence in its system prompt. Game sources = tool-result text and dialogue_auto_advance pages; model = assistant thinking + text.

- Rustboro: no game source named Rustboro in any of the 67 runs. Model reasoning named it in 26/67 runs (900 turns), all before any game source.
  - cook bundle (MAIN_MENU start; 60-min cap, 12 min for 3f21): 11/12 runs, 736 turns. cook control (60 min, 12 min for 2919): 3/10, 15. factorial (CLOCK_SET, 30 min): 8/24, 144. finals (boot, 45 min): 4/9, 5. dry runs (CLOCK_SET, 2 min): 0/12.
  - Explicit "lab in/(Rustboro)" misplacement: 2 runs, 113 turns (think-fast 0875: "Professor Birch's lab in Rustboro City?", 112 turns; 4caa T273).
- Gym: the game first names a gym in Mom's TV line "Look! It's PETALBURG GYM!" in the player's house. Model reasoning named a gym before that in 8/67 runs (8 turns); 4 runs named Rustboro or a gym at turn 1 ("head towards the first Gym Leader in Rustboro City").
- When the game first names Rustboro: no recorded model run got there. The human run `human/2026-10-13T23-50-13_human_1848` first sees RUSTBORO CITY as Route 104's north map connection (00:20 AM, after WALLY_TUTORIAL_COMPLETE) and first hears it in Petalburg Woods dialogue ("…they were after something in RUSTBORO, too?", 00:32 AM). Older objective-tracking runs (10-12) only echo PLAY_GOAL through get_objectives.

Pre-registered: the diagnostic for the bundle arm is "turns whose reasoning names Rustboro before any game source did", per run, with `scan.py`'s rule; expected near zero with the switch on. It does not grade anything.

## Other Rustboro / Gym mentions the model can see

1. System prompt goal sentence (PLAY_SYSTEM_PROMPT and DOCUMENTED_PLAY_SYSTEM_PROMPT): replaced by the switch.
2. `PLAY_GOAL` (playGoal(null)): objective-tracking-v1's objective record goal (get_objectives/set_objective results) and the state-only-decisions-v1 system prompt. Off in the incumbent. Decision: the switch replaces it too, so "ON names no town, gym or leader as the goal" holds whatever else is on.
3. next-milestone-hint-v1 (`milestone-hint.ts`): names Petalburg Gym, Rustboro City, Rustboro Gym, Roxanne, one milestone at a time. Decision: leave it. It is a deliberate walkthrough treatment, off in the incumbent; neutralizing it would make it a different switch.
4. objective-tracking-v1 completion vocabulary (`NATIVE_OBJECTIVES`: RUSTBORO_CITY, RUSTBORO_GYM_COMPLETE …): tool schema enum, off in the incumbent. Decision: leave it (a grading vocabulary, not a goal).
5. Readout story lines (`story.py`: "Norman first meeting complete", "Rustboro Gym … defeated", "(after the Petalburg Gym TV report)"), character presence (ROXANNE only on RUSTBORO CITY GYM), interaction names ("Gym Sign"): each printed only once the game state or the current map already shows it. Game evidence; leave it. Confirmed by the scan: no tool result in 67 runs named Rustboro, and the first gym mention is Mom's TV line.
6. Other incumbent prompt sections (game evidence, navigate-first, readout rules, battle triage, trainer heal, explorer, untaken exits): no Rustboro, gym, leader or badge (checked against run 4caa's recorded system prompt). They name MOM, rival, Birch (naming confirmation) and POKéMON CENTER as game rules, not destinations; out of scope.

Grading never reads the prompt: milestones come from native game flags (`milestones.ts`, `story.py`), so the wording cannot move the grade.

## Architecture

- `open-goal-prompt-v1` (guidance, needs null, default OFF, agent-side only).
- `playSystemPrompt`: when ON and target is null, the goal sentence becomes `OPEN_GOAL_SENTENCE`. A target run keeps its target goal either way.
- `playGoal(target, features)`: ON with no target returns `OPEN_PLAY_GOAL`.
- Everything else in the prompt stays byte-identical.

## Milestones

### M1 switch + tests + explainer + pending entry

- [x] RED: tests for registry, presets, OFF = run 4caa prompt bytes, ON = one-sentence diff, playGoal, factory path, pending experiment (agent `open-goal-prompt.test.ts`: 9 of 10 fail; viewer `open-goal-prompt.test.ts`: 2 of 2 fail). Fixture `test-support/open-goal-4caa.json` = run 4caa run_start + T273 thinking.
  COMMIT: `test(RED): open-goal-prompt-v1 goal sentence without a town, gym or leader` (4f2834b0)
- [x] GREEN: implementation, explainer, FEATURE_EXPLAINERS, experiments/open-goal-prompt.json, readiness.md
  - `playGoal(target, features)`; `targetGoal(target)` for the decision probe's target-only path. Registry shift in 21 agent test files and 2 viewer test files is mechanical (negative indices +1, the new id OFF in ALL_ON-minus lists, guidance count 35→36, controls 88→89).
  - Wiring deletion check: removing the `else if (features["open-goal-prompt-v1"])` line turns 2 tests red (ON replacement, factory path); restored, 10/10 green.
  - Explainer checked at 1280×900, 1440×900, 375×812 and dark mode via a scratch static server (not 8791; runs/ left untouched). Fixed: bar labels clipped at the right edge; the decisions table squeezed at 375 (now stacks).
  - Worktree setup: `pnpm install`, `uv sync`, submodule init (`just verify-vendor` OK), `.env` copied from the main checkout, mgba binding copied from the main venv (mypy needs `mgba._pylib`).
- [x] Gates (pre-review tip): `just test` vitest agent 1890/1890, viewer 974/974, pytest 2465 passed; `just coverage` agent 97.99/94.7/98.4 (stmts/branches/funcs), viewer 95.41/91.17/93.79, python lines 97.52 branches 93.55 functions 100 (floor 90); `just lint` clean; `just build` clean; `just experiments-check` ok (79 experiments).
- [x] Synced with main at 4c805958 (merge, no conflicts). Gates on the merged tip: `just build` ok; `just test` agent 1890/1890, viewer 996/996, pytest 2465 passed; `just coverage` agent 97.98/94.69/98.33/99.14 (stmts/branches/funcs/lines), viewer 95.54/91.3/93.89/97.74, python lines 97.52 branches 93.55 functions 100 (floor 90); `just lint` clean; `just experiments-check` ok (79).
- [x] Principles self-review (docs/agent-principles.md):

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | Grading untouched; milestones still come from native flags. The diagnostic is labelled mechanism-only and grades nothing. |
| PB2 | PASS | No run-accounting change; the diagnostic counts every run in scope (67), short dry runs included. |
| PB3 | PASS | No improvement claimed; pending experiment uses 8 per arm; counts reported as descriptive with the cohort confound named. |
| PB4 | PASS | Behavior change is a named switch recorded in `harness_features`, default OFF, ablatable. |
| PB5 | PASS | One variable (the goal sentence, plus the same goal in objective/state-only paths); hypothesis in experiments/open-goal-prompt.json and the worklog. |
| PB6 | PASS | Prompt is shorter by a few words; no context growth. |
| PB7 | PASS | Prompt and switch recorded in run_start (system_prompt, harness_features); evidence from events.jsonl only. |
| PB8 | N/A | No tool-call or retry path touched. |
| PB9 | PASS | Bundle placement and no standalone design came from the operator via the coordinator; bundle-v-control.json not edited (owner edits it). Replacement wording is the operator's own suggestion. |
| PB10 | PASS | No skipped tests, no threshold or exclude change, no --no-verify; registry test shifts are mechanical index updates. |
| PB11 | N/A | No dependency integration changed. |
| PB12 | PASS | ROM only via POKEBENCH_ROM (`.env` copied, not the ROM). |
| PB13 | PASS | RED→GREEN commits with worklog updates; gates on the merged tip; review below. |

Zero FAIL rows.
- [x] Main moved to e349269c (depth order) before sealing; merged again (no conflicts). Gates on that tip: build ok; test agent 1893/1893, viewer 1002/1002, pytest 2465; coverage agent 97.99/94.7/98.4/99.14, viewer 95.56/91.32/93.91/97.75, python 97.52/93.55/100 (floor 90); lint clean; experiments-check ok (79).
- [ ] Review: Claude, Grok cursor-grok-4.5-high, Codex gpt-5.6-sol; synced with main before the final round

## Multi-Model Review Log

- 2026-10-16 3:27 PM New York: Round 1, packet `git diff --binary e349269c 7f524333` (SHA-256 0d35d2ae…1061), boundary and prompt in scratchpad `ogp-review/`. Claude (`claude -p --permission-mode plan`, default login): VERDICT: LGTM (hardening: no whole-prompt check for a bare "gym"; provisional source.commit). Grok (Cursor `cursor-grok-4.5-high`, `--mode ask`): VERDICT: LGTM (hardening: GOAL_SENTENCE literal duplicated in PLAY_SYSTEM_PROMPT; FeatureSetSchema Exclude cast; counts in scratch scripts). GPT (isolated `codex exec -m gpt-5.6-sol`, xhigh, read-only): VERDICT: BLOCKING. B1 the incumbent omits the cook arm's MAIN_MENU start and the test compares features only; B2 source.commit is the RED commit (no entry, no wiring); B3 diagnostic counts not reproducible (logs still appending, scratch scripts) and the "60 min" cook label is wrong for 2919/3f21 (12 min); B4 no viewer-route test for the explainer and no Harness Config click. All accepted (in contract: the boundary says the incumbent is the bundle arm and the evidence backs the explainer). Fixes: full-preset equality with `armPreset(bundle-v-control, "cook", "bundle")`, start and limits copied from it; source.commit pinned to the GREEN implementation commit 302b8c07 (contains the entry and the wiring; repinned to the merge SHA after landing per the experiment-queue skill); tracked `scan.py` + per-run `manifest.json` with cutoffs, explainer numbers recomputed (26/67 runs, 900 turns; bundle cook 11/12, 736) and a test deriving every explainer number from the manifest; viewer-route test (200, text/html, byte-identical, 403 host, 405 PUT, 404 near-miss); Harness Config click on a scratch viewer. Hardening taken: an ON-prompt test that no bare gym, leader or Rustboro remains.
  - RED b5dc2295: viewer test `incumbent is exactly the bundle cook arm` fails (start missing); manifest-derived explainer numbers and the route test pass on the corrected docs.
  - GREEN: incumbent limits/sampling/start from the cook arm (MAIN_MENU save b3a6cc1c, 3,600,000 ms), source.commit 302b8c07, ON prompt asserted free of rustboro/gym/leader/badge. Mutations: incumbent maxWallMs 3,500,000 → test red; blackout-readout-v1 false in the incumbent → test red; restored green. `scan.py check`: 67 runs, 0 drifted.
  - Harness Config click (close-the-loop): built viewer on scratch port 8833 against a scratch copy of run c205 (no experiments dir), PokéNav HARNESS CONFIG → OPEN GOAL card (NOT RECORDED for that run) → READ EXPLAINER navigated to /explainers/open-goal-prompt-v1.html, title "Open Goal Prompt". Scratch viewer stopped and the scratch runs root deleted. The 8790 viewer was not touched.
  - Pin: source.commit moved to d2613ced (the GREEN fix commit: wiring plus this entry as reviewed). The pin is repinned to the merge SHA after landing with `just experiment-pin`.
- [x] Main moved to 986cb496 (frontier legend); merged before round 2 (gates below).
  Gates on the merged tip (986cb496 merged): build ok; test agent 1893/1893, viewer 1006/1006, pytest 2465; coverage agent 97.99/94.7/98.4/99.14, viewer 95.57/91.33/93.97/97.75, python 97.52/93.55/100 (floor 90); lint clean after removing unused destructured names in the new viewer test (mutations of the start SHA-1 and of a bundle feature still turn it red); experiments-check ok (79); pages-check clean; scan.py check 0 drifted.
- [x] Main moved to 85d0ef48 (docs-only: run-analysis worklog archive, 1 file); merged before sealing round 2. Gates above stand: the merge adds no code.
- 2026-10-16 ~4:05 PM New York: Round 2, cumulative packet `git diff --binary 85d0ef48 429ee2fa` (SHA-256 3a69b52f…5f83). Claude (`claude -p`, plan mode): VERDICT: LGTM. Grok (Cursor cursor-grok-4.5-high): VERDICT: LGTM. GPT (isolated codex exec gpt-5.6-sol xhigh): VERDICT: BLOCKING. B1 `scan.py check` rescanned only manifest rows and never compared the eligible population, and runs 2026-10-16T15-45-24_qwen36-gpu0_4242 / _gpu1_f551 (started 3:46 PM) matched the stated "every run" scope; hardening: the FeatureSetSchema `Exclude<…>` type union lacked open-goal-prompt-v1. Both accepted (in contract: evidence claims). Fix: an explicit dataset cutoff `STARTED_BEFORE = 2026-10-16T15-00-00` (runs started before 3:00 PM New York; the manifest was first written ~3:50 PM, the round-1 scratch scan ~2:57 PM), `check` fails on any eligible/listed set difference (mutation: cutoff moved to 2026-10-17 → the two runs reported, exit 1), explainer and worklog scope sentences name the cutoff; the Exclude union names the switch.
  Gates after the round-2 fixes: build ok; lint clean; test agent 1893/1893, viewer 1006/1006, pytest 2465; coverage agent 97.99/94.7/98.4/99.14, viewer 95.57/91.33/93.97/97.75, python 97.52/93.55/100; pages-check clean; scan.py check 67/67, 0 drifted.
- [x] Main moved to e707ab88 (navigation-truth, navigation-refusal-reasons-v2 landed); merging before round 3.
  Conflicts (registry and the mechanical test shifts, readiness, README, panels, next-run) resolved by taking main's side and re-applying this switch's edits after navigation-refusal-reasons-v2; main then moved to 2c1befc7 (bundle-v-control: navigation-truth on in both arms, navigation-refusal-reasons-v2 in the bundle) and was merged too; the incumbent is regenerated from that bundle definition.
  Gates on the tip merged with 2c1befc7: build ok; lint clean; test agent 1961/1961, viewer 1008/1008, pytest 2498; coverage agent 98.01/94.6/98.35/99.24, viewer 95.57/91.34/93.97/97.75, python 97.55/93.60/100 (floor 90; the first coverage invocation stopped after the agent stack with no failure line printed, the rerun passed both stacks); experiments-check ok (82); pages-check clean; scan.py check 67/67, 0 drifted.
- [x] Main moved to 16a9787b (switch descriptions in the frontier legend, viewer only); merged before sealing round 3.
