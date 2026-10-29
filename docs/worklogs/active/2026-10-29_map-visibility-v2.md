# Map visibility rollback and V2

User authorization 2026-10-29 in Codexredacted-id: turn player-map-visibility-v1 OFF in both control and bundle; restart current Qwen run without it; implement V2 matching whole fully-lit current maps and illumination-limited dark maps. Earlier report-only restriction superseded for this explicit scope. No other run is authorized to stop or restart.

## Bounded stages

1. Disable V1 in sole maintained current feature recipe, preserving historical definitions and recordings. Verify resolved control and bundle bits. Land reviewed recipe and coordinate replacement of current GPU0 Qwen1ad5 with same model/settings/start/24h, V1 off and V2 off. Launcher owner has been contacted; no concurrent restart.
2. Implement separately registered default-OFF player-map-visibility-v2. Whole current-map static terrain/warps/connections on verified fully-lit maps; dark maps retain native illumination and previously seen static terrain. Visible actors remain limited to current screen/light; hidden NPC templates and global route graph remain withheld. Unsupported/transitional visibility stays unknown. V2 takes precedence when both switches are enabled; V2 OFF preserves V1 and OFF/OFF exactly. Add production wiring tests, native archive replays, explainer, gates and independent review. Land; do not activate V2 in measured gameplay without further authorization.

## Boundaries

Changes limited to visibility projection, its existing consumers, switch plumbing, recipe and related tests/docs. No new tools, game inputs, navigation solver, timeline additions, trainer-card design, gateway/model changes, historical rewrite or benchmark benefit claim. Restart is a fresh run, not checkpoint continuation or erasure of the old result. Operational compute ownership/clearance and landing board apply separately.

## Evidence

Initial diagnosis run2026-10-29T06-25-35_qwen36-gpu0_1ad5 at pin927b6b0c: 62 wall refusals for16,8, no new milestone after129 by350; whole-map visibility is a candidate contributor, not proven cause. Original evidence retained.

- [ ] Recipe RED/GREEN and review/landing
- [ ] Cleared replacement run and viewer proof
- [ ] V2 RED/GREEN, factory mutation and native replay
- [ ] V2 full gates/review/landing and explainer delivery

Coordination: sent current launcherredacted-id explicit replacement ownership request, Claude relay delivered reservation proposal; awaiting acknowledged window. No stop/launch or heavy CPU job yet.

Recipe RED: initial focused attempt failed on absent agent build (setup failure, not RED). After explicitly granted CPU START and prerequisite pnpm agent build, updated both-arm regression fails because current onInBoth still contains V1; /tmp/map-visibility-rollback-red.log retains assertion. COMMIT: test operator-directed V1 rollback RED.
