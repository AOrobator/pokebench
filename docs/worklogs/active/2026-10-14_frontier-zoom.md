# Zoom to frontier on the story frontier graph

Request (the operator, 2026-10-14): an on/off option on the Runs & Comparisons story frontier graph that zooms to the frontier, showing only up to one more human milestone than the farthest agent checkpoint. On by default; off shows the full human baseline.

Design: five local HTML mockups (runs/mockups/frontier-zoom/, gitignored), rendered from the real frontierPlot on the 2026-10-14 snapshot (farthest agent: Rival met, zoom shows New game → Route 101, 14 of 36). Building variant A: a switch on the graph heading row.

Rules:
- Farthest agent = the deepest frontier checkpoint among plotted agent series (filtered overlays, the agent frontier run, live/paused current runs). Human-only progress never widens the zoom.
- Zoom end = the first later checkpoint the human baseline reached; without one, the next checkpoint. At least two checkpoints show. When the end is the last checkpoint, zoom changes nothing.
- The time axis rescales to visible points. Points beyond the end are not drawn; the caption names the range and how many later checkpoints are hidden.
- The switch state is in-page only and survives polling; a reload returns to the default (on).

Branch: claude/frontier-zoom in /private/tmp/pokebench-frontier-zoom.

## M1 · Zoom option (RED → GREEN → review)
- [x] RED: frontier.test.ts zoom cases; frontier-workbench.test.ts switch default/toggle/poll (4 failing, 12 passing)
- [ ] GREEN: frontierPlot zoom argument, heading switch, workbench state, styles
- [ ] Gates: viewer tests, coverage ≥90, lint, build
- [ ] Reviews: principles self-review, Claude CLI, Codex, Grok
- [ ] Browser click-through on an owned preview (viewer-e2e)
- [ ] Explainer + feature card link (feature-explainer)
- [ ] Operator approval, local merge to main
