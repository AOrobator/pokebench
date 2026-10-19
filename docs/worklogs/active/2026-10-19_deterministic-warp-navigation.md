# Deterministic warp navigation

## Problem Statement
Recorded navigation calls often target the farther tile in a multi-tile exit, and `navigate_to` deliberately stops after arriving on a directional warp. In PROF. BIRCH'S POKéMON LAB, 123 of 319 comparable calls chose a farther equivalent tile. The change requested by the operator is a switchable deterministic policy that selects the cheapest safely equivalent warp and, when already standing on a known directional warp with free field controls, submits exactly its game-defined direction and verifies the transition. The operator also requested that the switch join the bundle arm.

## Skills Loaded
feature-switch, feature-explainer, experiment-queue, pokebench-game-state, feature-worklog, execute-worklog. Before implementation, also load close-the-loop and the repository multi-model-review contract.

## Architecture
- New switch: `deterministic-warp-navigation-v1`, default OFF.
- The switch travels from `FeatureSet` through `withNavigation` into `navigationTool`; no environment or global reads.
- A requested warp may normalize only among candidates on the same source map whose complete destination tuple, known metatile behavior, activation class and elevation semantics match. A candidate must have a supported route under the active navigation options. Choose the least-cost route with a stable coordinate tie-break.
- Only game-defined directional warp behaviors short-circuit: `0x62 RIGHT`, `0x63 LEFT`, `0x64 UP`, `0x65 DOWN`, `0x1B UP`, `0x1C DOWN`, `0x6D DOWN`. If the selected target is already under the player and field controls are free, submit one defined direction through the ordinary checked `press` tool. A map change is success; otherwise stop and expose the resulting state.
- Step-on warps, animated doors, unknown behavior, missing geometry, dynamic destinations and incompatible equivalent candidates retain the prior behavior.
- Add the switch to `experiments/fixed/bundle-v-control.json` `switches`, affecting the bundle arm only. Do not approve, launch, restart or resume that experiment.
- Register a separate pending one-switch experiment at `experiments/deterministic-warp-navigation.json`, no queue position, using the shared incumbent with only this switch flipped. Earliest activation: `CLOCK_SET`; primary milestone: `RIVAL_HOUSE_ENTERED`.
- Add a self-contained explainer and Harness Config card link.

## Invariants
- **INV-1 — OFF is byte-for-byte prior behavior.** The same requested coordinate, press sequence, status, target receipt and tool description remain unchanged when the switch is false. Test at navigation-tool and production-factory levels.
- **INV-2 — Equivalence is exact and typed.** Normalization requires the full three-part destination, known matching activation behavior and a route; dynamic or unresolved destinations and behavior mismatches never substitute. Test lab-equivalent, distinct destination-warp-id, dynamic, unknown, mismatched behavior/elevation and unreachable cases.
- **INV-3 — Activation is one bounded ordinary press.** Only the source-grounded directional behavior table can emit an activation press, only with ready field controls and the player already on the selected warp. One press is followed by map-change verification; failure never retries or guesses. Test all observed directional classes plus door, step-on and unknown exclusions.
- **INV-4 — Command accounting and receipts are honest.** The activation press counts as an ordinary button attempt, uses the checked production press path and returns the post-action observation/status. Test success, no transition, precondition change and command-bound edge cases.
- **INV-5 — Bundle and experiment remain controlled.** The switch defaults OFF everywhere except the bundle arm declaration; the pending experiment changes exactly this one switch and has no queue position or approval. Schema and fixed-definition checks prove it.
- **INV-6 — Operator-visible documentation matches code.** The feature card links to a tracked, zero-network explainer showing OFF/ON routes, class dispatch and the conservative fallback.

## Security Review
Local game input only. No ROM/save writes, memory mutation, credentials, public serving or vendor edits. The implementation reuses the existing checked ordinary press path and never sends more than one new input. Unknown or inconsistent state fails closed to the incumbent behavior. The reference checkout is clean at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`.

## Milestones

**M1 — RED: switch contract and warp policy**
- [x] Write failing unit tests for exact equivalent selection, exclusions, deterministic tie-break, already-on directional activation, single-press verification and OFF identity.
- [x] Write failing factory/registry/preset/default/bundle tests proving production wiring and bundle-only membership.
- [ ] COMMIT: `test(navigation): specify deterministic warp handling` (RED)
- [ ] Update this worklog immediately after the commit.

**M2 — GREEN: implementation and registration**
- [ ] Implement the typed warp policy and wire `deterministic-warp-navigation-v1` through production.
- [ ] Register the switch default OFF; add it to the bundle arm only.
- [ ] Delete the production wiring once, observe the factory test fail, restore it and record the mutation receipt.
- [ ] Gates: focused tests, `just test`, `just lint`, `just build`, `just coverage`, `just verify-vendor`.
- [ ] COMMIT: `feat(navigation): handle equivalent directional warps` (GREEN)
- [ ] Update this worklog immediately after the commit.

**M3 — Explain, register pending experiment and close the loop**
- [ ] Add `docs/explainers/deterministic-warp-navigation-v1.html`, index and `FEATURE_EXPLAINERS` mapping with viewer/server tests.
- [ ] Add the pending experiment entry and readiness row; run `just experiments-check`. Do not queue or approve it.
- [ ] Run `just pages-check` and verify the Harness Config card link in the real browser at desktop and phone widths.
- [ ] Run all required gates again; update source pin as required by the landing workflow.
- [ ] COMMIT: `docs(navigation): explain deterministic warp handling`
- [ ] Complete PB1–PB13 self-review and the three-lane cloud multi-model review; fix only accepted in-scope defects and re-review the cumulative packet.
- [ ] Fast-forward land only if every required lane returns `VERDICT: LGTM`; run post-merge tests and refresh the viewer without disturbing a live run.

## Closing the Loop
Done means switch OFF preserves the incumbent, ON passes source-grounded warp tests through the production factory, the bundle arm includes it, the one-switch experiment is pending rather than queued, all gates and cloud reviews pass, the branch lands by fast-forward, and the actual Harness Config link opens the tracked explainer. No measured gameplay is authorized by this worklog.

## Session Log
- 2026-10-19: Audited 440 recorded event logs: 142 logical warp placements on 34 maps. Observed known behaviors were non-animated door `0x60`, directional `0x62/0x64/0x65`, animated door `0x69`, escalators `0x6A/0x6B`, and deep-south step warp `0x6E`. Of 34 multi-tile exact-destination groups, 19 had confirmed matching `0x65` behavior; unresolved/dynamic groups motivate the fail-closed eligibility checks.
- 2026-10-19: Confirmed current `main` `24232e63` is clean; created isolated branch `codex/warp-short-circuit`. `experiments/fixed/bundle-v-control.json` has no current status or approval receipt, and its `switches` field is the concrete bundle target. No behavior implementation, experiment approval or gameplay run has occurred.
- 2026-10-19: Worklog drafted; awaiting the operator's approval before M1, per repository start gate.
- 2026-10-19: The operator approved the worklog in the task thread. M1 implementation work is authorized; measured gameplay, experiment approval and launch remain out of scope.
- 2026-10-19: RED receipt: focused Vitest collected six tests and all six failed against the incumbent. Failures show the farther requested route, zero already-on-warp activation, absent production description/wiring and missing registry entry. The first attempt failed earlier because the new worktree lacked dependency links; `pnpm install --offline --frozen-lockfile` restored exactly the lockfile-pinned packages.

## Surprises
- The exact-destination inventory includes older states without tile behavior and the dynamic truck placeholder. Full destination equality alone is therefore insufficient; current behavior evidence must also agree.

## Multi-Model Review Log
Not started.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog only after landing and live verification.
