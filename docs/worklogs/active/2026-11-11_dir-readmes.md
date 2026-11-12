# Directory READMEs for public readers

Status: M1 in progress on `claude/dir-readmes` (worktree `~/dev/pokebench-dir-readmes`), off main e2b027064. The operator 2026-11-11 21:26 ET: "we need readmes for docs/ docs/designs/ docs/findings docs/worklogs that also links to the worklog skill experiments/ packages/ packages/agent/ packages/viewer/ schemas/ scripts/".

## Problem Statement

The public repository's folders have no READMEs, so an outside reader browsing GitHub sees bare file lists.

## Architecture

Ten prose-only README.md files: `docs/`, `docs/designs/`, `docs/findings/`, `docs/worklogs/` (links `.claude/skills/feature-worklog` and `execute-worklog`), `experiments/`, `packages/`, `packages/agent/`, `packages/viewer/`, `schemas/`, `scripts/`. Written by three parallel subagents from the actual files; facts checked against code, the justfile and package.json.

## Invariants

- **INV-1** Every relative link resolves (checked: 145 links, 0 broken).
- **INV-2** No private details: every file passes the publish guard's blocklist and the session-ID rule (checked: 0 hits).
- **INV-3** Prose only: no code, config or generated file changes.

## Milestones

**M1**
- [x] Ten READMEs written; links and privacy checked
- [x] Independent review: GPT round 3 `VERDICT: LGTM` (rounds 1-2 BLOCKING on accuracy, fixed)
- [x] Landed fast-forward at 8cd134dca as number 1 on the board (rebased onto 4125c5a77, patch-id 952492d871a4 unchanged). Prose only, so no application gates per the bounded landing workflow
- [x] Scrub-sync: export of private 3b6afcfcb with pass3 (plus a narrow map of a fake home-folder worktree path in the agent-mail addressing test), merged into the public copy as d1a44e8f9; public lint and test green (agent 3,042, viewer 1,305, env 3,466, gateway 39); guard push scan passes. Push is the operator's

## Session Log

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-dir-readmes-94671915a)

`VERDICT: BLOCKING`, three P2 accuracy fixes, all accepted: experiments/README now says `target` also ends the run unless `stopAt` is set; viewer README says HTTP(S) origins (cli.ts accepts both); docs/README drops the one-explainer-per-switch claim (413 features, 345 explainers including tooling pages).

### Round 2 — GPT

`VERDICT: BLOCKING`, one P2: `stopAt` does not override `target`; parsePlayPreset rejects a non-null target that differs from stopAt. Fixed: stopAt supplies the stop milestone when target is null; when both are set they must match.

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
