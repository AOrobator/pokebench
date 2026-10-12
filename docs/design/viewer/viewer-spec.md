# PokeBench viewer (M5.5): signed-off design

Operator sign-off 2026-10-12: **Open PokéNav** (design 24 in `viewer-designs-round3.html`). This is the design checkpoint for M5.5. It is pulled forward ahead of M5 at the operator's request ("the visuals can help inform the events we need").

## Layout (top to bottom)

1. **Big centered Glacier GBA** (left, about 60% width). Buttons light while held. The live screen sits in the GBA screen.
2. **Thinking dialog** (Emerald text box) under the GBA, with a "thinking for N s" timer.
3. **Open PokéNav** (right, red device frame, everything visible, no tabs):
   - Trainer card: wall time, in-game play time, map, money, turn, badges
   - Pokémon: party with HP bars
   - Budgets (bars only where there is a cap): context window, frames disk (500 MB cap), retry budget
   - Counters (plain numbers): model, tokens, tok/s, latency (last and average), location, invalid tool calls, compactions, model errors, stuck
   - Splits vs baseline: collapsible, with a baseline-run picker
4. **Timeline swimlanes** (full width): thinking, tool calls, presses, milestones, errors over the last 60 s.
5. **Action log** (full width): tool calls with arguments, results, presses, retries and milestones. Clicking a row shows its raw event.

PokéNav theme throughout (Press Start 2P, blue/white boxes, red accents).

## Data sources

The viewer reads only `runs/<id>/events.jsonl` and `runs/<id>/frames/` (PB7). The one exception is the live picture, which comes from the run's game server while the run is live.

| Panel | Source in the M4 schema (`schemas/events.v1.json`) | Gap |
|---|---|---|
| GBA screen | live: the run's game server; replay: `tool_result.frames` | none |
| Button lights | `button_press.buttons` | no hold/release frames; assume the vendor's normal preset (hold 10, release 8) until added |
| Thinking dialog | `assistant.thinking`, `turn_start` (timer start) | live streaming isn't possible today: the gateway delivers each reply in one burst (M4 finding a). Show the timer, then the full block |
| Trainer card | `run_start`, `turn`, wall clock from `t` | **map, money, badges, play time: need a `state` event** |
| Pokémon | | **needs the `state` event** (party species, level, HP) |
| Budgets | `turn_start.context`, `run_start.budgets`, `disk_usage`, `retry.limit` | context window size: confirm it is in `run_start` |
| Counters | `assistant.usage`, `latency_ms`, `ttft_ms`, `retry`, `run_end` | **compactions: no event yet** (lands with M5's compaction); stuck: needs position from the `state` event |
| Splits vs baseline | `milestone` in this run and in a baseline run's log | none |
| Timeline, action log | all events | none |

## Schema additions (v1 → v1.1, additive)

- `state`: after each button press, beside the existing milestone check. Location, position and facing, mode, party (species, level, hp, max_hp), money, badges, play time. Parsed `/state` only, never the screenshot.
- `button_press.hold_frames` / `release_frames`
- `compaction`: from and to context size (emitted once M5 compacts)

## Stack (default, pending operator pick)

`packages/viewer`: TypeScript, served by a small Node server bound to 127.0.0.1 that lists `runs/`, tails `events.jsonl` over SSE and serves frames. The browser UI is plain TS plus SVG, with no framework, tested with vitest at the 90% floor. `just view [id]`.
