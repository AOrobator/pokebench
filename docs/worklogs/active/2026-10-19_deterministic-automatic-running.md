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
- 2026-10-19: Review round 1: Claude CLI was unauthenticated; Cursor Claude Opus and Sonnet both failed before review on the account usage cap. `think_fast` reached LGTM but emitted the verdict twice, so it did not satisfy the literal lane contract. `think_swarm` blocked on audit semantics: stale `walking:true` was correctly ignored for control but recorded as `walking:false`, while the viewer defines the field as “walking requested.” Accepted fix: make the event modifier optional and omit it entirely when ON; `automatic_running:true` plus requested held B remains the truthful executed choice. This stays inside the frozen input/audit boundary.
- 2026-10-19: The round-1 fix is committed as `b076ded7`; the pending experiment source pin now names that exact implementation commit. Focused runtime, production-factory, and recorder tests pass 170/170, and agent lint passes.
- 2026-10-19: Review round 2 endpoints both asked for proof that omitting `walking` does not hide the stale raw request. The event contract already separates raw `tool_call.args` from executed `button_press` modifiers. Added a recorder test proving raw `{walking:true}` remains on `tool_call` while the executed running receipt omits `walking` and retains `automatic_running:true` plus requested held B; added an owner comment defining `PressModifiers` as executed modifiers.
- 2026-10-19: Performed operand-level mutation proof for the round-1 receipt fix. Forcing `RunRecorder.buttonPress` to serialize missing walking as `false` failed `records harness-owned running without inventing a walking request` with received `walking:false`. Forcing the ON `pressTool` hook to propagate the stale value likewise failed `requests guarded simultaneous running even for a stale walking argument` with unexpected `walking:false`. Both mutations were restored and the focused 97-test pair returned green.
- 2026-10-19: Process correction: the receipt mutation check began while the two fallback reviewers were reading the frozen packet. Both detected the live tree change; their round was interrupted and discarded. No verdict from that contaminated packet counts. A new clean commit and packet are required before reviewers resume.
- 2026-10-19: Committed the explicit audit split proof as `2f5ac711` and repinned the still-pending experiment definition to that implementation commit.
- 2026-10-19: The fallback reviewers identified two remaining check-2 evidence gaps and were paused before any tree mutation. Removing only `ports.automaticRunning===true ||` from navigation forwarding failed `removes the model walking choice and drops stale walking input when automatic running is enabled` with received `{walking:true}`. Removing only the `automatic-running-v1` explainer mapping failed the feature-card test with `undefined` instead of the filename and the server test with HTTP 404 instead of 200. Both operands were restored; these are performed, isolated failures rather than inspection claims.
- 2026-10-19: Independent Cursor GPT failed before review on the account usage cap. Cursor Grok remained active without a result for more than ten minutes; it was interrupted only after the packet was already superseded by the new mutation receipts, so no Grok verdict from that attempt counts.
- 2026-10-19: Final-packet GPT review found two consistency defects while confirming the runtime behavior: the pending experiment hypothesis still named the pre-shoes rival house even though activation is `RUNNING_SHOES_RECEIVED` and grading is `ROUTE_102`, and Harness Config still described the OFF-only `walking` input for ON runs. Corrected the hypothesis with a real-definition regression test; made recorded tool references feature-aware with ON/OFF DOM coverage. In the candidate viewer on port 8792, opened this run's Harness Config, verified the ON `press` and `navigate_to` cards say the model has no walking override, clicked the AUTOMATIC RUNNING `READ EXPLAINER` link, and verified the resulting `/explainers/automatic-running-v1.html` page in the browser. The superseded Grok read was stopped before counting a verdict.
- 2026-10-19: Committed the review fixes as `8ea2860c4c1bf1c2ce92c1138ccac5f2fa0bcdce`; repinned the still-pending experiment source to that behavior-and-operator-contract commit. Focused experiment tests (14), viewer panel tests (126), both lint gates, both builds, all 121 experiment definitions, the explainer asset check and diff whitespace check pass. No experiment was queued, approved or launched.
- 2026-10-19: Final review requested break-and-restore evidence for the two new consistency safeguards. Changing the real definition back to “rival house” failed the new experiment test at the expected `Route 102` assertion (1 failed, 13 passed). Forcing the Harness Config consumer false failed the ON check at `model has no walking override`; forcing it true failed the OFF check at `walking: optional boolean`. The stricter branch-isolation follow-up then disabled only the `press` ON branch and failed at the press assertion, restored it, disabled only the `navigate_to` ON branch and failed at the navigate assertion, then restored it. The focused ON/OFF panel test passes on the exact candidate; experiment tests pass 14/14; the tree was clean before this receipt-only update.
