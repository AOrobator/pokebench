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

Round 3 at 654f86ecb, packet c6cd9c93: Claude LGTM, GPT LGTM, fallback BLOCKING on one finding. Gates at 654f86ecb: `pnpm -r lint`, `just test` (2453, 826, 2894, 38), trainer-card-check, headless proof passed.

- Fixed: a wheel or swipe with nothing older to load no longer holds the trace.
- Noted, not fixed here: `loadOlderHistory` drops `operatorTurnLimit` (predates this diff, display only); a follower's first overflowing page can slide until the next refresh repairs it.

Round 4 at c87495f79, delta only: Claude LGTM, GPT LGTM, fallback LGTM. Round 3 stands for the rest: Claude and GPT LGTM at 654f86ecb. Grok out of Cursor usage until 11/17, standing approval to land on Claude, GPT and fallback.

## Principles self-review

PB1-PB8, PB11, PB12: N/A, display only. PB9, PB10: PASS. PB13: pending post-merge proof.

- [x] Gates
- [x] Review

Landed 409ef76f3, `just test` on main passed, `just viewer-main` live at that SHA, 5f0f kept running. Headless on 8790: pill and preset correct, 60 wheels read from turn 1104 back to 827, no buttons.

Post-merge finding: after a slide, Jump to latest left about 3 turns because the follower stop used the sticky `historyLimited`. Follow-up: `historyFull` marks only a window slid by reading back, and Jump to latest grants a fresh page budget.

Follow-up at 5b9b45763: Claude, GPT, fallback LGTM; `pnpm -r lint`, `just test`, trainer-card-check passed.
