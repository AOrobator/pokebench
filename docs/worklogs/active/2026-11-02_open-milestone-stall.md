# open-milestone-stall — credit and brief the open leader loss

Operator instruction (2026-11-02): "so maybe a supervisor message when it's stalling with the next
milestone? do we not have something like that built already?" then "i think we should do both".

## Problem Statement

Run `2026-11-02T14-53-03_hyperqwen-gpu0_de7a` (`hyperqwen-bundle-24h-v3-cook-bundle`, 560 turns, 5h20m,
ended by the operator) reached ROXANNE at turn 339 with a TORCHIC at Lv14, lost on turn 342 in three
battle turns, and never re-entered the gym: no `battle_choice` on map 11/3 after turn 342. In the 218
turns that followed it gained one level on the starter (Lv14 to Lv15) and levelled a Wingull it caught
after the loss from Lv4 to Lv7, at roughly 120 EXP an hour.

The supervisor machinery was armed and did not close the loop:

- `stall-briefing-v1` + `turn-drought-clock-v1` fired once (turn 378, 17:53). Three later ticks
  (turns 177, 411, 466) were recorded as "Not sent (drought-progress-facts-v1) … but a battle is on
  screen" and each of those holds restarts the clock (`stall-briefing.ts` `settleHold`, `restart`).
- The clock's own progress vocabulary (any level-up, any trainer win, any full heal) was reset by the
  grind: capture at 18:02, Wingull 4→5 at 18:24, heal 18:37, TORCHIC 14→15 at 19:00, Wingull 5→6 at
  19:07, Wingull 6→7 at 19:25, heal 19:59.
- `unfinished-activity-v1` showed "Still open: ROXANNE … you lost at turn 342" in 153 results.
- `leader-attempt-ledger-v1` / `leader-loss-comparison-v1` render only on a gym map or at a leader
  battle decision, so a model that never goes back never sees them.

Two gaps, one cause: nothing measures progress **toward the open item**, and nothing banks a due note
through the battle hold instead of dropping and restarting it.

## Skills Loaded

- `.claude/skills/feature-switch/SKILL.md`
- `.claude/skills/feature-worklog/SKILL.md`
- `.claude/skills/pokebench-trace-forensics/SKILL.md` (the run read)
- `.claude/skills/pokebench-game-state/SKILL.md` (wording rules for the note)

## Architecture

Both switches read one new, inert record inside `StallBriefing` (`packages/agent/src/stall-briefing.ts`):
the open leader loss, captured from recorded state and `BattleOutcomes` only.

- Attempt capture: a state whose `trainer_opponent.battle_active` is true and whose
  `trainer_opponent.trainer_class` is `LEADER_CLASS` (already imported by `training-block.ts` from
  `gym-readiness.ts`) records trainer id/name, map and label, turn, and the party as the readout shows
  it at that moment (identity, species, level, experience).
- Open: the finished battle for that trainer id ends lost/drew or carries a whiteout (the rule
  `unfinished-activity-v1` uses). Retired by a later win against the same trainer id, or by the game
  showing its defeated flag set.
- `drought-progress-credit-v2` (A): while that record is open, a level-up restarts the drought clock
  only when the levelled POKéMON is one the record holds. Trainer wins and full heals still credit,
  unchanged.
- `open-milestone-stall-v1` (B): its own action counter, restarted only when the open record changes.
  Every 30 tool results it asks the loop guard for one supervisor note; a due note is not dropped by a
  battle hold, it is delivered at the next result with the field free (no battle, no unbeaten trainer's
  sight script, no open heal trip).

Both are model-facing readout changes, so both are switches with OFF reproducing today's bytes.

## Invariants

- `INV-1`: OFF for both switches reproduces the current plan, prompt, tools and readout bytes. Test:
  the existing `stall-briefing.test.ts` cases pass unchanged with both OFF.
- `INV-2`: the open record is captured from recorded state only; no ROM table, no route, no next step.
  Test: capture and retirement cases built from state fixtures.
- `INV-3`: a due open-milestone note is delivered at the first free field result after its threshold
  and is not restarted by the hold. Test: battle-on-screen at the threshold, field free two results
  later, note delivered on that result.
- `INV-4`: at most one note is outstanding; `LoopDetector.stall` already refuses while another note or
  episode is open, and the counter does not advance past the threshold while refused. Test: a course
  with an open drought note.

## Security Review

No new input surface, no shell, no network, no file writes. Read-only over recorded events; the note is
text. No walkthrough knowledge: the note names only what the game recorded (trainer, map, turn, party).

## Milestones

**M1 — Registry and OFF reproduction**
- [x] Tests: registry pins for both ids, OFF byte equality in `stall-briefing.test.ts`
- [ ] COMMIT: `test(agent): pin off behaviour for the open-milestone switches` (RED)
- [x] Registry (`features.ts`), preset schema + normalize + flag defaults, `next-run.ts` default OFF
- [ ] COMMIT: `feat(agent): register drought-progress-credit-v2 and open-milestone-stall-v1`

**M2 — The open record and switch A**
- [x] Tests: capture at a leader attempt, open on loss, retire on win or defeated flag; a level-up by a
  member captured at the loss credits, one by a member caught after it does not
- [ ] COMMIT: `test(agent): open leader record and level-up credit` (RED)
- [x] Implementation in `stall-briefing.ts`
- [ ] COMMIT: `feat(agent): credit level-ups toward the open leader loss`

**M3 — Switch B**
- [x] Tests: 30 actions with the record open produce one note; the note is held in a battle and
  delivered on the next free result without restarting; a second threshold produces a second note; a
  win retires the record and stops the notes
- [ ] COMMIT: `test(agent): open-milestone briefing` (RED)
- [x] `StallKind` + `Stall` union + `stallText` branch + `StallBriefing` counter
- [ ] COMMIT: `feat(agent): supervisor note while a leader loss stays open`

**M4 — Explainer, gates, review**
- [x] Explainer under `.claude/skills/feature-explainer/SKILL.md`, mapped in `FEATURE_EXPLAINERS`
- [x] Delete each wiring once, watch its test go red, restore, record here
- [x] `just test`, `just lint`; record pass counts
- [ ] Replay check against `2026-11-02T14-53-03_hyperqwen-gpu0_de7a`: with both ON, the post-loss
  window produces at least one note; with both OFF it produces exactly the recorded notes
  (the fixture tests below stand in for it until the harness can replay a recorded trace offline)
- [ ] COMMIT: `docs(worklog): open-milestone stall gates`

## Closing the Loop

- Both switches ship default OFF. Activation needs an operator-approved fixed-run comparison
  (`experiment-design`), not this change.
- Residual risk to record: switch A only removes credit for level-ups on POKéMON the loss did not see.
  A grind that levels the losing POKéMON on wild encounters away from the gym still looks like progress,
  which is intended (it is progress) and will not produce a note from A.

## Session Log

- Gates: `stall-briefing.test.ts` 21/21 (6 added), `features.test.ts` + `play-preset.test.ts` 77/77 together,
  `just build` clean (agent + viewer), explainers themed and `just pages-check` silent for both.
- Wiring deletion check: removing `&&this.credited(p.identity)` reddens "credits a level-up toward an open
  leader loss only for a POKéMON the loss saw"; replacing the `stall("open_milestone", …)` call with `false&&`
  reddens "briefs once on an open leader loss…" and "banks a due open-milestone note…". Both restored.
- `panels.test.ts` and `server.test.ts` gained the mapping and byte-for-byte serving cases.

### Final gates (2026-11-02)

| Gate | Result |
| --- | --- |
| `packages/agent` coverage | 381 files, 5402 tests passed; thresholds met |
| `packages/viewer` coverage | 184 files, 2421 tests passed; 94.6% statements / 90.8% branches |
| `just build` | agent + viewer clean |
| `just pages-check` | silent for both new explainers |
| `just lint` | agent + viewer clean; **9 pre-existing ruff errors under `env/`**, untouched by this change |

- The first full agent run under load showed 3 failures (`battle-text-auto-advance` press cap, two
  `whole-game-instructions` cases). All three pass alone (70/70) and the repeat full run is 5402/5402, so they
  are load flakes, not this change.
- `panels.test.ts` was not broken by this change and is not fixed by it either: it died at the default V8 heap
  ceiling (213 of 234 cases, `SIGABRT`, "Ineffective mark-compacts near heap limit") at HEAD too. Recorded, then
  repaired separately as `fix(test): theme pages on 3.14 and give the panel worker room` so the gate can run
  complete; the new mapping case runs with the rest.

- 2026-11-02: read `2026-11-02T14-53-03_hyperqwen-gpu0_de7a` (segments, milestones, retries, readouts),
  compared with `2026-11-02T02-55-21_hyperqwen-gpu0_07a7` (Treecko, won at turn 351) and
  `2026-11-02T15-53-23_deepseek-deepseek-v4.1-flash_80c8` (Mudkip, won at turn 222). Operator approved
  both switches.

## Surprises

- `scripts/pages.sh theme` was broken on this machine's Python 3.14: the embedded script annotated
  `re.Match[str] | None`, which raises `TypeError` at definition time. Added `from __future__ import annotations`
  to both heredocs; `just pages-theme` now runs.

- **A new switch must be `Type.Optional` in `FeatureSetSchema`.** Adding both ids to `SWITCHABLE_FEATURES`
  made them required in the generated play-preset schema, and every checked-in preset then failed
  `Invalid play preset: /features must have required properties …` (8 agent tests, 316 viewer tests). The fix is
  the documented one: exclude the id from the required `Object.fromEntries` map, add an explicit
  `Type.Optional(Type.Boolean())` line and the id to the `Record<Exclude<…>>` union, and let `normalizeFeatures`
  supply `false`. Historical presets stay byte-identical and therefore keep their pinned `sha256` values.
- `schemas/events.v1.json` is generated: adding a `loop_guard.kind` needs `just schema`, or `events.test.ts` fails
  on a stale checked-in schema.
- The drought clock fired once, not zero times; the suppression is what starved it, not the trigger.
- `drought-progress-facts-v1`'s hold restarts the clock rather than banking the tick, so a battle-dense
  grind can never mature it.

## Multi-Model Review Log

- Pending: reviewer pass after M3.

## Boy Scout Log

- `grep -n stall loop-detection.ts` finds nothing; `LoopDetector` lives in `loop-detection.ts` but
  `stall()` is inherited from `loop/coordinator.ts` and `StallKind` from `loop/types.ts`.

## Archive Milestone (user-gated)

- Not started.

### Landing

- Previous commit: `1a66af8ae` (tooling: page themer on Python 3.14, panel worker heap).
- Gates at landing: agent coverage 381 files / 5402 tests, viewer coverage 184 files / 2421 tests, viewer
  `test` 184 files / 2421 tests, `just build` clean, `just pages-check` silent, `just lint` clean for agent and
  viewer (the 9 remaining ruff errors are pre-existing under `env/`).
- Wiring deletions confirmed red before landing and restored.
- Not done here: the fixed-run replay comparison that would activate either switch. Both stay OFF in every
  checked-in preset.

