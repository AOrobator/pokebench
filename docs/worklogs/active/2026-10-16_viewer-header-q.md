# Viewer phone header Q

## Problem Statement

On a phone the viewer header is about 450px of an 812px screen, so the game only appears after scrolling (the operator, 2026-10-16). After five mockup rounds (`runs/mockups/viewer-header-phone/round5.html`), the operator picked Q (1:21 PM EDT): "yeah q is great, lets build it".

## Architecture

Viewer only, phone widths (`max-width: 700px`, the existing phone breakpoint); the desktop header is unchanged. No harness behavior change, so no feature switch.

- `runs.ts` `RunSummary.cohort`: the run header's `evaluation.experiment` ({id, arm, trial, of}) as structured fields beside the existing `experiment` label, so other live runs can be shown experiment-first without parsing a display string.
- `run-head.ts` (pure): `headTitle` (experiment, else preset, else model, else run id), `headHtml` (line 1: blinking live dot or state word, experiment, +N LIVE; line 2: arm badge, "trial t/of", one time "0:27:22 / 1:00:00"), `sheetHtml` (YOU'RE WATCHING card, other live runs as WATCH ▸ buttons with no ended runs, run details).
- `index.html`: a `run-head` button in the header, a `run-sheet` (with shade and grab handle) and two slots: under the game screen for the replay and run controls, and in the sheet for the run picker and the comparisons link.
- `app.ts`: renders the head and sheet each render; on phone widths (`matchMedia`) moves the controls under the screen and the picker into the sheet, and back on wide screens. Ended runs stay reachable through the picker at the bottom of the sheet.

## Milestones

**M1 — phone header Q**
- [x] RED: run-list cohort; head/sheet model; phone mount moves controls and picker; sheet opens from anywhere on the header and switches runs; desktop keeps everything in the header; CSS hides old pieces on phones
- [x] GREEN, gates: `pnpm -r build`, `pnpm -r lint`, `pnpm -r coverage` pass (viewer 945 tests; 95.36 stmts / 91.11 branches / 93.76 funcs / 97.66 lines; agent 1867). `run-head` added to `BROWSER_MODULES` so the server serves it.
- [x] Browser proof at phone width (viewer-e2e): `runs/reviews/2026-10-16-header-q-e2e/receipt.md`. Fixed four bugs it found: `.bar button` styles turned the header white, the sheet stayed open after a picker change, disabled controls under the screen looked enabled, picker came after the link. Gates rerun: viewer 946 tests, 95.36 / 91.1 / 93.76 / 97.66.
- [ ] Review: Claude, Grok, GPT on one frozen packet; land ff-only
