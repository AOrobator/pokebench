# Portal card: PokeBench viewer over localhost and Tailscale

Requested 2026-10-14 through the project thread: add a PokeBench card to the local inference stack portal that opens the viewer and launcher (`just view`, 127.0.0.1:8790) from both localhost and Tailscale.

## Design

- The viewer keeps binding to loopback. A private reverse proxy provides access to authorized clients.
- Tailscale Serve preserves the browser's `Host`, so the viewer gains an explicit public-origin allowlist (`--public-origin`, default from `POKEBENCH_VIEWER_ORIGINS` in the gitignored `.env`). Each listed origin admits its own host, and writes from it must carry exactly that origin. Loopback hosts behave as before; every other host stays 403.
- The portal card resolves the viewer origin from deployment configuration.

## M1: viewer public origins (pokebench)

- [x] RED: server and CLI tests for allowlisted public origins
  COMMIT: `test: reproduce viewer refusing its Tailscale origin` (e04d1b1), 7 failing
- [x] GREEN: server host/origin map, `--public-origin`, env default (`.env` now sets `POKEBENCH_VIEWER_ORIGINS`)
- [x] Gates: lint clean; viewer 356 tests, agent 863, Python 1791 pass; TS viewer 96.06/90.94/95.87 (lines/branches/functions), Python 96.61/91.68/100. cli.ts uncovered lines are the pre-existing `import.meta.main` entry block.
- [ ] Review: Claude CLI reviewer (no local models as reviewers)

## M2: portal card (local-inference-stack, separate branch)

- [ ] Contract keys, card, loopback portal origins, publisher for :8447, tests
- [ ] Live verification from localhost and the tailnet origin

## Log
