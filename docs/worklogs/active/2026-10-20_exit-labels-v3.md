# Exit labels v3: distinguish exits and terrain sections

## Authorized outcome
The operator approved the investigated design: “ok build the switch and put it in the bundle”. One milestone delivers a default-OFF versioned observation upgrade, exact OFF invariance, section-aware physical exit identities used consistently by readout and agent summaries, tracked explainer, pending experiment and bundle membership. No measured runs are authorized. Existing running cohorts remain frozen.

## Boundary
Production owners: new env/pokebench_env/map_sections.py; existing exit-labels/game-state/rerender/readout/live-map formatters; typed event state and shared agent exit-label helper; harness-trust, untaken-exits and supervisor label consumers; switch registries/presets/viewer defaults and explainer mapping; fixed bundle definitions and pending experiment. No gameplay execution, objectives, route selection, exit-history accounting, new tools, or supervisor thresholds change. Keep v2 intact as comparison. Labels describe terrain; temporary objects/scripts are not guaranteed passable. Preserve one-way direction. No handwritten story route or location aliases.

## M1 Deliver and verify
- [x] RED: real archived Route104/Woods observations plus small adversarial geometry cases; commit failing tests.
- [ ] GREEN: one section/exit description owner, production wiring, exact OFF behavior.
- [ ] Registry, default OFF, pending experiment, future bundle only, explainer.
- [ ] Tests, lint, build, coverage >=90%, vendor, experiment checks, raw RAM replay and wiring deletion/restoration.
- [ ] Principles and independent cloud reviews on frozen packet; local fast-forward landing only with required approvals.
- [ ] Main tests, viewer refresh and real explainer click, bundle configuration proof. Do not restart gameplay.

## Evidence and open questions
Run 97a0 state 13625 / result 13626 / turn377 identifies Woods entrances at (10,38)/(11,38); result14514 states the mistaken same-map-loop belief. Raw archive6007 hashes and ROM identity validated in the investigation. ROM731ad5bf is clean. Direction matters: the eastern Route104 landing can reach the southern area, but not vice versa. V2 ignores runtime destination objects and metatile changes, so topology must be qualified rather than advertised as a guaranteed route. Stage unknown/dynamic/unreadable maps remain explicitly unknown.

## Session
- Started from main24648e12 in an isolated managed worktree. User approval covers implementation, bundle integration and normal repository landing requirements.

- RED observed: collection fails because map_sections does not exist. Frozen SHA256 receipts of v2 ON state/readout were captured before implementation for both existing ROM-backed b300 archives.

- Implementation uses iterative strongly connected terrain sections, explicit physical warp labels, typed exit_sections and shared text consumers. OFF frozen hashes pass. Real ROM tests cover distinct Route104/Woods returns, one-way east-to-south reach, same-map Gym rooms, warp boundaries, water/elevation, unknown/dynamic destinations and recursion-sized floors. 11 focused Python tests and 6 shared-consumer TS tests pass.
- Archived97a0 turn377 reparsed with production read_state/render: OFF0.026s/16868 chars, ON0.047s/22668 chars in one local sample; no throughput claim. Receipts at main runs/exit-labels-v3/97a0-turn377-{on,off}.{txt,json}. No gameplay observations/actions were requested.
- Agent coverage run:3037 tests pass. Viewer1496 pass with one frozen-incumbent exclusion needing the new bundle switch; corrected. Full gates pending final main sync. Initial Python invocation omitted ROM and skipped ROM-backed tests; root invocation interrupted during collection; only the corrected just/explicit-ROM invocation will count.
- COMMIT: test RED843ce9cc. GREEN candidate follows; review and landing remain pending.

- Integration: current main landed field-move-gates-v1 while this feature was being built. Preserve it and reuse its existing FloodRules in v3; extract the existing destination-rule construction into exit_labels.destination_rules so both versions use one gate owner. Current-map rules use live obstacle state; destination rules retain on-load flag semantics. This prevents section labels from bypassing the newly landed obstacle truth. Section anchors are stable while moving; terrain or gate-state changes can rederive sections.

- Main sync kept field-move gate corrections, gated destination rules, and all unavailable-exit warnings in v3 descriptions. Main e9584cf0 is the merge parent; initial after-sync checks identified only registry roster/count assertions and a corrected test assumption, not an OFF-output change.
