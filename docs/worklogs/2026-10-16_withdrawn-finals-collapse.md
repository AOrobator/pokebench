# Collapse the stale withdrawn-finals control

## Problem

The stats page still led its experiment section with the withdrawn whole-map navigation finals (a full card, 32 pips, RESUME FINALS) and "New experiments wait: finals withdrawn…", although the current experiment is the fixed-run bundle-v-control.

## Fix

- [x] RED (f79e07f0): withdrawn finals render as a closed PAST entry; an active fixed run leads the queue notices.
- [x] GREEN (27cf4c16): `<details>` PAST entry with RESUME FINALS inside; notice and idle runner line name the fixed run. Viewer 782 tests; coverage 95.08 / 90.45 / 93.55; lint clean.
- Review 1 (Codex gpt-5.6-sol, 2026-10-16 2:30 AM EDT): BLOCKING. P1 a stopped or dead fixed-run status (runner not alive) still replaced the real queue blocker; P2 no interaction test that the PAST entry opens and RESUME FINALS is reachable. Found while fixing: the panel re-renders on every poll, which would close an opened PAST entry.
- [x] RED (3a679a5d): only a live fixed run (runner alive, running or waiting) pauses the notices; the PAST entry opens on its summary and stays open across reloads.
- [x] GREEN: `paused` needs `runnerAlive` and state running/waiting; the PAST `<details>` keeps its open state in the panel's `open` set (`gate:<id>`), and the summary click is handled by the re-render. Viewer 782 tests; coverage 95.08 / 90.46 / 93.55 / 97.59 (queue-view.ts 98.05 / 94.11 / 100); tsc + eslint clean.
- [ ] Delta re-review (Codex, grok), merge (operator OK 2026-10-16 2:28 AM EDT once reviews approve).
- [x] Re-review 1: grok LGTM; Codex BLOCKING: a fixed runner in state waiting has not taken the gameplay lease, so it must not claim to pause the queue. RED: waiting keeps the old notices.
- [x] GREEN: `paused` requires runnerAlive and state running. Viewer 782 tests; coverage 95.08 / 90.46 / 93.55 / 97.59; lint clean. Delta re-review next.
- [x] Delta re-review: Codex `VERDICT: LGTM`, grok `VERDICT: LGTM`. Merging to main (operator OK 2026-10-16 2:28 AM EDT).

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (f1c7d40c Merge branch 'claude/withdrawn-finals-collapse'). Unchecked boxes left above are bookkeeping from before that landing.
