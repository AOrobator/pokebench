# README links to the switch list and explainers

Branch `claude/readme-features-link`, worktree `~/dev/pokebench-readme-features-link`, from main e278b1c74.

## Problem

The README calls run 67d7 heavily assisted but never links `docs/features.md` (every switch, its default and whether it was on in 67d7) or `docs/explainers/README.md` (the explainers index), so a reader of the front page cannot see what the assistance was.

## Change

One sentence after the results table, beside the results ledger link, linking both pages. The README has no separate list of docs pages, so there is nowhere else to add the explainers index.

## Invariants

- Docs-only change: documentation validation and independent review, no application build, lint or coverage (bounded landing workflow).
- Link targets exist at the linked relative paths.

## Milestones

- [x] M1: README sentence, link targets checked (all three exist), `just explainer-twins-check` green (345 pages, 562 SVGs, 5 images).
- [ ] M2: Codex review recorded; landing waits for the operator.
