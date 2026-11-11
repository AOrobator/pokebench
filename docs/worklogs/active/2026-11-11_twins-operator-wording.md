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
- [x] Round-1 fix (GPT BLOCKING, 2 x P2): positional capitalisation now applies after an absorbed lowercase "the"; text nodes scrub the name to a marker (`scrub_inline`) and `scrub` of the assembled markdown capitalises it, so inline emphasis is not a sentence start. Regression tests for both; regeneration changed 0 files
- [x] Round-2 fix (GPT BLOCKING, 2 x P2): sentence-start context now passes through an opening link bracket and an inline-code backtick, and inline code defers the name to `scrub` of the assembled text. Conversion-level regression for both; regeneration changed 0 files
- [x] Round-3 fix (GPT BLOCKING, 1 x P2): the 13-character regex window is replaced by `_starts_sentence`, which skips opening markers, accepts a table cell or a line start (headings, quotes, bullets, numbered items), and otherwise strips closing markdown (emphasis, backticks, quotes, brackets, link targets of any length) back to the punctuation; context is the last 400 characters. Conversion-level regression with bold, a long link and code sentence ends; regeneration changed 0 files
- [x] Round-4 fix (GPT BLOCKING, 2 x P2): `_starts_sentence` reads the whole text before the name (no window), and single quotes (straight and curly) count as openers. Regression: a 420-character link target and quoted sentences; regeneration changed 0 files, `just explainer-twins` 1.9 s
- [ ] Full gates (CPU window requested first; the first window failed in seconds on a missing node_modules in the new worktree, since installed)
- [ ] Codex review (covers 79704679f..head, both commits)
- [ ] Land (the operator approved landing for item 3; item 2 asks for the change)

## Closing the Loop

## Session Log

## Surprises

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-twins-operator-wording-55322f221)

Scope 79704679f..55322f221, packet verified, 345 pages match the generator. `VERDICT: BLOCKING`, two Fix findings, both accepted and fixed in round 2: (1) `scrub("the operator picked it.")` stayed lowercase because an absorbed article disabled positional capitalisation; (2) `<p>Approved by <strong>The operator</strong> yesterday.</p>` gave "**The operator**" because each text node was scrubbed as if it started a sentence.

### Round 2 — GPT (JOB review-gpt-twins-operator-wording-r2-b4849357a)

Delta 55322f221..b4849357a; both round-1 inputs pass, all 345 pages match, no markers survive. `VERDICT: BLOCKING`, two Fix findings, both accepted and fixed in round 3: (1) `<p>Done. <a href="#x">The operator</a> approved it.</p>` gave `[the operator](#x)`; (2) `<p>Approved by <code>The operator</code> yesterday.</p>` gave `` `The operator` ``. The gates started on b4849357a were stopped early and RELEASE sent.

### Round 3 — GPT (JOB review-gpt-twins-operator-wording-r3-f7a221ae4)

Delta b4849357a..f7a221ae4; round-2 inputs pass, 914 generated files match, no markers survive. `VERDICT: BLOCKING`, one Fix: a sentence ending inside formatting (`**Done.** The operator`, `[Done.](#x) the operator`, `` `Done.` the operator ``) left the next sentence lowercase. Fixed in round 4 by parsing the markdown context instead of a fixed regex window. Gates on f7a221ae4 stopped early; RELEASE sent.

### Round 4 — GPT (JOB review-gpt-twins-operator-wording-r4-ab7801a1f)

Delta f7a221ae4..ab7801a1f; 914 files, zero drift, zero markers. `VERDICT: BLOCKING`, two Fix: a link target over 400 characters hid the sentence end; an opening single quote was not skipped. Both fixed in round 5. Gates on ab7801a1f stopped early; RELEASE sent.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
