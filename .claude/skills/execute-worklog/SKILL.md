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
  4. REVIEW  multi-model review loop until every lane returns LGTM
  5. advance; STOP at any milestone marked operator-in-the-loop or "STOP"
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
4. `think_fast` + `think_swarm` endpoints in parallel. Discover the model id from `/v1/models` and send `chat_template_kwargs.enable_thinking=false`.
5. Independent lanes: a Grok family (Cursor) and a GPT family (Cursor or isolated Codex).
6. If an equivalent harness is unavailable, switch to the other one. Once every harness for a lane is exhausted, use the standing subagent fallback: two fresh read-only subagents on distinct models. Record reduced diversity honestly.
7. Write the review synthesis. Fix accepted findings in one batch, then re-review the cumulative delta.

Record every round in the worklog's Multi-Model Review Log. A broken lane is never a clean review.

## Do not

- Reorder milestones.
- Skip review.
- Batch worklog updates.
- Proceed past an operator checkpoint.
- Archive without approval.
