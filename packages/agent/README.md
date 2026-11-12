# @pokebench/agent

This package is the agent that plays Pokémon Emerald: a TypeScript loop on [pi](https://github.com/badlogic/pi-mono) (`@mariozechner/pi-ai` and `@mariozechner/pi-agent-core`) that sends the game to a model and records every step.

It talks to two things. The model is any OpenAI-compatible chat endpoint the run names (`POKEBENCH_GATEWAY_URL` or `POKEBENCH_ENDPOINT_FILE`, plus `POKEBENCH_MODEL`); there is no built-in default. The game is an isolated copy of the vendored game server, started for each run on `127.0.0.1` from its own `runs/<id>/server/` folder.

## A turn

1. The harness builds the model's context: the system prompt, a sliding window of recent turns (older screenshots are replaced with a placeholder), and any loop-guard or recovery note.
2. The model replies with tool calls. The core tools are `observe` (screenshot plus a text readout of game state read from RAM) and `press` (buttons). Feature switches add others, such as `navigate_to`, `battle_action`, `select_menu_option`, `learn_move` and the objective tools.
3. Tools run one at a time against the game server; each press waits on emulated frames, not wall-clock sleeps, and returns what changed.
4. The recorder appends the request, reply, tool calls, results, state and screenshots to the run's log.
5. A governor counts turns, wall time and consecutive failures (text-only replies, cut-off replies, invalid calls, model errors) and ends the run when one reaches the limit set for that run.

## Map of `src/`

`src/` is mostly flat: about 200 modules, with tests beside them as `*.test.ts`. Grouped by area, with a few representative files:

| Area | Files |
|---|---|
| Model and provider | `config.ts` (endpoint resolution), `provider.ts`, `gateway.ts`, `local-endpoint.ts`, `reasoning-effort.ts`, `model-stream.ts`, `model-error-recovery.ts`, `context-budget.ts` |
| Loop and prompt | `harness.ts` (pi loop, context window, governor), `play-config.ts` (system prompt and tool list), `play-wiring.ts`, `play-preset.ts`, `run.ts` |
| Game tools | `game-tools.ts` (`observe`, `press`), `menu-option-tool.ts`, `learn-move.ts`, `evolution-decision.ts`, `objective-tools.ts`, `press-result.ts` |
| Navigation | `navigation.ts`, `semantic-navigation.ts`, `route-plan.ts`, `stride.ts`, `bike.ts`, `surf-gate.ts`, `map-rules.generated.ts` |
| Battle | `battle-action.ts`, `battle-context.ts`, `battle-outcomes.ts`, `move-matchup.ts`, `trainer-sight.ts` |
| Observation and readout | `game-state.ts`, `map-observation.generated.ts`, `party-facts.ts`, `dialogue-log.ts`, `result-facts.ts`, `harness-trust.ts` |
| Loop guards and recovery | `loop-detection.ts`, `loop-supervisor.ts`, `loop/` (fingerprints, coordinator, navigation recovery), `fixed-point-breaker.ts`, `stall-briefing.ts` |
| Progress | `milestones.ts`, `story-progress.ts`, `story-checkpoints.ts`, `objective-graph.ts`, `game-clear-stop.ts` |
| Recording and events | `events.ts` (the event schema), `recorder.ts`, `frames.ts`, `run-log.ts`, `run-control.ts`, `checkpoint-capture.ts` |
| Feature switches | `features.ts` (the registry of every switch, its default and what it changes), `ui-feature.ts` |
| CLIs | `live.ts` (`smoke`, `play`, `human`, `probe`, `verify-state`), `tail.ts`, `runs-cli.ts`, `probe-decision-cli.ts`, `serial-comparison-cli.ts`, `loop-recovery-cli.ts` |

Every harness behavior change ships behind a switch in `features.ts` whose OFF state is the previous behavior; [docs/features.md](../../docs/features.md) lists them.

`live.ts` is the one live entrypoint and the only file excluded from coverage. The logic it wires lives in the modules above, with disk, processes, network and clocks injected so tests use fakes.

## Tests and fixtures

- Tests: `src/**/*.test.ts`, run by Vitest (`vitest.config.ts`) with coverage floors.
- Fixtures: `src/fixtures/` holds recorded game states and event excerpts, mostly gzipped JSON or JSONL; `src/data/` holds small data files the code reads.
- Test helpers: `test-support/`, including `no-io.ts`, the guard that fails any test touching disk, a process, the network, DNS or a socket. `no-io-proof.config.ts` proves the guard still catches those.

## Running it

From the repository root, after `just setup` and the steps in the root [README](../../README.md):

```bash
just smoke-llm   # one short agent loop against a real game server
just run-agent   # an ordinary recorded run
just tail-run <run-id>   # follow a run's events.jsonl in the terminal
```

Both need a model endpoint; see [Connect a model](../../docs/connect-a-model.md). Watch runs with the [viewer](../viewer/).

Package scripts: `pnpm test`, `pnpm coverage`, `pnpm lint` (`tsc --noEmit` and ESLint), `pnpm build` (to `dist/`).
