# Screen-aware stall briefing (pre-launch fix F12, inside stall-briefing-v1)

Parent: pre-launch fixes F12. Operator decisions (the operator, 2026-10-16 01:03–01:14 AM EDT, Route 101 thread): the stall briefing must say when the model is in a naming editor or other owned interface instead of briefing the field map, and must fire sooner than the 5-minute drought; bundle only (inside `stall-briefing-v1`); the Route 101 thread lands it on main itself. Branch `claude/interface-stall-briefing`, worktree `/private/tmp/pokebench-m5b-edges`.

## Problem

Showcase run `2026-10-16T00-34-26_qwen36-gpu1_show`: the model entered the TORCHIC nickname editor at turn 253 (12:50 AM). The only supervisor notes were milestone_drought at turn 302 (12:55, seq 7244) and 353 (1:00, seq 9563); both briefed the town map, "what you tried" listed only pre-naming field actions, and ~19 untried bookshelves/PCs/warps. The cycle/ineffective guards never fired across 100+ naming presses because each press changed the cursor or buffer.

## Design

Re-land of the readiness thread's F12 (RED 51006938, GREEN 7261cdd6, reverted there before M5 merged) on current main: inside `stall-briefing-v1` only, in a naming editor or other owned interface the stall briefing names it, its text, highlighted key, controls and how the game finishes a name (pokeemerald naming_screen.c), lists the presses made there and drops the field lists. A new `interface_dwell` stall briefs after 30 calls in one interface. The both-arm loop supervisor text is unchanged.

## Milestones

**M1 — RED (cherry-picked test + fixture)**
- [x] `packages/agent/src/stall-interface.test.ts` red on main (3 failing: briefing still names the field; no interface_dwell stall; headline)

**M2 — GREEN, gates, review, land**
- [x] Port 7261cdd6 onto current main (one features.ts copy conflict: merged the F5 wording with the dwell wording); gates: agent 1450 (97.79/94.36/98.1), viewer 824, pytest 2162 (97.15/92.87/100), lint, schema, vendor clean; delete-the-wiring: dropping the interface_dwell stall call turns the dwell test red; explainer section added to stall-briefing-v1.html
- [ ] Claude + Codex + Grok LGTM on the sealed packet; fast-forward land

## Session Log

- 2026-10-16 04:20 AM EDT: branch cut from main 3c51c547 in the freed edge-tiles worktree; RED 487d11d5 (cherry-picked test + trimmed showcase events).

## Multi-Model Review Log
