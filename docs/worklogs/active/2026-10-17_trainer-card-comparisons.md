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
- [ ] Gates, browser proof at 1280/1440/375
- [ ] Review (round cap 2), land ff-only, restart, live check
