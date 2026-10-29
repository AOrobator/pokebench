---
name: feature-worklog
description: Persistent multi-milestone tracker for PokeBench. Survives context windows. Trigger with "create worklog", "start feature worklog", or when work needs 3+ milestones.
---

# Feature Worklog (PokeBench)

This is the PokeBench variant of the canonical pattern in `~/dev/local-inference-stack/.claude/skills/feature-worklog/SKILL.md`.

## Layout

- The body is tracked at `docs/worklogs/active/<YYYY-MM-DD>_<slug>.md`.
- The root `WORKLOG.md` is a gitignored one-line pointer to the body. Read the pointer first, then the body.
- To archive (only with operator approval): move the body to `docs/worklogs/<YYYY-MM-DD>_<slug>.md` and delete the pointer only if it points to this worklog; preserve pointers belonging to other tasks.

## Commit without waiting for landing

Once the operator authorizes archival, move and update the worklog and commit it
on the owned branch immediately. Do not leave an unapplied patch waiting for the
coordinator. Coordinator approval and the landing board govern moving `main`,
not committing on an isolated branch. A merge pause leaves branch commits
available; report an archive as committed on its branch until it actually lands.

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

## Size milestones before implementation

Give each source milestone one operator-visible outcome, the smallest existing production path set, named consumers, non-goals, a terminator and split triggers. Inventory entrypoints, launchers and lifecycle callers before review; integration glue is implementation, not rollout paperwork. Split when delivery adds another runtime owner, persistence/concurrency mechanism or independently reviewable capability. Do not bundle remaining work into an open-ended final milestone.

Keep three explicit stages in the plan; they need not be three separate source milestones:

1. **Source readiness:** implement the bounded outcome; cheap checks, applicable full gates, required smoke and independent review. Freeze source and list exactly what remains before landing.
2. **Landing:** upstream-impact note and evidence reuse per `execute-worklog`, serialized FF merge and one applicable post-main check. No new capabilities or extra polish.
3. **Activation/closeout:** only already-authorized install/refresh, process continuity, operator-surface proof and evidence. No feature code. If proof exposes a defect, stop the affected activation and return to a named bounded source correction; preserve valid prior receipts instead of reopening every milestone.

Record stage status separately. “Ready to land” means source checks/review are complete; do not use “landing” while still implementing. Define performance samples and operational checks before review so late suggestions cannot expand closeout. Record a residual qualification honestly rather than claiming an unproven acceptance check passed. Keep the existing two-round review cap and explicit operator checkpoints.

## Milestone shape

```markdown
**M[N] — Name**
- [ ] Write tests (specific cases)
- [ ] COMMIT: `test(scope): ...` (RED)
- [ ] Implement
- [ ] Cheap checks: changed-file lint, affected-package types, focused caller/behavior tests (or documentation validation for prose-only)
- [ ] Applicable gates per `execute-worklog`: CPU START after cheap GREEN, full executable gates once; record counts/coverage ≥90 and RELEASE
- [ ] Freeze outcome/path set, named consumers, non-goals, terminator and split triggers
- [ ] COMMIT: `feat(scope): ...` (GREEN)
- [ ] Smoke / visual evidence when the milestone touches the emulator, gateway or viewer
- [ ] Independent review; accepted fixes in one batch, two-round cap per `execute-worklog`
- [ ] Separate landing and authorized activation checklists; retain unaffected receipts if main advances
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
