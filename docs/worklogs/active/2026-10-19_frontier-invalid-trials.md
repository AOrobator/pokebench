# Frontier graph: show invalid fixed-run trials

## Problem

The operator (2026-10-19, 11:27 PM ET): "the latest cook runs aren't showing up on the frontier graph". The 4 hour cook pair (`bundle-cook-4h`, runs `2026-10-19T20-12-11_qwen36-gpu{0_4cd7,1_86ac}`) ended with both trials judged invalid by the fixed-run driver (an emulator crash and a 64K-context overflow), and the last round-loop pair (`bundle-v-control-dryrun-cook@1502cfb`) was operator-stopped. `fixedCohort` in `workbench-store.ts` turns an invalid outcome into `excluded = "Invalid fixed-run trial: …"`, and `shownAgent` in `frontier.ts` drops every excluded run, so these runs vanish from the chart even though they reached Petalburg and Petalburg Woods. The live 6 hour pair is plotted correctly.

## Invariant

An agent run excluded only because the fixed-run driver judged its trial invalid is plotted as a dotted line, labelled with the invalid reason, colored by its harness version and counted in the legend. It never competes for the agent frontier (gold line), and every other exclusion (probe, operator-aborted hand runs, problems) stays hidden. Viewer-only change: no harness switch (feature-switch skill exempts viewer-only changes); the timeline is untouched.

## Milestone

- [ ] RED: frontier tests for invalid trials plotted, labelled, never best; other exclusions still hidden.
- [ ] GREEN: `invalidTrial` admitted by `shownAgent`; dotted line, title reason, notice and legend row.
- [ ] Gates: build, test, lint, coverage, verify-vendor.
- [ ] Cloud review (Claude, Grok, GPT/Codex) LGTM on the frozen diff; ff-only landing.
- [ ] `just viewer-main`; real-browser desktop and phone check that the 4h pair is drawn.

## Session log
