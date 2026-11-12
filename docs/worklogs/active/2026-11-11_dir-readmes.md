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
- [ ] Independent review (Codex)
- [ ] Land; scrub-sync into the public copy

## Session Log

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-dir-readmes-94671915a)

`VERDICT: BLOCKING`, three P2 accuracy fixes, all accepted: experiments/README now says `target` also ends the run unless `stopAt` is set; viewer README says HTTP(S) origins (cli.ts accepts both); docs/README drops the one-explainer-per-switch claim (413 features, 345 explainers including tooling pages).

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
