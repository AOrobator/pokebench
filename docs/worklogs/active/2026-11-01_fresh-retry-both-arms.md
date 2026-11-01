# Fresh retry in both arms

**Started:** 2026-11-01
**Status:** In progress (RED then GREEN on branch)
**Branch:** `claude/fresh-retry-both-arms`
**Worktree:** `/private/tmp/pb-fresh-retry-both`

## Problem Statement

`2026-11-01T01-37-02_hyperqwen-gpu0_7da5` (872 turns) recorded 286 retries with reason
`reply hit max_tokens` and 552 `loop_breaker` events with trigger `no_tool_call`. 246 of the 488
turns after the last milestone produced no tool call at all, and median thinking grew from 1,458
chars (turns 0-149) to 25,545 chars (turns 450-599) against an 8,192-token reply cap.

`fresh-retry-v1` exists for exactly this failure: when a reply calls no tool, the retry is sent
without that reply, so the model reads its last tool result plus the nudge instead of re-reading its
own truncated answer and reasoning. It was defined but off in both arms, so the truncated ramble
was appended back into context and re-read on every retry, compounding.

Measured before-state, from the files themselves:

- `packages/agent/src/features.ts`: `guard("fresh-retry-v1", ...)` — registered, default OFF.
- `experiments/feature-configs/current.json`: `"fresh-retry-v1": false` in `features`, absent from
  `switches`, `offInBoth` and `onInBoth` (the brief's "none of them" holds for the three role lists;
  the `features` dict carries the explicit `false`, which is the registry default spelled out).
- The live read on the retry path: `packages/agent/src/play-wiring.ts:94`
  `const inner:Transform=features["fresh-retry-v1"]?messages=>chain(withoutTextOnlyReplies(messages)):chain;`
  and the probe path `packages/agent/src/decision-probe.ts:440`. `packages/agent/src/play-wiring.test.ts:61`
  already proves the flag changes the request (text-only replies kept when off, dropped when on), so
  the switch is not dead config.

## Mechanism Chosen

`onInBoth` — the recipe's existing role list for fixes that are on in both arms, plus
`features["fresh-retry-v1"]: true` because the band's base features are what `armFeatures` merges
into both arms (`packages/viewer/src/fixed-design.ts:187-193`). No new schema field:
`FeatureRecipeSchema` already carries `onInBoth`, `feature-config-registry.test.ts:17` requires every
`onInBoth` id to be `true` in `features`, and `controlBaseProblems` (`fixed-design.ts:298-302`)
exempts `switches ∪ offInBoth ∪ onInBoth` from the byte-pinned control-base comparison — so this is
the supported way for a fix to reach the control arm without drifting the pinned preset.

The control arm is not a frozen behavior baseline in this respect: it is the pinned
`whole-map-bundle-fd95` preset plus whatever the recipe's role lists say, and `onInBoth` is the
sanctioned "both arms" role. `fixed-design.test.ts:143` already used `onInBoth: ["fresh-retry-v1"]`
as the example of a both-arms fix, which is why the flag is the right one to promote here.

Diff (2 changed lines, 1 added, 0 removed in body terms):

```
experiments/feature-configs/current.json
-  "fresh-retry-v1": false,          ->  "fresh-retry-v1": true,
~  "moving-npc-frame-burst-v1"       ->  "moving-npc-frame-burst-v1", "fresh-retry-v1"   (onInBoth append)
```

## Invariants

- **INV-1:** every definition that reads `featureRecipe: "current"` resolves `fresh-retry-v1` on in
  the control arm and in the bundle arm, through `readFixedDefinition` + `armPreset`/`presetFeatures`
  (the real loader), not by reading JSON. Test: `packages/viewer/src/fresh-retry-both-arms.test.ts`.
- **INV-2:** the flag stays out of `switches` and `offInBoth`, so no arm can lose it by a switch flip.
- **INV-3:** `DEFAULT_NEXT_RUN` keeps the registry default OFF — a fresh run does not silently change
  behavior; only the recipe's arms carry the fix.

## Milestones

**M1 — RED**
- [x] Test written against the unchanged recipe; fails on all 7 current definitions
  (`expected [ 'gym-door-label-v1', …(75) ] to include 'fresh-retry-v1'`), passes on the 2 coverage
  and default-off cases: `7 failed | 2 passed (9)`.
- [x] COMMIT `48fa55bd6` `test(viewer): require fresh-retry-v1 on in both arms`

**M2 — GREEN**
- [x] `features["fresh-retry-v1"]: true` + `onInBoth` append in `experiments/feature-configs/current.json`
- [x] Focused: `fresh-retry-both-arms` + `feature-config-registry` + `fixed-definition` +
  `fixed-design` → 97/97 PASS (4 files)
- [x] COMMIT GREEN (this commit); recipe sha256 `bdfc7bf4275e…`
- [x] Full gates on the branch tip: all four below PASS

## Gate Figures

Run from `/private/tmp/pb-fresh-retry-both` on the GREEN tree (JS rebuilt at `48fa55b`):

| Gate | Result |
| --- | --- |
| `just build` | PASS — agent `tsc -p tsconfig.build.json`; viewer build + stamp `48fa55b` |
| `just lint` | PASS — `pnpm -r lint`, ruff check + format, mypy, mypy --strict claude-gateway (`no issues found in 137 source files`) |
| `just test` | PASS (exit 0) — agent 5319 tests (96.43% stmts / 92.47% branch / 97.5% funcs / 99.07% lines), viewer 185 files / 2416 tests (94.61% / 90.83% / 94.93% / 98.28%), env pytest 4979 passed `lines 97.50% branches 93.60% functions 99.90% (floor 90.00%)`, claude-gateway 116 passed `lines 99.12% branches 96.22% functions 100.00% (floor 90.00%)`, trainer cards 3 passed |
| `just coverage` | PASS (exit 0) — same single pass: agent 5319 tests (96.43 / 92.47 / 97.5 / 99.07), viewer 2416 tests (94.62 / 90.83 / 94.93 / 98.28), env `lines 97.50% branches 93.60% functions 99.90%`, claude-gateway `lines 99.12% branches 96.22% functions 100.00%` |

Every per-metric figure is ≥90 on both stacks.

## Session Log

- 2026-11-01: worktree created off `3623a82a4`; vendor submodule, `.env`, `just setup`,
  `just build-mgba`, `just verify-vendor`, `just verify-rom`. Confirmed the flag definition, its
  absence from the recipe role lists, and the live retry-path read in `play-wiring.ts`.
- 2026-11-01: RED `48fa55bd6` (7 failed / 2 passed). GREEN recipe change; focused 97/97.
- 2026-11-01: Real-loader proof outside vitest (`node` against `packages/*/dist`): all 7
  `featureRecipe: "current"` definitions report `onInBoth: true`, `switches: false`,
  `offInBoth: false`, `baseFeature: true`, and `control:armFeatures` / `bundle:armFeatures` both
  `true` with every phase `true,true`.

## Surprises

- A fresh worktree fails `just trainer-card-check` with `Approved font/art did not load` until
  `just trainer-card-art` builds `runs/sprites/trainer-card-v1` (ROM-derived, gitignored). Not
  caused by this change; the setup brief does not mention it.
- `just test` failed once on `viewer server › keeps the downstream socket open after a successful
  send callback` (`received only 2 frames`) while the two live benchmark runs were saturating the
  machine; that test passes alone (180/180) and the next full run was clean.
- `fixed-design.test.ts:143` already used `onInBoth: ["fresh-retry-v1"]` as its both-arms fixture,
  so the recipe was the only thing missing.

