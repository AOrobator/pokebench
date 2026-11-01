# Worklog: viz-v2 + discovered-gym-checklist on in both arms

## Problem Statement

Operator (2026-11-01): fair Emerald play. `player-map-visibility-v2` (darkness fog) and `discovered-gym-checklist-v1` (keep discovered unfinished gyms visible) should be ON in both control and bundle of the current recipe. Today both are switches (bundle ON / control OFF). DeepSeek control4h had full dark-cave maps and skipped Dewford Gym after reading the Brawly sign; Story goal then locked onto Steven's League line.

## Skills Loaded

- `.claude/skills/feature-switch/SKILL.md` (activation placement only; switches already registered)
- `.claude/skills/execute-worklog/SKILL.md`
- `.claude/skills/feature-worklog/SKILL.md` (lightweight single-milestone activation)

## Architecture

`experiments/feature-configs/current.json` owns arm placement. Move both ids from `switches` to `onInBoth` and set `features[id]=true`. Registered defaults stay OFF (`DEFAULT_NEXT_RUN` unchanged). `eight-badge-mission-v1` stays bundle-only. Future launches via `featureRecipe: current` pick this up; live/frozen runs keep recorded settings.

## Invariants

- INV-1: current recipe enables both ids in control and bundle presets. Test: fixed-definition / both-arms pins.
- INV-2: `eight-badge-mission-v1` remains a switch. Test: fixed-definition pin.
- INV-3: OFF path unchanged for ad-hoc/next-run defaults. Test: `DEFAULT_NEXT_RUN.features[id]===false`.

## Security Review

No new attack surface; recipe/config and copy only.

## Milestones

### M1 — Promote both to onInBoth
- [x] RED: pins expect onInBoth / both arms true
- [ ] GREEN: current.json + registry/explainer/README copy
- [ ] Cheap checks: focused viewer + agent tests
- [ ] Full gates: just lint / build / test / verify-vendor
- [ ] Multi-model review LGTM ×3
- [ ] Land FF to main; post-merge just test; viewer-main; land-done

## Closing the Loop

Future fixed-run dry-run / armFeatures prove control+bundle true for both ids. No live run restart without operator ask.

## Session Log

- 2026-11-01: operator authorized both on in both arms and landing.

## Surprises

(none yet)

## Multi-Model Review Log

(pending)

## Boy Scout Log

(none)

## Archive Milestone

ASK USER before archive.


Session: RED pins committed; GREEN next.
