# @pokebench/viewer

This package is PokeBench's local web viewer for runs, live or finished, plus the command-line tools that launch runs and fixed-N experiments.

`just view` serves it at `http://127.0.0.1:8790/`. The server binds `127.0.0.1` only, and answers only loopback `Host` headers plus any HTTP(S) origins listed in `POKEBENCH_VIEWER_ORIGINS` in the gitignored `.env`; every other host gets a 403. See [SECURITY.md](../../SECURITY.md).

## What it shows

- **Main page** (`/`, `static/index.html`): the live game screen with sound, the timeline swimlanes, and a PokéNav-style set of pages: AGENT TRACE (thinking, tool calls and results, with a raw-event inspector), POKéMON PARTY, BAG, SPLITS (this run racing the frontier, badge by badge), TRAINER CARD, LLM STATS, FIELD STATE, HARNESS CONFIG, RUN DETAILS and NEXT RUN.
- **Runs & Comparisons** (`/comparisons`, `static/workbench.html`): every run as a trainer card, experiment cohorts, and the story frontier (the best run so far, with heavily assisted runs marked).
- **Reports, probes, broadcast and human play**: `reports.html`, `probes.html`, `broadcast.html` and `play.html` in `static/`.

## How it reads runs

The agent records each run under `runs/<id>/`. The viewer reads `events.jsonl`, the run's record, and validates it against the agent's event schema (`@pokebench/agent/events`). A live run is followed as the file grows, with frames streamed over a WebSocket from the run's game server; a finished run replays from `runs/<id>/frames/`. The viewer never writes `events.jsonl`. Operator controls such as pause, stop and time extensions are appended to the run's `control.jsonl`, which the agent reads.

## Map of `src/`

Tests sit beside the code as `*.test.ts`. Representative files by area:

| Area | Files |
|---|---|
| Server and CLI | `cli.ts` (`just view`), `server.ts` (HTTP routes, host check, frame sockets), `runs.ts` (reading `runs/`), `frame-hub.ts` |
| Live and replay page | `app.ts`, `main.ts`, `replay.ts`, `timeline.ts`, `trace.ts`, `panels.ts`, `party-view.ts`, `bag.ts`, `controls.ts` |
| PokéNav pages | `splits-race.ts`, `run-splits.ts`, `trainer-card.ts`, `trainer-page.ts`, `story-progress.ts`, `steady-scroll.ts` |
| Frontier and comparisons | `frontier.ts`, `frontier-headline.ts`, `frontier-cache.ts`, `custom-lane.ts`, `workbench.ts`, `workbench-view.ts`, `experiment-cohorts.ts` |
| Current-state projection | `current-service.ts`, `current-projection.ts`, `current-store.ts`, `current-api.ts` |
| Fixed-N experiments | `fixed-cli.ts` (`just fixed-run`, `just run-agent`), `fixed-runner.ts`, `fixed-definition.ts`, `fixed-analysis.ts`, `fixed-status.ts` |
| Other pages | `reports-view.ts`, `probes-view.ts`, `broadcast-main.ts`, `broadcast-render-cli.ts`, `human-play.ts` |
| Shared | `browser-modules.ts` (the client modules served under `/app/`), `game-font.ts`, `format.ts`, `build-stamp.ts` |

`static/` holds the HTML pages, `style.css` and the other stylesheets, the favicon and the bundled fonts (`static/fonts/`, see its `NOTICE.md`). The browser modules are compiled from `src/` into `dist/` and served from there.

## Tests

- **Unit tests:** Vitest (`vitest.config.ts`), with happy-dom for DOM code and the agent package's no-I/O guard, so no test touches disk, processes or the network. `just test` runs them with coverage floors.
- **Design tests:** `design-tests/` is a Playwright suite that checks the trainer cards against approved baselines. It uses a real browser and art built from your own ROM, so it is a separate command, `just trainer-card-check`.
- **Browser tests:** `browser-tests/` holds a Playwright check of date display at phone width.
- `test-support/` holds shared fixtures and builders for the unit tests.

## Running it

From the repository root:

```bash
just view                 # serve on 127.0.0.1:8790
just view <run-id> 8799   # open one run, on another port
just run-agent            # start an ordinary recorded run
just fixed-run <command>  # plan, check, run or analyze a fixed-N experiment
```

Package scripts: `pnpm test`, `pnpm coverage`, `pnpm lint` (`tsc --noEmit` and ESLint), `pnpm build` (to `dist/`, then writes a build stamp).
