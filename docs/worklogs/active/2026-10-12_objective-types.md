# Objective completion types and actionable errors

## Problem Statement
Qwen run5d0f reached the truck but exhausted three retries: accepted started="true" never matched boolean true. User approved enforcing correct types and clear errors, worklog first, then landing. Original run logs remain immutable.

## Skills Loaded
feature-worklog; multi-model-review and its invocation/test-quality/synthesis contracts.

## Architecture
Tighten live objective creation at the schema/tool/tracker boundary; preserve historical event parsing. Diagnose each completion rejection precisely. Include supported completion scalars in existing bounded evidence context. No retry policy, gameplay, viewer, navigation, or naming-skill changes.

## Invariants
- INV-1: field determines value type; no coercion; reject before recording/replacing an objective. Test actual tool invocation and tracker state preservation.
- INV-2: completion requires current verified state; errors distinguish absent state, stale evidence, mismatched value and wrong completion kind. Test exact payload and successful recovery.
- INV-3: historical logs remain readable; event schema unchanged. Test original string-boolean objective event acceptance.
- INV-4: all scalar completion fields are visible in recent state facts; exact context assertions.

## Security Review
Untrusted arguments remain schema-validated; no new subprocess, dependency, network surface, RAM write, or credentials. Diagnostics use bounded existing scalar values. Existing retry bound stays3.

## Milestones
**M1 — Typed completion and recovery diagnostics**
- [x] RED tests and commit
- [ ] Implementation and GREEN commit
- [ ] Full tests, lint, build and coverage >=90% each stack
- [ ] Performed/restored mutation checks
- [ ] Principles self-review and independent multi-model review
- [ ] Land exact reviewed source, rebuild canonical main, retain receipts and clean temporary worktree

## Closing the Loop
User's direct instruction authorizes implementation and landing. No new benchmark runs or efficacy claim. Keep historical event schema separate from new request validation so old evidence stays inspectable.

## Session Log
2026-10-12: approved after exact recorded mismatch diagnosis (objective24/316 string true versus state807/891 boolean true; retry809/893/1011). Scope focused on types/errors/evidence legibility; retry-budget redesign deferred.

## Surprises
None yet.

## Multi-Model Review Log
Pending. Roster according to repository skill, any outage retained and fallback explicit.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] ASK USER: archive this worklog after closeout.

RED commit a11f9f6: three reproduced failures, 27 existing focused tests pass. Dependency setup initially lacked package links; isolated offline install corrected it without touching canonical dependencies.

GREEN preparation: 363agent +147viewer +378unchangedPython tests =888; TS coverage98.67/93.02/98.28/99.15 and viewer97.47/91.45/98.42/98.36 (statements/branches/functions/lines), Python99.34lines/96.77branches/100functions. Lint/types/format/build pass. Ten individually performed/restored mutants cover shared type guard, set boundary, advertised schema, value diagnostic, absent state, stale evidence, visual kind, and each of three new evidence fields; focused suite restores GREEN. Original historical event schema stays unchanged; current inputs reject wrong primitive types without coercion.
