# auto-talk-v1: the fixed-point breaker's stage 3 as its own switch

## Problem Statement
Follow-up item 4 (ChatGPT review list, the operator "yes" 2026-10-20 12:44 PM ET): split auto-talk out of fixed-point-breaker-v1 into its own switch, log every intervention, and keep the bundle's behavior unchanged.

## Architecture
auto-talk-v1 (guard, needs null). When a preset omits it, it takes the preset's fixed-point-breaker-v1 value (presets with the breaker on keep stage 3; control stays off). autoTalkContext returns the base transform unless auto-talk-v1 and (fixed-point-breaker-v1 or duplicate-turn-collapse-v1) are on. duplicate-turn-collapse-v1 is stage 1 alone. Every attempt is already an auto_talk event; run_start lists the switch.

## Invariants
- INV-1: breaker ON + auto-talk ON = today's behavior; breaker and collapse both OFF = no auto-talk whatever this switch says; control (collapse on, breaker off, auto-talk omitted) = no auto-talk.

## Milestones
**M1**
- [x] RED: auto-talk.test.ts registry/default/both-switches cases, viewer default and explainer link, preset expectations, registry +1 shifts.
- [x] GREEN: registry, presets (default true), next-run, autoTalkContext gate, explainer note and link, pending experiment, readiness row.
- [ ] Review (Claude + Grok), merge slot, ff-only

## Session Log
- Branch claude/auto-talk-switch from claude/positive-supervisor ddb2b4b2 (now on main).

- Review r1 on 588f083c: Grok LGTM, Claude LGTM (non-blocking: old breaker-on runs read back with auto-talk off by featuresOf; toggling auto-talk with the breaker off does nothing).
- The operator 1:06-1:07 PM ET (via coordinator): split the collapse into its own switch, on in both arms; remove the breaker's short instruction from both arms. Coordinator: control must not pick up auto-talk. Done: duplicate-turn-collapse-v1 (stage 1 only); fixed-point-breaker-v1 unchanged (collapse + note), presets turn it off; auto-talk-v1 acts with the breaker or the collapse, and when omitted takes the preset's breaker value (so control stays off; DEFAULT_NEXT_RUN and flagFeatures off). positive-supervisor-v1 is a separate code path, unaffected.

- Review r2 (cd32a1f6): Grok LGTM; Claude BLOCKING: fixed-point-breaker-v1.json still described stages 1-3 though its candidate now runs 1-2. Fixed the hypothesis and notes, stale copy (breaker, auto-talk Off, readiness, explainer, duplicated sentence); test that the experiment's candidate has auto-talk off.

## Surprises
## Multi-Model Review Log
## Boy Scout Log
## Archive Milestone (user-gated)
- Pending experiment pinned to 54c7e9d9bd9fc58e1d9ee6950dac0e6bdf7026d7.
- Gates: agent 2834, viewer 1387 (server-stream timing test flaked once, passes on rerun twice); lint clean; coverage agent 97.1/93.0/97.6, viewer 95.1/91.1/93.9.
- Gates after the collapse split and main sync: agent 2837, viewer pass; lint clean; coverage agent 97.1/93.0/97.6, viewer 95.1/91.1/93.9.
- Preset change in the same landing (coordinator 1:26 PM ET): bundle-v-control and bundle-cook-1h: duplicate-turn-collapse-v1 on in both (onInBoth, base true), fixed-point-breaker-v1 off in both (offInBoth), auto-talk-v1 a bundle switch (base false, bundle true). Control base unchanged (controlBaseProblems clean). Tests: fixed-runner arm bits; open-goal-prompt incumbent comparison excludes the two new keys. Agent 2848, viewer 1389; lint clean.
- 2026-10-20 ~3:15 PM ET: merge slot (coordinator 3:08 PM). Merged main c124ed3f (semantic-navigation-v2, deterministic-exploration in the bundle); my switches now follow semantic-navigation-v2. Conflicts: registry +2 shifts (taken from main and re-shifted), features/presets/next-run keep both; fixed-runner test re-applied; semantic-navigation-v2 registry test at(-3). Agent 2873, viewer 1400, pytest 2906 (main venv; Python unchanged); lint clean. The diff against main differs from the reviewed r3 packet only by these sync edits.

## Review and landing
- r1 (588f083c) both LGTM; r2 (cd32a1f6) Grok LGTM, Claude BLOCKING (experiment text); r3 (9f788b07) Grok and Claude (subagent) LGTM. Artifacts runs/reviews/auto-talk-switch/.
- Coordinator merge slot 3:08 PM ET. Merged main three times (semantic-navigation-v2 c124ed3f, the Rustboro trainer frontier landings) and landed ff-only at c5ed42cc. On main: build; agent 2873, viewer 1400, pytest 2906 pass; just fixed-run check bundle-v-control and bundle-cook-1h: control base matches; bundle switches include auto-talk-v1, semantic-navigation-v2, deterministic-exploration-v1; fixed-point-breaker-v1 off in both; duplicate-turn-collapse-v1 on in both.
