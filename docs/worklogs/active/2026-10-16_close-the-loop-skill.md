# Close-the-loop skill

## Problem

Operator (2026-10-16 1:25 PM EDT): PokeBench needs a skill that makes agents always check and validate their work by whatever means the change needs: unit tests, clicking through the website, rehearsing scheduled runs with fake data to see they chain and finish on time. Same-day misses: a desktop mockup legend crushed to one column (only phone checked), a stale viewer build hiding a live run, the experiment filter dropping moved-ledger runs, colliding 8790 restarts.

## Decision

New skill `.claude/skills/close-the-loop/SKILL.md` (docs only, no behavior change, no feature switch): a proof table by surface, viewer/page proof, fake-data rehearsal for runners and schedules, live proof after merge, and a receipt. CLAUDE.md points to it. Local stack's P8 "close the loop" covers coordination closeout; this skill covers verification.

## Checklist

- [x] Skill and CLAUDE.md pointer.
- [ ] Reviews: Claude, grok, Codex `VERDICT: LGTM`; fast-forward merge.
