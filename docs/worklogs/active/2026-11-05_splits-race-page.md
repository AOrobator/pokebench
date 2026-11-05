# PokéNav splits race page

Requested by the operator 2026-11-05: build mockup G1 (runs/mockups/splits-race-3/g1.html) and land it on main.

Single milestone. Viewer presentation plus trainer-page art, so no feature switch. No timeline or trainer-card change.

## Plan

- `splits-race.ts`: pure race model and page pieces. Stretches run between shared milestones the two runs did in the same order; others show "route differs".
- `app.ts`: the splits page renders from the same recorded splits as the watch-side sections, only while visible. The baseline picker and comparison fetch leave this page.
- `racePlot`: the frontier story graph with this run and the frontier only.
- `build_page_art.py`: region map and marker icons, ROM-verified, under runs/sprites/trainer-page-v1.

## M1

- [ ] RED
- [ ] GREEN
- [ ] Gates
- [ ] Review
- [ ] Land, `just trainer-page-art`, `just viewer-main`, live proof

## Multi-Model Review Log
