# Worklog: control arm reply cap 4K → 8K

## Problem Statement

The control arm runs at a 4096-token reply cap while the bundle arm runs at 8192
(`bundleMaxTokens` in every paired definition). On the 24h control
`2026-11-01T09-10-00_deepseek-v4.1-flash_control24h` (3964 turns, ended
`operator_abort` in Lavaridge Gym) the cap was the single largest turn killer:

- 940 turns (24%) ended with `retry reason: "reply hit max_tokens"`.
- Of those truncated turns, 2% still produced a tool call and 74% ended in a
  `no_tool_call` loop breaker.
- 1849 `no_tool_call` breakers over the run (47% of turns); 577 of them on turns
  that were *not* truncated.

A truncated reply is not a wasted token, it is a wasted turn: the model spends
its budget on thinking and is cut off before it can emit the tool call.

Because the bundle also carries 64 extra switches, "bundle at 8K vs control at
4K" compares a switch difference and a cap difference at once. The cap is not a
switch, so it should not be measured as one.

## Operator directive (2026-11-02)

- "Let's adjust the control arm so that thinking goes to a K" → 8k.
- "Don't touch the thinking level."

## Change

`packages/agent/src/play-config.ts`

- `PLAY_MAX_TOKENS` 4096 → 8192. This is the cap every ordinary play run gets
  when no preset supplies `sampling.maxTokens` (`live.ts:294`,
  `Math.min(PLAY_MAX_TOKENS, model.maxTokens)`).
- `PLAY_THINKING` deliberately unchanged at `"medium"`.

`packages/agent/src/play-config.test.ts` pins both facts, so neither the cap nor
the thinking level can drift silently:

```
it("gives the control arm an 8K reply cap without changing the thinking level")
```

## Scope and non-goals

- No feature switch is added, changed, or promoted; `experiments/feature-configs/current.json`
  is untouched.
- Preset-launched runs are unaffected: `live.ts:294` prefers the preset's own
  `sampling.maxTokens`, and `live.ts:292` rejects a preset above the model limit.
  A relaunch under the old `current-control-24h` preset still runs at 4096;
  that preset would have to carry 8192 itself.
- Fixed definitions keep their explicit caps: `armPreset` reads
  `base.sampling.maxTokens` for control and `bundleMaxTokens` for bundle.
- The model limit is not the binding constraint: the live lane reports
  `max_tokens: 1048576`, so `min(8192, 1048576)` binds at 8192.

## Verification

- `npx vitest run src/play-config.test.ts src/play-wiring.test.ts` → 22 passed.
- `just lint`, `just build` → green.
- Full `@pokebench/agent` suite run sequentially (`--no-file-parallelism`).

## What to watch in the next control run

Primary: `no_tool_call` loop breakers per 100 turns (47 in the aborted control).
Secondary: `retry reason: "reply hit max_tokens"` count (940) and whether the run
clears Lavaridge Gym at all — the aborted control spent its last 1263 turns
inside it.

## Promotion: the cap now belongs to the arm, not just the default (operator "yes", 2026-11-02)

The 8K change above only reached runs that carry no preset, and every control run
carries one, so on its own it changed nothing that is measured. Promoted:

- `experiments/presets/current-control-24h-8k.json` — the 24h control arm at
  `maxTokens: 8192`, thinking `medium`, boot start, `target: null`, 20000 turns /
  86400000 ms. Its features are the control arm of
  `experiments/feature-configs/current.json`, so the aborted 4096 control and this
  run differ in the cap, not in a switch.

`packages/agent/src/control-preset-8k.test.ts` pins the cap and the thinking level,
pins the features to the recipe so the preset cannot drift off the arm, and pins the
frozen fixed-run base at 4096.

### Why the fixed-run control base stayed at 4096

Repointing `experiments/feature-configs/current.json` at an 8K control base was the
first attempt, and the full suite rejected it: 54 tests failed with `base sampling
differs from the control base`. `materializeFixedSource` takes `controlBase` from
the recipe but keeps `base.sampling` from the definition, so moving the recipe's
pointer retroactively re-points all 8 feature-referenced definitions
(`bundle-v-control`, `bundle-v-control-2h`, `glm53-*`, `hyperqwen-*`, `qwen36-*`)
while their recorded `base.sampling` is still 4096, and their `fixed-run check` fails.

Their comparisons are already recorded at 4K, and this worklog's scope keeps fixed
definitions on their explicit caps. Moving them to 8K means re-authoring those eight
definitions as new ones rather than editing frozen plans, which is a separate
decision and not part of this promotion.

Launching is unchanged: `just run-agent` with `POKEBENCH_PLAY_PRESET` on the
promoted preset. The run launched under this worklog
(`2026-11-02T06-25-22_deepseek-deepseek-v4.1-flash_53be`, commit `6522d1084`,
`harness.dirty: false`) records `max_tokens: 8192`, `thinking_level: medium` and
`max_wall_ms: 86400000` in its `run_start`.

### Review and gates

Operator waived the three cloud review lanes for this change on 2026-11-02 ("cloud
models are waived since i'm outta tokens rn"), so the landing rests on a self-review
of the diff rather than on Claude/Grok/GPT verdicts.

Self-review: the preset is a version-2 control arm — no switch id on, no `offInBoth`
on, all 84 `onInBoth` on, and its feature keys are exactly the recipe's. `sampling`
is `medium`/8192 (the thinking level is unchanged), limits are 20000 turns and 86400000
ms, start is omitted so the run boots, and `parsePlayPreset` accepts it. The worklog
change is additive and alters none of the earlier record.

Gates: `pnpm -r coverage` green (viewer 94.53% statements, 90.77% branches; the agent
package ran first and passed). The Python env suite fails in a fresh worktree only
because `.env` with `POKEBENCH_ROM` is gitignored; with the ROM exported the suites
that failed there pass 56/56 in the main checkout. `just test` on `main` after the
merge is the activation gate.
