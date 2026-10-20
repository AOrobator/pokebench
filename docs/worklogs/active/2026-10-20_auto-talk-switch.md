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

- Review r1 on 588f083c: Grok LGTM, Claude LGTM (non-blocking: old breaker-on runs read back with auto-talk off by featuresOf; toggling auto-talk with the breaker off does nothing).
- The operator 1:06-1:07 PM ET (via coordinator): split the collapse into its own switch, on in both arms; remove the breaker's short instruction from both arms. Coordinator: control must not pick up auto-talk. Done: duplicate-turn-collapse-v1 (stage 1 only); fixed-point-breaker-v1 unchanged (collapse + note), presets turn it off; auto-talk-v1 acts with the breaker or the collapse, and when omitted takes the preset's breaker value (so control stays off; DEFAULT_NEXT_RUN and flagFeatures off). positive-supervisor-v1 is a separate code path, unaffected.

## Surprises
## Multi-Model Review Log
## Boy Scout Log
## Archive Milestone (user-gated)
- Pending experiment pinned to 54c7e9d9bd9fc58e1d9ee6950dac0e6bdf7026d7.
- Gates: agent 2834, viewer 1387 (server-stream timing test flaked once, passes on rerun twice); lint clean; coverage agent 97.1/93.0/97.6, viewer 95.1/91.1/93.9.
