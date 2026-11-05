# PokéNav splits race page

Requested by the operator 2026-11-05: build mockup G1 (runs/mockups/splits-race-3/g1.html) and land it on main.

Single milestone. Viewer presentation plus trainer-page art, so no feature switch. No timeline or trainer-card change.

## Plan

- `splits-race.ts`: pure race model and page pieces. Stretches run between shared milestones the two runs did in the same order; others show "route differs".
- `app.ts`: the splits page renders from the same recorded splits as the watch-side sections, only while visible. The baseline picker and comparison fetch leave this page.
- `racePlot`: the frontier story graph with this run and the frontier only.
- `build_page_art.py`: region map and marker icons, ROM-verified, under runs/sprites/trainer-page-v1.

## M1

- [x] RED: 7c9be2f9a
- [x] GREEN: focused viewer suites pass; candidate client on live data: 5f0f 3:49:47 ahead, 8 stops, filters and folding clicked on desktop and phone sizes; art builder verified the map against the ROM
- [x] Gates on main at 4d99a713d: just lint, just test (agent 2472, viewer 888, env 2901, gateway 38), just verify-vendor, just trainer-card-check
- [x] Review: Claude and GPT LGTM on the final delta; fallback subagent reviewed round 1; Grok out of Cursor usage until 11/17
- [x] Landed 4d99a713d fast-forward; art rebuilt and ROM-verified; viewer restarted, parent launchd, 5f0f kept running; headless desktop, phone and replay proof on 8790, no page errors

## Multi-Model Review Log

Round 1, packet f0b707872..ed6229b44 sha 13e1d25b. Claude, GPT and fallback subagent: BLOCKING, all real. Fixed in one batch: frontier loading no longer reads as no frontier; a loading or empty page clears every pane; ROUTE119-style locations place on the map; the replay graph follows the list; an unknown save and custom lanes do not race; memo keys cover split contents; no badge is current after the last; the map waits for its data.

Round 2, delta ..2fc91a8f9. Claude: LGTM with small notes. GPT: BLOCKING on custom metadata not yet loaded and frontier contents missing from memo keys. Fixed with Claude's notes: the race waits for the run's card row, memo keys hold frontier contents, an unknown save has no graph, the empty list says no milestones. Round 3 runs past the cap because each blocker was a real bug and the operator asked to land.

Round 3, delta ..ac8708a2e. GPT: BLOCKING on derived flags missing from the frontier memo key. Claude: BLOCKING on a peer stub row hiding knowledge switches. Fixed: knowledge switches read from the run header, the graph waits for a real config, the memo key holds the whole frontier.

Round 4, final delta. Claude: LGTM. GPT: LGTM.

## Nav order

Requested by the operator 2026-11-05: SPLITS sits right after POKéMON PARTY in the PokéNav. One button moved in static/index.html; the phone picker follows the button order.

## Top card splits removed

Requested by the operator 2026-11-05: delete SPLITS THIS RUN and the frontier splits from the top run card, since the PokéNav page has them. Removed the markup, `splitStrip`, `splitTimes` and their styles and tests.
