# Viewer LAN origin for the portal card

Operator report 2026-10-15: on a phone, the PokeBench portal card at `http://inference.example` does not open the bench. The live contract (local-inference-stack 234555567) sends the LAN portal to `http://localhost:8790/`, which only resolves on the Mac.

## Design

- A private network reverse proxy forwards the configured LAN origin to the loopback viewer.
- Caddy keeps the browser's `Host`, so the viewer allowlists `http://viewer.example` through `POKEBENCH_VIEWER_ORIGINS`. `--public-origin` now accepts `http:` as well as `https:` (still origin-only). The viewer keeps binding `127.0.0.1` only.

## M1: http public origins

- [ ] RED: CLI accepts `http://viewer.example`; server test for LAN host and exact-origin writes
- [ ] GREEN
- [ ] Gates: test, coverage, lint
