---
name: feature-worklog
description: Persistent multi-milestone tracker for PokeBench. Survives context windows. Trigger with "create worklog", "start feature worklog", or when work needs 3+ milestones.
---

# Feature Worklog (PokeBench)

This is the PokeBench variant of the canonical pattern in `~/dev/local-inference-stack/.claude/skills/feature-worklog/SKILL.md`.

## Layout

- The body is tracked at `docs/worklogs/active/<YYYY-MM-DD>_<slug>.md`.
- The root `WORKLOG.md` is a gitignored one-line pointer to the body. Read the pointer first, then the body.
- To archive (only with operator approval): move the body to `docs/worklogs/<YYYY-MM-DD>_<slug>.md` and delete the pointer.

## Start gate

The worklog body exists and the operator has approved it before any implementation edit. Read-only discovery is fine before that.

## Required sections

- Problem Statement (before Skills Loaded)
- Skills Loaded
- Architecture
- Invariants (`INV-N`: invariant, rationale, test strategy)
- Security Review
- Milestones
- Closing the Loop
- Session Log
- Surprises
- Multi-Model Review Log
- Boy Scout Log
- Archive Milestone (user-gated)

## Milestone shape

```markdown
**M[N] — Name**
- [ ] Write tests (specific cases)
- [ ] COMMIT: `test(scope): ...` (RED)
- [ ] Implement
- [ ] Gates: `just test` (record TS + Python counts), `just lint`, `just build`, `just coverage` (≥90 both stacks)
- [ ] COMMIT: `feat(scope): ...` (GREEN)
- [ ] Smoke / visual evidence when the milestone touches the emulator, gateway or viewer
- [ ] Multi-model review loop until clean
```

## Rules

1. Update the body immediately after every commit: check boxes, record `COMMIT: \`msg\` (sha)`, test counts, and gate status. The pre-commit hook enforces freshness by mtime.
2. Never check an `ASK USER` box yourself.
3. After compaction, read the worklog first.
4. Mark deferrals explicitly: `- DEFERRED (reason)`.
5. For every guard a test claims to protect, delete the guarded behavior once and watch the test go red. Restore it, and record that you did.
6. Coverage floor is 90% (project override). Never widen excludes to pass.
7. Log surprises, and update this skill in the same session when a surprise changes the procedure.

## Veto

- Implementation before approval
- A milestone marked done without gates or review
- Commits without worklog updates
- `--no-verify`
- A ROM staged or copied
- `any` in TS
- Shell-string subprocesses
- A modified vendor submodule still excluded from coverage
- Archiving without approval
