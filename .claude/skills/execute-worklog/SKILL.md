---
name: execute-worklog
description: Execute the active PokeBench worklog milestone by milestone, with RED/GREEN commits and the multi-model review loop. Trigger with "execute the worklog". Stops at operator checkpoints.
---

# Execute Worklog (PokeBench)

## Loop

```
For each remaining milestone:
  1. RED     write failing tests, run them, see them fail, commit, update worklog
  2. GREEN   implement, run gates, commit, update worklog (test counts + gate status)
  3. SMOKE   real ROM / real gateway / browser evidence when the milestone touches them
  4. REVIEW  multi-model review loop until every required lane returns LGTM (required lanes: see "Landing on main")
  5. advance; STOP at any milestone marked operator-in-the-loop or "STOP"
  6. LAND    merge into local main once the cloud lanes approve (see "Landing on main")
```

## Gates

- `just test` (record vitest and pytest counts)
- `just lint` (tsc --noEmit, eslint, ruff, mypy)
- `just build`
- `just coverage` (≥90% lines, branches and functions, both stacks)
- `just verify-vendor` once the submodule exists

## Review loop

The contract is `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md`. Its reference commands are in `reference/reviewer-invocation.md`.

1. Principles self-review against `docs/agent-principles.md`. Score every ID; zero FAIL rows.
2. Seal the frozen packet: `git diff --binary BASE HEAD`, its SHA-256, the frozen boundary file, and the principles file.
3. Claude-family lane: Claude CLI (`CLAUDE_CONFIG_DIR=~/.claude-review`, `--permission-mode plan`), or Cursor Claude.
4. Optional: `think_fast` + `think_swarm` endpoints in parallel. Discover the model id from `/v1/models` and send `chat_template_kwargs.enable_thinking=false`. In PokeBench these local lanes are not required lanes (operator decision 2026-10-16); an unavailable local lane blocks nothing, but a BLOCKING finding from one that ran is adjudicated like any other.
5. Independent lanes: a Grok family (Cursor) and a GPT family (Cursor or isolated Codex).
6. If an equivalent harness is unavailable, switch to the other one. Once every harness for a lane is exhausted, use the standing subagent fallback: two fresh read-only subagents on distinct models. Record reduced diversity honestly. A subagent fallback never counts as a cloud lane for landing.
7. Write the review synthesis. Fix accepted findings in one batch, then re-review the cumulative delta.

Record every round in the worklog's Multi-Model Review Log. A broken required lane is never a clean review. The required lanes are the three cloud lanes: Claude, Grok and GPT.

## Landing on main

An agent may merge its own branch into local `main` without asking per merge (operator decision 2026-10-16) when all of these hold:

1. Before sealing the packet, merge current `main` into the branch and run the gates above on that tip; they pass.
2. The cloud lanes of the review loop each end `VERDICT: LGTM` on the same frozen packet: Claude (Claude CLI or Cursor Claude), Grok (Cursor) and GPT (Cursor GPT or isolated Codex). Contract and commands: `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md` and its `reference/reviewer-invocation.md`.
3. Land with `git merge --ff-only <frozen head SHA>`, so `main` becomes exactly the reviewed and gated tree. If `main` moved after the packet was sealed, merge `main` into the branch again and rerun the gates. If `git diff --binary main HEAD` then has the same SHA-256 as the reviewed packet, the branch's own change is byte-identical and it may land. Otherwise it needs a new review round. Any other change after the packet, code or docs, also needs a new round.
4. The worklog has no operator checkpoint or `STOP` before the merge.

Rules:

- Merge approval comes only from the three cloud lanes. The local inference lanes in the contract (`think_fast`, `think_swarm`, anything on `inference.example`) are not required for landing in PokeBench and never stand in for a cloud lane (operator decision 2026-10-16). If one runs and returns BLOCKING, address the finding like any other before merging.
- If a cloud lane is unavailable (usage limit, auth, model rejected), there is no self-merge. Record it in the worklog and ask the operator.
- After landing, `just test` on `main` must pass. If it fails, stop, report it to the operator and fix it on a new branch through the full loop.
- The one exception to re-review: after landing, record the verdicts and merge SHA in one evidence-only commit on `main` that touches only `docs/worklogs/` (check with `git diff --name-only HEAD~1`). It needs no review. Report the merge SHA in the thread.
- Never push, open pull requests or add a remote (see `CLAUDE.md`). This rule covers only the local merge. It does not cover approving or launching experiments, restarting live runs, or archiving the worklog.

Claude Code's auto-mode safety check on the Mac stays as it is. It lets a merge into `main` through only when the operator's own approving words are visible to the merging session. This rule does not loosen that check. When the check blocks a merge, quote the operator's standing approval in the thread, or ask the coordinator to attach it. If it is still blocked, ask the operator. Never work around it with another command, `--no-verify` or a settings change.

## Do not

- Reorder milestones.
- Skip review.
- Batch worklog updates.
- Proceed past an operator checkpoint.
- Archive without approval.
