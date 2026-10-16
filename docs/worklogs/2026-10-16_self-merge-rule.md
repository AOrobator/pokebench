# Docs: agents may merge their own work to local main after cloud review

Requested by the operator (2026-10-16 02:58 New York): when a model is building, it may merge to main once it has code-review approvals, with the review skills linked; land this change once approved.

Docs-only change; no feature switch. Branch `claude/self-merge-rule` in `/private/tmp/pokebench-self-merge-rule`.

## M1: self-merge rule

- [x] Merge guard check: there is no merge hook or setting on the Mac (`~/.claude/settings.json` hooks are status and worktree isolation only; no managed settings). The guard is Claude Code's auto-mode safety check, which blocks a merge or an instruction change unless the operator's own words are visible to the session. It blocked the first attempt at this very edit until the operator's message reached the session directly. The new rule leaves it unchanged and tells agents to quote the operator's standing OK or ask when it blocks.
- [x] CLAUDE.md Git section: self-merge allowed after Claude, Grok and GPT/Codex cloud lanes return LGTM; local inference reviewers never count; a blocked cloud lane means ask; no push/PR.
- [x] execute-worklog skill: new step 6 LAND and a "Landing on main" section linking the multi-model-review skill and its reviewer-invocation reference.
- [x] COMMIT: `docs: agents may merge their own branch into local main after cloud review approves` (d5abe931)
- [x] Review round 1 on d5abe931: Claude CLI LGTM, Grok (cursor-grok-4.5-high) LGTM, Codex CLI (gpt-5.6-sol) BLOCKING. Taken: principles table now scores PB1–PB13 one row each; the merge names the reviewed head SHA, and post-review records go in a follow-up commit touching only `docs/worklogs/`; local endpoint lanes are stated as not required and never substitute (a BLOCKING from one is still addressed). Post-merge `just test` kept and added to the boundary. Lanes: `~/.claude-review` login expired, so Claude ran on the default profile; Cursor Claude/GPT models at their usage limit until 2026-10-17.
- [x] COMMIT: `docs: landing merges the reviewed head SHA; local endpoint lanes are not required and never substitute` (91d8eaae)
- [x] Review round 2 on 91d8eaae: Claude CLI LGTM, Grok LGTM, Codex BLOCKING. Taken: sync `main` into the branch before sealing and land `--ff-only`, with a byte-identical packet check if `main` moved; the loop's "every lane" now means the three cloud lanes, local endpoints are optional and a subagent fallback never counts; the post-landing evidence commit is an explicit review exception limited to `docs/worklogs/`; post-landing `just test` must pass or the agent stops and reports.
- [x] COMMIT: `docs: landing syncs main first and fast-forwards; ...` (ee03d324); synced main at b8f8a5e6.
- [x] Review round 3 on b8f8a5e6 (base main 0cb1959a): Claude LGTM, Grok LGTM, Codex BLOCKING: making the local endpoint lanes optional changes the review roster without the operator's own word. Taken: the loop keeps its full roster; the rule now only says local lanes and subagent fallbacks never count toward self-merge approval. Making local lanes optional is left for the operator to decide.
- [x] COMMIT: `docs: self-merge keeps the full review roster; only cloud lanes count as approval` (50e2586b); round 4 superseded.
- [x] Coordinator pointed to the operator's standing decision; found in `docs/worklogs/active/2026-10-13_viewer-controls.md` (2026-10-13T16:17Z, "dont use local reviews cuz they're noisy") and repeated in the 2026-10-15 worklog briefs. execute-worklog step 4 now says PokeBench runs no local inference reviewers and cites it; CLAUDE.md matches.
- [x] COMMIT: `docs: PokeBench runs no local inference reviewers (operator decision 2026-10-13)` (a1465255)
- [x] Review round 5 on a1465255: Claude LGTM, Grok LGTM, Codex BLOCKING: the 2026-10-13 record scopes the waiver to that worklog's remaining rounds. Asked the operator. The operator, 2026-10-16 03:31 New York: "Yes, local reviewers should be dropped from all Pokebench reviews for good, especially because we use the local reviewers for the Pokebench benchmarks." At 03:32 in this thread: "I'm approving the edits to claude.md and the execute work log skill." Step 4 and CLAUDE.md now cite the decision.
- [x] Synced main (83bab426). The operator, 03:34 New York: "We're looping way too much with the self-merge rule. Five reviews is more than enough. You can just merge it in." Landed fast-forward: main = 83bab426. Round 6 (Claude, Grok, Codex) was in flight at landing; its verdicts are not a landing condition for this change.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-16). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
