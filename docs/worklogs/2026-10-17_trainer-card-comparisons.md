# Trainer cards on Runs & Comparisons

## Problem Statement

The operator (2026-10-17, 12:01 PM EDT): "the runs and comparisons card needs to use the same trainer card UI, DRY". The comparisons page still draws its live runs as name plates, while the viewer header now draws them as trainer cards (landed at ceddc5e6).

## Architecture

- **`WorkbenchRun.experiment`.** `{id, arm, trial, of}` comes from the run header, so a card needs only workbench data for its title, arm and trial.
- **`trainer-card.ts`.**
  - `cardInputFor` builds one card from a workbench run. Both pages use it.
  - `cardHtml` takes an optional `href`. With one, the card is a link (the comparisons page links to the viewer); without one, it is a button.
- **`card-dom.ts` (new, shared).**
  - `loadCardArt`: manifest, font and glyph sheet.
  - `syncCards`: replace a card only when its own markup changes.
  - `fillCards`: game-font painting and in-place clocks.
  - The viewer's `app.ts` moves to this module, with no behavior change.
- **Comparisons page.** With the art, the party shows wide cards linking to `/#run=id`, with any run notes (clock-set save, problem) under each card. Without the art, the plates stay unchanged.

No harness behavior change, so no feature switch.

## Milestones

**M1: cards on the comparisons page**
- [x] RED 5bdef504 / GREEN: experiment on workbench runs; cardInputFor; link cards; shared card-dom (app.ts moved onto it; focus restore now keyed by run, closing the trainer-card-header follow-up); comparisons party as cards with lane and notes, clock in place, per-card sync, plates without art. Gates: viewer 1080 (95.39/91.41/93.73/97.61), agent 2084, Python 2398
- [x] Gates, browser proof at 1280/1440/375: runs/reviews/2026-10-17-trainer-card-comparisons-e2e/receipt.md (round 2: polling, keyboard, return path, frames, console)
- [x] Review on packet 96821a1c (head 8ace2510): Claude LGTM, Grok LGTM. GPT BLOCKING twice on evidence only. Round 1: the stale principles table (fixed) and the click-through proof (added). Round 2: mutation evidence for the arm/of validation (rebutted as an evidence demand). At the round cap, the operator said "merge".
- [x] Landed 2026-10-17 12:35 PM EDT: `git merge --ff-only` -> main 8ace2510. `just test` on main: agent 2084, viewer 1080, Python 2502. `just viewer-main`: viewer at 8ace2510, 2 live runs kept.
- [x] Live on 8790: /comparisons shows both live runs (93eb control, 0e05 bundle) as gold trainer cards with LANE A · GPU1 / LANE B · GPU0 under them, all text painted, no plates. Clicking a card opens the viewer on that run.
- Follow-ups: art load before the first snapshot has no timeout (Claude H3); syncCards keeps focus by index rather than across reorders; negative tests for experiment arm/of (GPT round 2).

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (8ace2510 feat(viewer): comparisons page draws live runs as the shared trainer card (GREEN)). Unchecked boxes left above are bookkeeping from before that landing.
