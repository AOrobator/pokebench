# Close-the-loop skill

## Problem

Operator (2026-10-16 1:25 PM EDT): PokeBench needs a skill that makes agents always check and validate their work by whatever means the change needs: unit tests, clicking through the website, rehearsing scheduled runs with fake data to see they chain and finish on time. Same-day misses: a desktop mockup legend crushed to one column (only phone checked), a stale viewer build hiding a live run, the experiment filter dropping moved-ledger runs, colliding 8790 restarts.

## Decision

New skill `.claude/skills/close-the-loop/SKILL.md` (docs only, no behavior change, no feature switch): a proof table by surface, viewer/page proof, fake-data rehearsal for runners and schedules, live proof after merge, and a receipt. CLAUDE.md points to it. Local stack's P8 "close the loop" covers coordination closeout; this skill covers verification.

## Checklist

- [x] Skill and CLAUDE.md pointer. COMMIT: `docs(skills): close-the-loop: prove each change at the surface the operator uses` (3e70f267)
- [x] Review 1: Codex, grok and Claude BLOCKING. Fixed: the rehearsal goes through `runFixed`'s injected `FixedHost` and a scratch root (`just fixed-run` and the default audit touch the real runs/); harness proof uses Activity History and the raw inspector (timeline closed); lanes come from `experiments/fixed/<id>.json` + `runner.json` + `lsof`; trial replacement is fixed-run only; the live build stamp path is the 8790 tree's; restarts follow CLAUDE.md (after every merge, coordinated, once); viewer-e2e and fixed-run-launch named; scratch viewers start the queue runner on their root.
- [ ] Reviews: Claude, grok, Codex `VERDICT: LGTM`; fast-forward merge.
- [x] Re-review: grok and Claude LGTM; Codex BLOCKING on two wording errors (audit is read-only; stamp path under $POKEBENCH_VIEWER_WORKTREE). Fixed; Codex delta re-review next.

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (a02fba9d docs(skills): close-the-loop: the audit only reads; full custom stamp path). Unchecked boxes left above are bookkeeping from before that landing.
