# Story frontier ignores the EXPERIMENT filter for live runs

## Problem

Operator (2026-10-16 5:22 AM EDT): picking an experiment in the EXPERIMENT dropdown does not drop runs out of the story frontier. Reproduced on 8790: the filtered recorded runs do change, but `renderCharts` passes every live or paused run to `frontierPlot` as the highlighted "LIVE" set, unfiltered (since 205b3b1d). With two overnight runs live, both stay drawn and glowing under every experiment, MODEL and CONFIGURATION choice.

## Fix

- [x] RED: a live run of another experiment is not drawn once an experiment is picked; the current-run plates still list every live run.
- [ ] GREEN: the LIVE set is the live/paused runs inside the current filter.
- [ ] Reviews (Codex, grok), merge, viewer restart through the coordinator.
