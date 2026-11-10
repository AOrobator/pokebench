# Only the operator ends a run

Branch `claude/operator-stop-conditions`. Prose-only (CLAUDE.md, talk-to-codex skill). Asked by the operator 2026-11-10 after the relay-invented $40 equivalent-spend stop ended Opus 12bf at turn 248 and a duplicate wrapper timer on 5a70 ignored a viewer extension. Codex owns the launcher/single-timer fix and the plain-run-launch / run-coordination skills; this branch does not touch them.

## M1 rule text
- [x] CLAUDE.md non-negotiable "Only the operator ends a run"; talk-to-codex relay clearance rule. COMMIT: `Only the operator sets run stop conditions` (c7a7f7087)
- [x] Claude lane (fresh read-only subagent; `claude -p` OAuth expired): CHANGES — named presets/fixed definitions must count as the operator's limits, list preset guards, one-limit case, failed-launch stop carve-out. Addressed in the next commit.
- [x] Claude lane re-review of 300c840ed: CHANGES — talk-to-codex "applies none" contradicted CLAUDE.md for turns/time; one limit + no named preset unspecified. Addressed in the next commit.
- [ ] GPT lane (codex exec gpt-5.6-sol, read-only) on the revised head
- [ ] Claude lane re-review on the revised head
- [ ] Land (Grok waived until 11/17)

## Proposed, awaiting the operator
- Native save on every run end (extend `packages/agent/src/checkpoint-capture.ts`).
- Repo-owned tested launcher replacing per-receipt `supervise.py`.
