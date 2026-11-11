# Explainer twins: "the operator" instead of "Operator"

Status: M1 in progress on `claude/twins-operator-wording` (worktree `~/dev/pokebench-twins-wording`), stacked on `claude/twins-fake-host` 01f1b1dc3, off main 79704679f. The operator 2026-11-11 ("2. sure", to the item relayed by the coordinator): in the regenerated explainer twins, change "selected by Operator" / "Operator stop" to "the operator". This branch lands the fake-host commit too.

## Problem Statement

`explainer_twins.scrub` replaced the operator's name with a bare "Operator", which reads as a proper noun ("Approved by Operator", "(Operator 2026-11-01)"). In the public copy the publish scrub first turns the name into "The operator", which the twins' regex then turned back into "Operator".

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`

## Architecture

The name rule leaves `_SCRUBS` and runs last as `_NAME.sub(_the_operator, ...)`: the name (with an optional preceding "the", so "the operator" does not become "the operator") becomes "the operator", capitalised at the start of the text, after a sentence end, at a line start after markdown markers, or in a table cell. Twins regenerated with `just explainer-twins` (84 files).

## Invariants

- **INV-1** No name survives: the existing assertions that no "The operator"/"andrew" appears in twins, the README index or features.md still pass.
- **INV-2** Mid-sentence use is lowercase, sentence start is capitalised (new test cases).
- **INV-3** `just explainer-twins-check` is clean after regeneration.

## Security Review

Changes only the wording of the replacement; every name pattern is still scrubbed.

## Milestones

**M1**
- [x] Scrub change and tests; focused tests 30/30; ruff and mypy clean
- [x] Twins regenerated; check clean; no mid-sentence "Operator" remains
- [ ] Full gates (CPU window requested first)
- [ ] Codex review (covers 79704679f..head, both commits)
- [ ] Land (the operator approved landing for item 3; item 2 asks for the change)

## Closing the Loop

## Session Log

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
