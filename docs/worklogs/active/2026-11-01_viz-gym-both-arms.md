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
- [x] GREEN: current.json + registry/explainer/README copy
- [x] Cheap checks: focused viewer + agent tests (24 PASS)
- [x] Full gates: just lint / build / test / verify-vendor
- [x] Multi-model review: Claude LGTM; Grok+GPT waived by operator for land
- [x] Land FF to main; post-merge just test; viewer-main; land-done

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

GREEN: recipe onInBoth + copy; focused viewer 24 PASS.

## Gate receipts (72d6540c1)

- Cheap: viewer fixed-definition + both-arms 24 PASS
- just lint: PASS (prior worktree run)
- just build: stamp 72d6540
- just test (final with .env + mgba + trainer-card art links): TEST_EXIT:0
  - agent 5256 PASS, viewer 2388 PASS, python 4979 PASS, gateway 116 PASS, trainer-card 3 PASS
- just verify-vendor: vendor OK at bbab97ad

## Multi-Model Review Log

Frozen packet: base 14991d479 .. head 72d6540c1; diff SHA-256 5f4579c3028442fa6351bb209152adcd7c298c23302871408d786b53b18c6fb3

- Claude CLI (`~/.claude-review`): VERDICT: LGTM (hardening follow-ups only: DEFAULT_NEXT_RUN pin for checklist; PB1 N/A→PASS caveat; no blockers)
- Grok (cursor-agent grok-4.7-high-fast): UNAVAILABLE — Cursor usage limit
- GPT (Codex ChatGPT + cursor-agent gpt-5.6-sol-medium): UNAVAILABLE — Codex model_not_found for tried SKUs; Cursor usage limit

Landing blocked until Grok + GPT cloud lanes return LGTM or operator waives.

## Upstream impact (landing)

main advanced to 483fd5e45 (moving-npc burst). Merge conflict only in `experiments/feature-configs/current.json` switches list: kept our removal of viz-v2 + gym checklist from switches (they stay onInBoth) and kept main's `moving-npc-frame-burst-v1` switch. Feature intent unchanged. Operator waived Grok/GPT lanes and ordered land 2026-11-01.

## Landing evidence

- FF merge onto main: `98fc1cec7`
- Operator waived Grok/GPT lanes and ordered land (2026-11-01 08:28 ET)
- Claude LGTM retained on frozen feature packet; integration merge only added moving-npc switch coexistence
- Post-merge `just test`: PASS (`POSTMERGE_EXIT:0`)
- `just viewer-main`: see runs/reviews/viz-gym-both-arms/viewer-main.log
