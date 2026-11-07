# Codex coordinator starts workers

## Problem Statement

On 2026-11-07, review packets sat for hours in an ordinary Codex thread ("Compare Sol and Astra pricing") because `just tell-codex` fell back to `codex queue`, which delivers only at that thread's turn end. The operator: "u need to crud ur skills so u spin up a codex coordinator chat if there isn't an active one" and "the coordinator doesn't do work at all, it should spin up threads to do work".

## Change (prose only)

- talk-to-codex: new "Asking Codex to do work" section. Work goes only through an active coordinator, never an ordinary thread; check its watcher with `pgrep -lf mailbox-watch`; if none, ask the operator to start one in their own words and start its watcher detached; one job per task.
- codex-coordinator: a letter addressed to the coordinator's own id is a job; it starts one worker thread per job and never does the work.
- execute-worklog: the GPT lane goes through the coordinator.
- No code or recipe change.

## Checks

- `git diff --check` clean.
- COMMIT: `docs(skills): Codex work goes through a coordinator that starts workers` (f68a3d55d)
- Claude CLI review of f68a3d55d: LGTM, three wording notes applied in the next commit.
- GPT lane: through the coordinator, once the operator starts one.
