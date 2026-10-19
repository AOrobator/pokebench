# Deterministic automatic running

## Operator decision

On 2026-10-19, the operator clarified the contract for `automatic-running-v1`: the model must not choose whether to run. When the game says running is available, the harness deterministically holds B for ordinary directional travel.

## Evidence and game grounding

- Live run `2026-10-19T01-08-57_qwen36-gpu1_petalburg-wholemap-probe-a` records the switch ON at harness commit `a7be38f6`.
- At turn 112 / seq 3790 the model first supplied `walking:true`; every one of its next 30 `navigate_to` calls supplied the same override. Those calls recorded `automatic_running:false` even where the coherent pre-action state said `running.permitted:true` and `running.controllable:true` (for example ROUTE116 seq 7698).
- Trial B supplied no deliberate-walking override and every otherwise eligible directional call requested running. Across both trials there were no eligible, non-overridden directional calls that the guard failed to mark for running.
- Matching game source: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, `src/field_player_avatar.c` `PlayerNotOnBikeStep`. The game selects `PlayerRun` when B is held, `FLAG_SYS_B_DASH` is set, the avatar is not underwater, and `IsRunningDisallowed` is false. `src/bike.c` `IsRunningDisallowed` checks `gMapHeader.allowRunning` and the current metatile. PokeBench already decodes those owners plus field/input readiness in `env/pokebench_env/running.py`; this change does not add or guess native state.

## Scope and invariants

- Keep the correction inside the existing `automatic-running-v1` switch. OFF must preserve the old public `walking` option and ordinary `/action` behavior byte-for-byte.
- ON removes the public `walking` option from `press` and `navigate_to`; model input cannot opt out.
- ON ignores a legacy/stale `walking:true` argument at execution and still requests guarded travel when the native state permits it.
- Preserve all native vetoes: battle, non-overworld owner, locked controls, active UI, unavailable state, no shoes, disallowed map/metatile, forced movement/transition, or non-foot avatar.
- Do not alter or restart measured runs already in progress. Live proof requires a later run built from the landed commit.
- Update the existing feature explainer and Harness Config link. Do not claim benchmark benefit.

## Verification

- [x] RED proves `walking:true` can no longer defeat ON semantics while OFF remains unchanged.
- [x] Production-path schemas hide `walking` only when the switch is ON.
- [x] Runtime tests prove native permission remains the only running decision.
- [x] Explainer, card link and local serving checks pass.
- [x] Full repository gates pass.
- [ ] Frozen multi-model review passes.
- [ ] Fast-forward landed on `main` after active measured runs permit it.

## Session log

- 2026-10-19: Created isolated branch from `main` `cd596604`. Read-only diagnosis only; live measured runs remain on their recorded `a7be38f6` harness.
- 2026-10-19: RED: the focused suite failed in three intended places: `permitsAutomaticRunning` honored `walking:true`, the ON `press` schema exposed `walking`, and the ON `navigate_to` schema exposed `walking`.
- 2026-10-19: GREEN: focused agent tests passed, 136/136. The production-factory test proves both schemas omit `walking`, a stale `walking:true` is dropped, and an eligible step posts guarded `/pokebench/travel` with `automatic_running:true`. OFF-schema tests retain the incumbent argument.
- 2026-10-19: Wiring mutation: deleting only `automaticRunning:features["automatic-running-v1"]` from `withNavigation` made `the production factories make automatic running harness-owned when the switch is on` fail because the production navigation schema exposed `walking`; restoring that operand returned the focused suite to green.
- 2026-10-19: Viewer/explainer verification: 166/166 focused viewer tests; `just pages-check docs/explainers/automatic-running-v1.html`; local HTTP 200 and browser visual check at `http://127.0.0.1:8791/automatic-running-v1.html` with no network assets.
- 2026-10-19: Repository gates: `pnpm lint`, `pnpm build`, `just verify-vendor`, and `just test` passed (2,531 agent, 1,198 viewer, 2,492 Python; 229 ROM-dependent skips because `POKEBENCH_ROM` is unset). JavaScript coverage passed at 97.99/94.16/98.32/99.25% for agent and 95.43/91.49/93.88/97.65% for viewer; Python coverage passed at 96.96% lines, 92.48% branches, 99.44% functions. The ordinary parallel viewer coverage invocation reproduced the pre-existing `server-stream.test.ts` timing flake; its complete suite passed with one worker and a 15-second test timeout, without code changes, retries inside tests, skipped tests, or a gate weakening.
- 2026-10-19: `git submodule update --init --recursive` initialized the required top-level pinned continual-harness checkout, then stopped on its undeclared nested pokered submodule URL. The repository-owned `just verify-vendor` check passed against the pinned top-level checkout.
- 2026-10-19: Committed the implementation as `affe0926` and pinned the pending `automatic-running` experiment definition to that exact implementation commit. The entry remains pending with no queue position or approval; no measured run was launched.
