# Portal card: PokeBench viewer over localhost and Tailscale

Requested 2026-10-14 through the project thread: add a PokeBench card to the local inference stack portal that opens the viewer and launcher (`just view`, 127.0.0.1:8790) from both localhost and Tailscale.

## Design

- The viewer keeps binding to loopback. A private reverse proxy provides access to authorized clients.
- Tailscale Serve preserves the browser's `Host`, so the viewer gains an explicit public-origin allowlist (`--public-origin`, default from `POKEBENCH_VIEWER_ORIGINS` in the gitignored `.env`). Each listed origin admits its own host, and writes from it must carry exactly that origin. Loopback hosts behave as before; every other host stays 403.
- The portal card resolves the viewer origin from deployment configuration.

## M1: viewer public origins (pokebench)

- [ ] RED: server and CLI tests for allowlisted public origins
- [ ] GREEN: server host/origin map, `--public-origin`, env default
- [ ] Gates: `just test`, `just coverage` (≥90), `just lint`
- [ ] Review: Claude CLI reviewer (no local models as reviewers)

## M2: portal card (local-inference-stack, separate branch)

- [ ] Contract keys, card, loopback portal origins, publisher for :8447, tests
- [ ] Live verification from localhost and the tailnet origin

## Log
