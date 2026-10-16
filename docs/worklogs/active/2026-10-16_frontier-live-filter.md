# Story frontier ignores the EXPERIMENT filter for live runs

## Problem

Operator (2026-10-16 5:22 AM EDT): picking an experiment in the EXPERIMENT dropdown does not drop runs out of the story frontier. Reproduced on 8790: the filtered recorded runs do change, but `renderCharts` passes every live or paused run to `frontierPlot` as the highlighted "LIVE" set, unfiltered (since 205b3b1d). With two overnight runs live, both stay drawn and glowing under every experiment, MODEL and CONFIGURATION choice.

## Fix

- [x] RED (d66494d1): a live run of another experiment is not drawn once an experiment is picked; the current-run plates still list every live run.
- [x] GREEN: the LIVE set is the live/paused runs inside the current filter. The older test `keeps the healthy current run visible across filters` (205b3b1d) asserted the opposite; the operator now wants filtered-out runs gone, so it now asserts the run is dropped under a non-matching MODEL filter and highlighted again under All. Viewer 879 tests; coverage 95.32 / 90.99 / 93.61 / 97.63; tsc + eslint clean.
- [ ] Reviews (Codex, grok), merge, viewer restart through the coordinator.
