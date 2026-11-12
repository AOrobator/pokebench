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
- [x] M2: Codex GPT review LGTM on dd9497cff (round 2); landing waits for the operator's go.

## Review

- 2026-11-11 19:50 ET: GPT (Codex job `review-gpt-readme-features-link-566b872b9`) round 1 BLOCKING, one P2: "says what each switch does" overclaims, since 53 of 413 switch rows in docs/features.md have no explainer. Links, the features.md description and style passed. Fixed by narrowing the sentence to "links the explainer for each switch that has one".
- 2026-11-11 19:52 ET: GPT round 2 (job `review-gpt-readme-features-link-r2-dd9497cff`) `VERDICT: LGTM` on packet sha256 779ec4c8…f0df: the narrowed wording resolves the P2, all 360 feature-table explainer links resolve and appear in the index.
- 2026-11-11 19:58 ET: The operator approved archiving three finished worklogs (linux-mgba-build, twins-fake-host, twins-operator-wording); moved to docs/worklogs/ on this branch so they land with it.
