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
