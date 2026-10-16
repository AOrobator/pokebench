# Docs: agents may merge their own work to local main after cloud review

Requested by the operator (2026-10-16 02:58 New York): when a model is building, it may merge to main once it has code-review approvals, with the review skills linked; land this change once approved.

Docs-only change; no feature switch. Branch `claude/self-merge-rule` in `/private/tmp/pokebench-self-merge-rule`.

## M1: self-merge rule

- [x] Merge guard check: there is no merge hook or setting on the Mac (`~/.claude/settings.json` hooks are status and worktree isolation only; no managed settings). The guard is Claude Code's auto-mode safety check, which blocks a merge or an instruction change unless the operator's own words are visible to the session. It blocked the first attempt at this very edit until the operator's message reached the session directly. The new rule leaves it unchanged and tells agents to quote the operator's standing OK or ask when it blocks.
- [x] CLAUDE.md Git section: self-merge allowed after Claude, Grok and GPT/Codex cloud lanes return LGTM; local inference reviewers never count; a blocked cloud lane means ask; no push/PR.
- [x] execute-worklog skill: new step 6 LAND and a "Landing on main" section linking the multi-model-review skill and its reviewer-invocation reference.
- [x] COMMIT: `docs: agents may merge their own branch into local main after cloud review approves` (d5abe931)
- [x] Review round 1 on d5abe931: Claude CLI LGTM, Grok (cursor-grok-4.5-high) LGTM, Codex CLI (gpt-5.6-sol) BLOCKING. Taken: principles table now scores PB1–PB13 one row each; the merge names the reviewed head SHA, and post-review records go in a follow-up commit touching only `docs/worklogs/`; local endpoint lanes are stated as not required and never substitute (a BLOCKING from one is still addressed). Post-merge `just test` kept and added to the boundary. Lanes: `~/.claude-review` login expired, so Claude ran on the default profile; Cursor Claude/GPT models at their usage limit until 2026-10-17.
- [ ] Review round 2, merge.
