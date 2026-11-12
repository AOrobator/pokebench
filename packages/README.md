# packages

This folder is the pnpm workspace (`pnpm-workspace.yaml` lists `packages/*`) that holds PokeBench's TypeScript code.

| Package | Folder | What it does |
|---|---|---|
| `@pokebench/agent` | [agent/](agent/) | Plays Pokémon Emerald: drives a model through the game server's tools and records every step of a run. |
| `@pokebench/viewer` | [viewer/](viewer/) | Serves a local web viewer that reads the recordings, live or finished, and the CLI that launches runs and fixed-N experiments. |

## How they relate

The agent writes each run to `runs/<id>/`: an `events.jsonl` log (the record of the run) and a `frames/` folder of screenshots. The viewer reads those files and never writes `events.jsonl`; its run controls (pause, stop, abort, turn and time extensions) go to a separate `control.jsonl` that the agent reads. It follows `events.jsonl` while a run is live and replays finished runs from `frames/`.

The viewer depends on the agent package (`"@pokebench/agent": "workspace:*"`) for the shared contracts, chiefly the event schema (`@pokebench/agent/events`), the feature-switch registry (`@pokebench/agent/features`) and milestone definitions, so both sides validate the same event types.

The Python game server and environment live outside this folder, in [`../env/`](../env/).

## Commands

Run these from the repository root. Each `pnpm -r` script runs in both packages.

| Command | What it runs |
|---|---|
| `just setup` | Enables the git hooks, `pnpm install`, and `uv sync` for the Python environment. |
| `just build` | `pnpm -r build` (TypeScript to each package's `dist/`). |
| `just lint` | `pnpm -r lint` (`tsc --noEmit` and ESLint), then the Python linters. |
| `just test` | Builds, then every Vitest suite with coverage (`pnpm -r coverage`), then the Python suites. Each suite fails under its coverage floor. |
| `just run-agent` | Builds, then starts an ordinary recorded run (`packages/viewer/dist/fixed-cli.js play`). |
| `just smoke-llm` | Builds, then one short agent loop against a real game server (`packages/agent/dist/live.js smoke`). |
| `just view` | Builds, then serves the viewer on `http://127.0.0.1:8790/`. |

`just run-agent` and `just smoke-llm` need a model endpoint; see [Connect a model](../docs/connect-a-model.md). Every Vitest suite runs under a guard (`agent/test-support/no-io.ts`) that fails any test touching disk, processes or the network.

Node 26 or newer and pnpm 10.32.1 are required; the root [README](../README.md) covers setup.
