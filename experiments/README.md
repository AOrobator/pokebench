# experiments

Run configurations: play presets for single runs, fixed-N experiment definitions, and the feature recipes they share.

## Folders

- [`presets/`](presets/): play presets for one ordinary run with `just run-agent`. Examples: [`current-control-24h-8k.json`](presets/current-control-24h-8k.json) (the current control recipe), [`opus-rayquaza-lane.json`](presets/opus-rayquaza-lane.json) (the Rayquaza lane, a knowledge-assisted custom lane), [`screenshot-button-baseline.json`](presets/screenshot-button-baseline.json) (a 30-minute baseline).
- [`fixed/`](fixed/): fixed-N, two-arm experiment definitions for `just fixed-run`, one file per experiment id, e.g. [`bundle-v-control.json`](fixed/bundle-v-control.json), [`rayquaza-lane-24h-v3.json`](fixed/rayquaza-lane-24h-v3.json), [`whole-map-pair-1h-v8.json`](fixed/whole-map-pair-1h-v8.json).
- [`fixed/control-bases/`](fixed/control-bases/): frozen control-arm presets that definitions and recipes point to, e.g. [`whole-map-bundle-fd95.json`](fixed/control-bases/whole-map-bundle-fd95.json).
- [`feature-configs/`](feature-configs/): the maintained feature recipe [`current.json`](feature-configs/current.json), overlays on it such as [`rayquaza-lane.json`](feature-configs/rayquaza-lane.json), and frozen past versions of `current` in `archive/`. See its [README](feature-configs/README.md).
- [`archive/fixed/`](archive/fixed/): retired fixed-run definitions kept as historical records, with their original SHA-256 in its [README](archive/fixed/README.md).

## What a preset contains

A play preset (version 2, parsed by `packages/agent/src/play-preset.ts`) has:

- `id` and `target`: a native milestone goal, or `null`. Unless `stopAt` is set, the target is also the milestone that ends the run;
- `limits`: `maxTurns`, `maxWallMs`, `failureLimit` and optionally `replyFailuresEndRun`;
- `sampling`: `thinkingLevel` and `maxTokens`;
- `features`: the feature switches, each `true` or `false`;
- optionally `stopAt` (a milestone that ends the run, overriding `target`) and `start` (a `save_state` path plus its SHA-1; without it the run starts from boot).

The limits, `stopAt` (or `target` when `stopAt` is absent) and any run-ending switches are the run's configured stop conditions.

## How a run picks its configuration

- `just run-agent` reads the preset named by `POKEBENCH_PLAY_PRESET` (see [`.env.example`](../.env.example)). Without it, the run uses built-in limits.
- `just fixed-run <command> <id>` reads `fixed/<id>.json`. A definition holds shared `base` limits and sampling, its `phases` (each with a start save, a per-arm count and a wall-clock cap), the model lanes, and a seeded `plan` of trials. Many definitions name a `featureRecipe` (`current` or `rayquaza-lane`) that sets the switches for both arms. `just fixed-run preset <id>` prints one arm as a play preset; `just fixed-run check <id>` validates a definition.
- Every run records the resolved switch list and its hash in its `run_start` event.

## Feature switches

Every harness behavior change ships behind a registered feature switch whose off state is the previous behavior, so old and new behavior can be compared in a fixed-run experiment. [docs/features.md](../docs/features.md) lists every switch and its default.
