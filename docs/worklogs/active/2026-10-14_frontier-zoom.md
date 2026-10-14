# Zoom to frontier on the story frontier graph

Request (the operator, 2026-10-14): an on/off option on the Runs & Comparisons story frontier graph that zooms to the frontier, showing only up to one more human milestone than the farthest agent checkpoint. On by default; off shows the full human baseline.

Design: five local HTML mockups (runs/mockups/frontier-zoom/, gitignored), rendered from the real frontierPlot on the 2026-10-14 snapshot (farthest agent: Rival met, zoom shows New game → Route 101, 14 of 36). The operator picked variant B: a segmented FRONTIER / FULL BASELINE control on the graph heading row (A was built first by mistake, then replaced).

Rules:
- Farthest agent = the deepest frontier checkpoint among plotted agent series (filtered overlays, the agent frontier run, live/paused current runs). Human-only progress never widens the zoom.
- Zoom end = the first later checkpoint the human baseline reached; without one, the next checkpoint. At least two checkpoints show. When the end is the last checkpoint, zoom changes nothing.
- The time axis rescales to visible points. Points beyond the end are not drawn; the caption names the range and how many later checkpoints are hidden.
- The switch state is in-page only and survives polling; a reload returns to the default (on).

Branch: claude/frontier-zoom in /private/tmp/pokebench-frontier-zoom.

## M1 · Zoom option (RED → GREEN → review)
- [x] RED: frontier.test.ts zoom cases; frontier-workbench.test.ts switch default/toggle/poll (4 failing, 12 passing)
- [x] GREEN: frontierPlot zoom argument, heading switch, workbench state, styles. Viewer 497/497 tests, agent 954/954.
- [x] Gates: viewer coverage lines 98.22 / branches 90.57 / functions 95.39 (frontier.ts 100/92.34/100); agent 98.85/93.41/97.93; lint and build pass. Python untouched: pytest 1845 pass, 2 fail only because this worktree has no vendor submodule checkout (map_groups.json missing), unrelated to this change.
- [x] Reviews: principles self-review zero FAIL; Grok LGTM, Claude CLI LGTM, Codex LGTM (round 3). Artifacts in runs/reviews/frontier-zoom/.
- [x] Browser click-through on owned preview 127.0.0.1:8462 (branch build, real runs): loads zoomed (New game → Route 101, 14 of 36, FRONTIER pressed); real click on FULL BASELINE shows the full graph (axis to 120 min); Shift+Tab + Enter returns to FRONTIER with focus kept and the focus ring visible. No console errors checked separately.
- [x] Explainer docs/explainers/frontier-zoom.html (viewer option, no harness card)
- [x] Operator approval (the operator: "yes and yes", 2026-10-14), local merge to main

COMMITS: `test(viewer): define zoom to frontier…` (44b3656), `feat(viewer): zoom the story frontier…` (9e7e10c), `feat(viewer): segmented FRONTIER / FULL BASELINE control…` (543a383).
Review round 1: Grok (cursor-grok-4.5-high) LGTM with lows; fixed caption wording under zoom, first label from data, added dense-human and paused-run tests. Claude CLI review credential expired and Cursor Opus hit its monthly limit; Codex default model rejected by ChatGPT account. Retrying Claude via Cursor Sonnet 5 and GPT via codex -m gpt-5.6-sol.
Explainer: docs/explainers/frontier-zoom.html (viewer option, not a harness feature card).
Review round 2: Claude CLI (default profile) LGTM; Codex (gpt-5.6-sol) BLOCKING on focus contrast. Fixed: dark+yellow inset focus ring, pre-data click no longer clears the loading placeholder, caption names FULL BASELINE, tests for pre-data click, focus retention and failed-poll recovery.
