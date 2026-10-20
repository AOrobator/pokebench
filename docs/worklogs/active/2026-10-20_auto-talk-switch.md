# auto-talk-v1: the fixed-point breaker's stage 3 as its own switch

## Problem Statement
Follow-up item 4 (ChatGPT review list, the operator "yes" 2026-10-20 12:44 PM ET): split auto-talk out of fixed-point-breaker-v1 into its own switch, log every intervention, and keep the bundle's behavior unchanged.

## Architecture
auto-talk-v1 (guard), retroactive and default ON (feature-switch rule for landed behavior), needs null so presets with the breaker off stay valid. autoTalkContext returns the base transform unless fixed-point-breaker-v1 AND auto-talk-v1 are on, so control and any preset with the breaker off are unaffected. Every attempt is already an auto_talk event; run_start lists the switch.

## Invariants
- INV-1: breaker ON + auto-talk ON = today's behavior; breaker OFF = no auto-talk whatever this switch says.

## Milestones
**M1**
- [x] RED: auto-talk.test.ts registry/default/both-switches cases, viewer default and explainer link, preset expectations, registry +1 shifts.
- [x] GREEN: registry, presets (default true), next-run, autoTalkContext gate, explainer note and link, pending experiment, readiness row.
- [ ] Review (Claude + Grok), merge slot, ff-only

## Session Log
- Branch claude/auto-talk-switch from claude/positive-supervisor ddb2b4b2 (now on main).

## Surprises
## Multi-Model Review Log
## Boy Scout Log
## Archive Milestone (user-gated)
