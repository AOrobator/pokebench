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
- COMMIT: `docs(skills): coordinator never forwards a job to itself; check by watcher only` (2b870b8f8)
- GPT lane round 1, through the coordinator (worker job 3), db3d713df..2b870b8f8, diff sha256 3e2df3d6d9a1932c2c34c6353a724c822112c740fa061f63627a32138fc31f60: BLOCKING, three Fix: a letter with several jobs gave every worker every job; a replayed letter after an interrupted turn could start a second worker; the `codex queue` fallback left a job no rule covered. Now: one job per letter with a `JOB <job id>:` prefix, the worker thread is named after the job id and the coordinator checks for it before starting one, and a queued `JOB` message is handled the same way; Claude does not resend it.
- COMMIT: `docs(skills): one job per letter, named workers, and the queue fallback` (c8b52fcd1)
- GPT lane round 2 (coordinator worker), 2b870b8f8..c8b52fcd1: multi-job letters and the queued-job handler closed; BLOCKING on two Fix: (1) a subagent task name cannot hold the job id and `just codex-sessions` shows only 10 chats, so the replay check could miss a worker; (2) a nonzero `codex queue` exit printed the same line, and the skill said not to resend. Now the coordinator acknowledges a batch before starting its workers (at most once; a lost job is noticed by Claude), workers are desktop chats titled `JOB <job id>` looked up with `--limit 200` for queued jobs only, and a nonzero `tell-codex` exit means resend. Round cap reached: asking the operator through the coordinator whether to run round 3.
- COMMIT: `docs(skills): start a job at most once; a failed tell-codex means resend` (5756b3114)
- GPT lane round 3 (the operator: not waived; coordinator said run it), c8b52fcd1..5756b3114: both round 2 gaps closed; BLOCKING on one Fix: the title lookup ran only for queued jobs and with a 200-chat limit, so the same job by both paths, or after 200 newer chats, could start twice. Now the lookup runs for every job, over the full listing, and must succeed before a worker starts.
- COMMIT: `docs(skills): every job checks for its JOB chat before a worker starts` (623e61bc2)
- GPT lane round 4, 5756b3114..623e61bc2: round 3 closed; BLOCKING on one Fix: a missing session index lists nothing and exits 0, which reads as no match. Now a missing or empty index counts as a failed lookup.
