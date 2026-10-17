# Worklog: harness messages use the game's own words (skill rule)

Branch `claude/game-text-rule`, base main f7f34d1e. Docs only.

The operator (2026-10-17 2:17 PM New York, run-analysis thread): "for these exits, we want to rely on what the game would say, though, if the user clicked on it ... update your skills so that we're more in line with the game text and game warnings, so that the harness can get game guidance reliably."

- [x] pokebench-game-state: new section "Harness messages use the game's own words"; feature-switch checklist item 6a points to it.
- [x] Review round 1 (e11fdfb0): Claude LGTM; Grok and GPT BLOCKING on the same point: the Surf example named the wrong owner (GetInteractedWaterScript returns no script without badge 5 and a Surf user). Fixed, plus PB4 wording.
- [x] Review round 2 (00e2dc53): Claude, Grok and GPT all VERDICT: LGTM. Round-1 fix COMMIT: `docs(skill): game-wording rule cites GetInteractedWaterScript ...` (00e2dc53).
- [x] Land ff-only into local main; archived with this commit.

