# Viewer trace and header cleanups

Requested by the operator 2026-11-04, relayed by the coordinator: remove the load older turns button so scrolling back loads older turns and the trace shows all it can; show the shortest model name in the model/thinking pill and keep the thinking level; size the preset to its content.

Single milestone. Viewer-only, so no feature switch. No timeline changes and no trainer-card change.

## Plan

- Agent Trace: no buttons. Scrolling near the oldest row reveals the next turns already held, then fetches older pages, and a short list keeps filling. A failed page stops the chain and shows RETRY HISTORY.
- Live-run history window grows from 512 events / 4 MiB to 8192 events / 128 MiB, because run 5f0f averages about 17 KB an event and the old window held about 240 events. Past the window, reading older slides it: the newest events drop and the older ones stay on screen.
- Pill: `displayModelName` keeps the id's own spelling and drops path, size, quant and tier; full id in the hover title.
- Preset: `.id-exp` no longer grows.

## M1

- [ ] RED
- [ ] GREEN
- [ ] Gates
- [ ] Review
- [ ] Land, `just viewer-main`, headless proof
