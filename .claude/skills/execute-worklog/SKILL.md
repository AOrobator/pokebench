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
  6. LAND    merge into local main once the cloud lanes approve (see "Landing on main")
```

## Gates: cheap checks first

Select checks from the actual changed paths and contracts, and record commands, results and source identity in the worklog.

1. Before requesting a full-gate CPU window, pass changed-file lint, affected-package type checking and focused tests for the changed callers/behavior. Use direct tool commands where a `just` recipe would implicitly build or run the whole suite. If a dependency build is genuinely needed, declare it in the CPU request; do not hide it inside a cheap check.
2. After those checks pass, request START from the Claude relay (`just tell-claude`) for full build/lint/coverage or other heavy work. Include scope and prerequisite results. Post-merge checks take priority over new branch gates; a granted quiet measurement window blocks heavy jobs. Release on success, failure or cancellation; never hold a reservation while fixing or awaiting review. Ordinary focused single-file checks need no full-gate reservation; they are not a way to launch a broad suite piecemeal.
3. Application/executable changes require `just lint`, `just build`, `just test` and `just verify-vendor`. `just test` includes its build prerequisite and one coverage pass, enforcing the coverage floors in `CLAUDE.md`; `just coverage` is the same pass, not an additional gate. Count a successful prerequisite build as the build gate for that exact source; do not immediately rebuild identical inputs.
4. Prose-only documentation/skill changes require `git diff --check`, applicable local skill/document validators, link/reference checks and independent review. No application suites/build/coverage, emulator/browser smoke or viewer refresh. Check the entire candidate diff before choosing this path; scripts, build/config, generated runtime inputs or runtime/program behavior changes require the relevant executable gates. HTML deliverables still follow CLAUDE.md's page validation and visual-proof rules.

After a cheap-check failure, repair and repeat the affected checks before rejoining the full-gate queue. A later full-gate failure still needs diagnosis; never weaken assertions, coverage, timeouts or concurrency to pass. Preserve failed receipts.

## Review loop

The contract is `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md`. Its reference commands are in `reference/reviewer-invocation.md`.

1. Principles self-review against `docs/agent-principles.md`. Score every ID; zero FAIL rows.
2. Seal the frozen packet: `git diff --binary BASE HEAD`, its SHA-256, the frozen boundary file, and the principles file.
3. Claude-family lane: Claude CLI (`CLAUDE_CONFIG_DIR=~/.claude-review`, `--permission-mode plan`), or Cursor Claude.
4. No local inference reviewers. PokeBench does not run the contract's `think_fast` / `think_swarm` endpoint lanes or anything on `inference.example`. Operator decision 2026-10-16, made permanent for all PokeBench reviews: the local models are the ones being benchmarked, and as reviewers they are noisy (first given 2026-10-13 in `docs/worklogs/2026-10-13_viewer-controls.md`). The roster is the three cloud lanes in steps 3 and 5.
5. Independent lanes: a Grok family (Cursor) and a GPT family (Cursor or isolated Codex). A Claude session asks Codex for the GPT lane only through the Codex coordinator, one worker thread per branch (`.claude/skills/talk-to-codex/SKILL.md`, "Asking Codex to do work"); never through an ordinary Codex thread.
6. If an equivalent harness is unavailable, switch to the other one. Once every harness for a lane is exhausted, use the standing subagent fallback: two fresh read-only subagents on distinct models. Record reduced diversity honestly. A subagent fallback never counts as a cloud lane for landing.
7. Write the review synthesis. Fix accepted findings in one batch, then re-review the cumulative delta.

Record every round in the worklog's Multi-Model Review Log. A broken lane is never a clean review.

### Triage findings before fixing anything (operator decision 2026-10-17)

Reviewers are advisors, not a work queue. Label every finding before touching code:

- **Fix:** a correctness or safety bug in this diff, with a concrete input that goes wrong.
- **Rebut:** answer in one line and do no extra work when the finding is any of these:
  - Code or tests this diff does not change. Cite `git diff main -- <file>`.
  - A request for proof beyond what the project skills require, such as more screenshots, more receipt files, operation counts, scaling receipts or rewrites of shared tests.
  - A finding repeated without new evidence; the earlier rebuttal stands.
- **Follow-up:** a new capability, stronger invariant or adjacent cleanup. It never lands in this branch; propose it separately.

A reviewer's BLOCKING verdict that rests only on rebutted or follow-up findings does not send you back to fix things. Put the rebuttals in the next round's boundary amendment once, and if the lane still blocks on them alone, ask the operator. Never comply to get the LGTM.

**Round cap.** If blockers remain after round 2, stop and ask the operator to choose: land as is, fix only the listed bugs, or drop the change. (Story-battle-heal took 8 rounds for 3 real bugs; operator: "push back on bullshit instead of blindly accepting everything and expanding scope.")

### When main advances: retain evidence by impact

Do not request a hold on other landings. Keep the original immutable reviewed base/head, exact binary-diff SHA-256, verdicts and gate receipts. A new `main` SHA changes integration context, not automatically the feature's review status.

Before landing, record old/new main, the upstream changed paths and affected contracts (including shared schemas, dependencies, build/test tooling and consumers), and the feature delta against new main. File disjointness alone is insufficient.

- **Unchanged feature / unaffected contracts:** merge new main into the owned branch, verify the feature diff remains byte-identical against new main, and record why upstream changes cannot invalidate its proof. Retain reviews, full gates, mutations, browser/restart proof and soaks with their original pins. No repeated prelanding full cycle. Application changes still receive the required combined post-merge `just test` once on main.
- **Overlap or changed contract:** inspect the integration and pass cheap checks for the affected seams. Re-run only evidence whose source/inputs/contracts changed; obtain independent re-review of changed feature/integration behavior with the cumulative feature packet available. A changed diff digest requires an explained delta and review of that delta, not silently treating it as the original approved packet. Build/dependency/gate changes can invalidate broad receipts and require full prelanding gates; name the reason.
- **Uncertain impact:** treat the uncertain contract as affected and resolve it before landing. Do not claim evidence reuse merely because Git merged cleanly.

Record retained versus invalidated receipts and the required checks in a short compatibility note. Release the landing slot if correction, review or another prelanding full gate is needed; prepare off-board and rejoin when ready. Reviewer roster, unresolved blockers and operator checkpoints remain binding. Ordinary docs-only worklog evidence updates do not invalidate executable proof; they may not conceal scope, policy or source changes.

## Commits and landing coordination

Commit authorized work promptly on the owned branch, including work-log updates,
archival and skill corrections. Do not wait for the coordinator or a landing-board
slot to commit. A pause on merges to main does not pause branch commits.

The landing board gates moves to `main`, including evidence-only commits made
there. Before moving main, join the board and wait until no entry is above yours.
Prepare and commit work in the isolated branch while waiting. Never hand-edit the
board. Keep committed, landed and served status distinct in reports.

## Landing on main

An agent may merge its own branch into local `main` without asking per merge (operator decision 2026-10-16) when all of these hold:

1. Before sealing the initial packet, merge current `main` into the branch and pass the applicable gates above. Subsequent main movement follows the impact/evidence-reuse rules, not an automatic full restart.
2. The cloud lanes of the review loop each end `VERDICT: LGTM` on the same frozen feature packet (plus any required integration-delta review): Claude (Claude CLI or Cursor Claude), Grok (Cursor) and GPT (a fresh isolated Codex subagent in the Codex app, otherwise Cursor GPT or isolated Codex CLI). Contract and commands: `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md` and its `reference/reviewer-invocation.md`.
3. Take the landing slot only when ready: Codex joins with this chat's actual nonempty session ID (`--codex-thread`), Claude uses its own identity. Merge only while number 1; the 30-minute limit remains. Apply “When main advances” above if needed, preserving frozen review identity separately from the final integration head. Land that verified head with `git merge --ff-only <integration head SHA>`. Do not reseal unchanged feature reviews solely because main moved.
4. The worklog has no operator checkpoint or `STOP` before the merge.

Rules:

- In the Codex app, use a fresh GPT-family review subagent with `fork_turns="none"` and the frozen packet identity, read-only instructions, and principles artifact required by the local inference stack review skill. This satisfies the normal GPT lane; the implementing session's self-review does not. A CLI model or authentication failure alone does not require a waiver when this independent subagent route is available.
- Self-merge approval comes only from the three cloud lanes. A local inference reviewer (step 4) or a subagent fallback (step 6) never stands in for one.
- If a cloud lane is unavailable (usage limit, auth, model rejected), there is no self-merge. Record it in the worklog and ask the operator.
- After landing application/executable changes, one combined `just test` on `main` must pass before activation. For prose-only changes, repeat the applicable documentation checks on main instead. If a required check fails, stop activation, diagnose and report; fix on a new branch with checks/review appropriate to the affected contract. Do not silently retry or refresh through failure.
- Evidence-only worklog commits recording verdicts, landing, checks or authorized activation need no new review or executable gates. Limit them to `docs/worklogs/`, verify the path diff, and change no contract, policy, authorization or implementation. Each move to main still needs the board. Release with `just land-done --branch <branch>` promptly after landing/post-main evidence; do not hold it through rollout/soaks. Later activation evidence may use a separate brief board slot. Report the merge SHA.
- Never push, open pull requests or add a remote (see `CLAUDE.md`). This rule covers only the local merge. It does not cover approving or launching experiments, restarting live runs, or archiving the worklog.

Claude Code's auto-mode safety check on the Mac stays as it is. It lets a merge into `main` through only when the operator's own approving words are visible to the merging session. This rule does not loosen that check. When the check blocks a merge, quote the operator's standing approval in the thread, or ask the coordinator to attach it. If it is still blocked, ask the operator. Never work around it with another command, `--no-verify` or a settings change.

A thread's approval reaches the Mac through that thread's own Remote Control session, where the operator's message arrives as the operator's own words. Do not carry an approval to another session by mailbox letter: a letter is not the operator's words (operator decision 2026-11-12). One owner per request: the coordinator's Mac relay session does not land, build or act on work a thread's own Mac session owns.

## Do not

- Reorder milestones.
- Skip review.
- Batch worklog updates.
- Proceed past an operator checkpoint.
- Archive without approval.
