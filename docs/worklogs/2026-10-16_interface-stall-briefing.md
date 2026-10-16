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
- [x] Claude + Codex + Grok LGTM on the sealed packet; fast-forward land

## Session Log

- 2026-10-16 04:20 AM EDT: branch cut from main 3c51c547 in the freed edge-tiles worktree; RED 487d11d5 (cherry-picked test + trimmed showcase events).

## Multi-Model Review Log
- 2026-10-16 04:38 AM EDT: merged main 65199ab2 (nickname switches landed; clean). Gates: agent 1455 (97.79/94.39/98.1), viewer 824, pytest 2180 (97.16/92.88/100), lint, schema, vendor clean.
- 2026-10-16 04:50 AM EDT: landing review round 1 (packet runs/reviews/interface-stall-briefing/final.diff): Claude CLI LGTM, Grok LGTM, Codex BLOCKING — the call that answered YES and opened the editor counted as dwell call 1 (first dwell at turn 282 after 29 calls made inside) and its press was listed as an editor press. Accepted; RED: first dwell must come at turn 283.
- GREEN: StallBriefing starts a dwell at 0 calls on the call that opens the interface; SupervisorBriefing lists only presses made while that interface was already open (Call.uiBefore). First showcase dwell now at turn 283 (30 calls inside); T302 list unchanged (B,RIGHT×4,A ×24).
- 2026-10-16 05:00 AM EDT: merged main 1e1feec9 (viewer baseline cache; clean). Gates: agent 1455 (97.79/94.39/98.1), viewer 849 (95.16/90.69/93.41), pytest 2180 (97.16/92.88/100), lint, schema, vendor clean.
- 2026-10-16 05:20 AM EDT: landing round 2 (final2.diff, sha 9d05299e…): Claude CLI, Codex, Grok all LGTM. main then advanced to 5fd00072 (battle-text-auto-advance-v1, run-tagged experiments); merged clean; the branch's own diff is identical apart from hunk offsets, but the packet hash changed, so round 3 reviews the new packet. Gates: agent 1493 (97.84/94.37/98.15), viewer 865 (95.36/90.98/93.57; experiment-cli timeout flake passed on rerun), pytest 2209 (97.26/93.01/100), lint, schema, vendor clean.
- 2026-10-16 05:33 AM EDT: LANDED on main fast-forward at 586ab6d1 (packet runs/reviews/interface-stall-briefing/final3.diff, main 5fd00072 → 586ab6d1). Round 3: Claude CLI, Codex gpt-5.6-sol, Grok all LGTM. `just test` on main: agent 1493, viewer 865, pytest 2209 (one agent-test flake on the first run, green on rerun). Deferred: synthetic reset-on-leave/progress tests; field attempts still appended after interface presses; player/caught-mon editors do not count as dwells.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-16). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
