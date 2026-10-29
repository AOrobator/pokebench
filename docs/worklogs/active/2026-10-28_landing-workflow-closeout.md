# Bounded landing workflow

User authorization2026-10-28: update repository workflow/skills and coordinate other chats; prioritize moving-main evidence reuse, smaller final milestones and cheap checks before full gates. Docs-only bounded task, not a new multi-milestone feature.

Scope: CLAUDE.md and existing execute-worklog, feature-worklog, talk-to-claude/talk-to-codex and close-the-loop skills. No executable/config/build changes, no review-roster/coverage changes, no gameplay/service/viewer actions; no global or memory edits. Skill creator, execute-worklog and talk-to-claude read.

- [x] Diagnose conflicting main-hold/invalidation instructions and notify Claude/Codex coordinator of ownership. Coordinator relayed to four active Codex owners and Claude; no overlapping owner reported. CPU authority remains Claude relay.
- [x] Define one impact-based moving-main rule; preserve immutable reviewed packet and pin-bound receipts, scope overlap revalidation, retain required combined post-main check.
- [x] Separate bounded source readiness, landing and activation; inventory existing consumers before final review.
- [x] Require cheap changed-scope lint/types/focused tests before full CPU request; document prerequisite builds and prose-only checks.
- [ ] Validate prose/skill metadata/references and scenario consistency; independent frozen review.

Coordination: Claude relay confirms no overlapping workflow owner, CPU authority through just tell-claude, post-main priority and quiet-window exclusion. Its current link to other Claude chats is down; final policy delivery will be recorded accurately. Coordinator already relayed ownership to four active Codex owners. Added close-the-loop refresh exception to remove a contradictory consumer of the prose-only rule; no runtime behavior change.
- [ ] Commit, serialized docs-only landing/main checks; final policy broadcast and acknowledgments.

Invariants: no main hold; no clean-merge/file-disjointness shortcut for contract impact; no evidence relabeling; review roster/blockers/90% gates/operator stops preserved; docs-only exemption excludes executable/runtime inputs. New workflow explicitly requested by human; PB10 gate-selection changes authorized by that request.

Session: source updates prepared on owned codex/landing-workflow-closeout using existing attached worktree, based on mainbdeadfbe9. Canonical root pointer belongs budget-extension chat and will remain unchanged. No heavy CPU slot requested.

Validation: all5 skill validators PASS; git diff --check PASS; all canonical .claude references exist and existing talk-to-claude Codex alias resolves to the same owner. Initial validation helper wrongly assumed every internal skill has a Codex catalog alias; assertion failed, corrected to validate actual references/aliases, no repo source change or false passing receipt. Entire candidate only6 existing prose files + this worklog. No application checks/CPU slot/refresh required. Scenario inspection: evidence-only main move retains receipts; disjoint files with shared schema treated affected; changed feature patch needs delta review; executable/runtime change cannot use prose exemption; activation-discovered bug returns to bounded source correction. Test-quality9checks N/A: no executable tests/guards/fixtures changed; proof is document validation, scenario review and coordination. Independent frozen review next.
