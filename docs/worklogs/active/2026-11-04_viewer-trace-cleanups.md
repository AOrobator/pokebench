# Viewer trace and header cleanups

Requested by the operator 2026-11-04, relayed by the coordinator: remove the load older turns button so scrolling back loads older turns and the trace shows all it can; show the shortest model name in the model/thinking pill and keep the thinking level; size the preset to its content.

Single milestone. Viewer-only, so no feature switch. No timeline changes and no trainer-card change.

## Plan

- Agent Trace: no buttons. Scrolling near the oldest row reveals the next turns already held, then fetches older pages, and a short list keeps filling. A failed page stops the chain and shows RETRY HISTORY.
- Live-run history window grows from 512 events / 4 MiB to 8192 events / 128 MiB, because run 5f0f averages about 17 KB an event and the old window held about 240 events. Past the window, reading older slides it: the newest events drop and the older ones stay on screen.
- Pill: `displayModelName` keeps the id's own spelling and drops path, size, quant and tier; full id in the hover title.
- Preset: `.id-exp` no longer grows.

## M1

- [x] RED: 29c2c6aec, trace, panels, current-browser and frontier-versions tests fail
- [x] GREEN: focused suites 237 passed; headless proof on a fixture copy reached RUN START on a live and an ended run, one failed page stopped and RETRY HISTORY resumed
- [ ] Gates
- [ ] Review
- [ ] Land, `just viewer-main`, headless proof

## Multi-Model Review Log

Round 1 at c9fab9136, packet 4abf818e: Claude BLOCKING, GPT BLOCKING, fallback subagent BLOCKING; Grok lane out of Cursor usage until 11/17.

- Fixed: a following reader with a narrow chip filter walked the whole recording and looped. Fetches now take a budget of 16 pages per reader gesture, a follower never slides a limited window, and a list too short to scroll asks for more by wheel or touch.
- Fixed: RETRY HISTORY after a failed older page retries that page, Jump to latest repeats after an in-flight older page, replay keeps its speed across a page.

Gates at c9fab9136: build, `just test` (agent 2453, viewer 825, env 2894, gateway 38, no-io-proof), trainer-card-check passed. `just lint`: pnpm lint, ruff passed; mypy reports only missing `mgba._pylib` in this worktree's venv (native binding is per clone), no Python changed.

Round 2 at b94fe8215, packet 24ca576c: GPT BLOCKING, fallback BLOCKING (Claude stopped for the new head). Gates at b94fe8215: `pnpm -r lint`, `just test` (2453, 825, 2894, 38), trainer-card-check passed.

- Fixed: RETRY's direction lives in the client state (`historyOlder`), set by each read and cleared with the selection, and falls back to the newest page when nothing older exists.
- Fixed: wheel and touch at the end of a scrollable list grant more pages too.
