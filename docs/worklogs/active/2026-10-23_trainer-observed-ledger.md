# Observed trainer Pokémon ledger

## Problem Statement
The operator authorized remembering observed Pokémon for every trainer and including them in retry recaps, without exposing unseen Pokémon. Follow-up explicitly requests a switch and bundle inclusion. In glm53-mac_0d5d, tool results 138432 and 138711 delivered WINGULL Lv18 and its faint before GROVYLE Lv20; the model later forgot WINGULL.

## Skills Loaded
feature-switch, feature-explainer, agent-observability, pokebench-game-state, close-the-loop, execute-worklog, talk-to-claude, multi-model-review.

## Architecture
Extend BattleOutcomes and its existing result-facts consumer. New trainer-observed-party-v1 defaults OFF, needs battle-loss-recap-v1, bundle ON/control OFF. Keep only opponent battlers whose species and level appeared in successful delivered tool results or decision input. Delivered faint pages can update already known opponents. State polling alone teaches nothing. Key by trainer ID and party slot; remember across attempts and milestones. Render historical observations, never a complete party claim. Two-opponent battles without per-trainer attribution are excluded. No new tool, event schema, route, move advice, ROM party lookup or live run mutation.

## Invariants
- INV-1: OFF result bytes unchanged; existing recap tests plus exact equality.
- INV-2: internal/failed/absent/ambiguous observations reveal nothing; delivery regressions.
- INV-3: ordinary trainers and leaders retain distinct slots and distinct IDs, including same names; replay tests.
- INV-4: memory survives retry and story milestones; historical fainting is labelled last observed.
- INV-5: bundle ON/control OFF; omitted presets OFF.

## Security Review
Read-only recorded game state and delivered text. No raw enemy party decoding, external service or new persistence surface.

## Milestones
- [ ] M1: failing regressions and RED commit
- [ ] M2: implementation, switch, bundle, explainer, full gates and GREEN commit
- [ ] M3: frozen cloud review, landing-board coordination, local merge and viewer proof if all required lanes approve

## Closing the Loop
Production playGameTools seam; historical May trace replay read-only; delete/restore wiring; themed explainer/card tests and background browser proof. No gameplay/inference launches authorized or needed.

## Session Log
- 2026-10-23: Scope authorized by operator's fix request and bundle follow-up. Isolated codex/trainer-observed-ledger branch; canonical checkout untouched.

## Surprises
- Detailed existing attempt memory only covers Gym Leaders and was OFF in the failing run.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog
