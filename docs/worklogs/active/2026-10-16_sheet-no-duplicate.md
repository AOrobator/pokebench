# Phone sheet: other live runs don't read as the current run

## Problem Statement

The operator (1:58 PM EDT): the phone sheet "shows the current run under other live runs". Both bundle-v-control runs share the experiment name, so the other run's WATCH card was titled exactly like the YOU'RE WATCHING card, and the ALL RUNS picker below repeated "Watching <current run>".

## Architecture

Viewer only, no feature switch. `run-head.ts` `sheetHtml`: an other-run card whose cohort shares the watched run's experiment leads with its arm badge and trial and says "same experiment"; a different experiment keeps the experiment as its title. `style.css`: the picker's "Watching" label text is hidden inside the sheet (the select keeps its own font).

## Milestones

**M1**
- [x] RED: same-experiment card has no experiment title and leads with the arm; different-experiment card keeps it; CSS hides the label in the sheet
- [ ] GREEN, gates, browser proof
- [ ] Review: Claude, Grok, GPT; land ff-only; live check
