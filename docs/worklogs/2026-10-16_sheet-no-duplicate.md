# Phone sheet: other live runs don't read as the current run

## Problem Statement

The operator (1:58 PM EDT): the phone sheet "shows the current run under other live runs". Both bundle-v-control runs share the experiment name, so the other run's WATCH card was titled exactly like the YOU'RE WATCHING card, and the ALL RUNS picker below repeated "Watching <current run>".

## Architecture

Viewer only, no feature switch. `run-head.ts` `sheetHtml`: an other-run card whose cohort shares the watched run's experiment leads with its arm badge and trial and says "same experiment"; a different experiment keeps the experiment as its title. `style.css`: the picker's "Watching" label text is hidden inside the sheet (the select keeps its own font).

## Milestones

**M1**
- [x] RED: same-experiment card has no experiment title and leads with the arm; different-experiment card keeps it; CSS hides the label in the sheet
- [x] GREEN, gates (viewer 954 tests, 95.38 / 91.16 / 93.77 / 97.66), browser proof: `runs/reviews/2026-10-16-sheet-dedup/receipt.md`
- [x] Review on packet 1a2e4f7f (base 259aeb08, head 9dbe107b): Claude LGTM, Grok LGTM, GPT (Codex) round 1 BLOCKING on missing click-through evidence, round 2 LGTM on the same packet after the pointer and keyboard click-through receipt.
- [x] Landed: main 404d9a34 merged in, gates rerun (viewer 971), branch diff still 1a2e4f7f; `git merge --ff-only` -> main 043f695b.
- [ ] `just test` on main is RED: `packages/agent/src/runs-cli.test.ts` "uses the repo runs/ directory and the 500 MB cap" scans the real runs/ (26 GB) and now takes 5.1–6.6 s against the 5 s timeout on every run (3 of 3). Pre-existing and unrelated to this change (agent package untouched); reported to the operator, fix proposed on its own branch.
- [ ] Live on 8790: restart through the Viewer down thread, then check the sheet on live runs.

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (043f695b Merge branch 'main' into claude/sheet-no-duplicate). Unchecked boxes left above are bookkeeping from before that landing.
