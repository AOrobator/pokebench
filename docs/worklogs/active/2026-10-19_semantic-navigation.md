# Semantic navigation and deterministic exploration

## Operator decision

On 2026-10-19, the operator authorized two independently switchable navigation treatments:

- `semantic-navigation-v1`: the model selects a game-owned interaction, warp, or map connection instead of calculating its approach coordinate. The harness resolves the target, route, adjacent tile, facing, running, and at most one requested activation.
- `deterministic-exploration-v1`: the model can request exploration; the harness deterministically selects one untried reachable target, otherwise an untaken reachable exit.

Both treatments must immediately return control when the game changes input owner. A trainer sightline, wild encounter, battle, dialogue, menu, script lock, map transition, forced movement, unavailable state, or unsupported owner interrupts the composite action and must be reported in the returned verified state. The harness never chooses a battle or dialogue response.

## Scope and invariants

- Both switches are default OFF and independently measurable. OFF preserves the existing tool schemas, descriptions, coordinate navigation, and execution exactly.
- Semantic identities come only from the current native `interaction_targets` and topology. People use map-local object identity; fixed interactions use map plus kind and coordinates; exits use the native destination identity.
- The model chooses the semantic target or explicitly requests exploration. Semantic navigation does not silently choose a different target.
- Exploration handles one target at a time and returns after activation or interruption; it does not interact with a whole map without giving the model each resulting state.
- Valid running displacement may cover multiple collinear tiles only when every crossed tile is a prefix of the currently planned route. Off-route movement remains an interruption.
- Whole-map mode may traverse the full current-map route. Visited-terrain mode may use only delivered terrain and returns at its known frontier.
- Keep the 512-command emergency bound and non-convergence guard. Do not claim benchmark benefit before a qualified comparison.
- Do not mutate, restart, or inject input into live measured runs.

## Consumers

- Model tool schemas and descriptions in the agent.
- Navigation executor and its verified returned state.
- Recorder/raw tool call and ordinary button receipts.
- Activity History/raw-event inspection through existing tool-call/tool-result events; no new timeline marks.
- Harness Config feature cards and tracked local explainers.
- Pending experiment registry and readiness ledger.

## Verification

- [x] RED fixtures cover multi-tile running progress and battle/dialogue/menu/script/unknown-owner/map-transition interruptions.
- [x] Semantic target resolution covers game-owned objects, fixed interactions, warps, and walking connections; identity is rechecked before activation.
- [x] Deterministic exploration ordering and activation-attempt history are production-wired.
- [x] OFF invariance is exact and ON factory wiring is covered.
- [x] Both explainers, card links, server routes, and real-browser clicks are verified. Static routes and offline-page checks pass; the candidate viewer's Harness Config search opened both explainers at their registered routes.
- [x] Pending experiment entries validate; no experiment is queued, approved, or launched.
- [x] Agent/viewer gates pass: 3,810 tests, lint, build, experiment validation, offline-page checks, and 90% coverage floors. The isolated worktree's Python suite cannot resolve vendored porymap/mGBA assets, producing 12 missing-file failures and one missing-module mypy error; no Python production file changed.
- [ ] Frozen multi-model review passes before any landing.

## Session log

- 2026-10-19: Committed implementation as `9db88de86f3898c779b7812ce4e64b4dba1b11e0`; pinned both pending experiment definitions to that exact candidate implementation commit. They remain unqueued and unapproved.
- 2026-10-19: Browser proof on the isolated candidate viewer (`127.0.0.1:8793`): Harness Config matched `semantic-navigation-v1` and `deterministic-exploration-v1`; each card's explainer link opened the corresponding titled page. Temporary candidate servers were then stopped.

- 2026-10-19: Created isolated branch `codex/semantic-navigation` from `main` `63b6236f`. Read the repository, feature-switch, feature-explainer, experiment-queue, patch-evaluation, agent-observability, and game-state contracts. Live benchmark checkouts remain untouched.
- 2026-10-19: Implemented the two default-off tools, interruption returns, checked activation, multi-tile running-prefix acceptance, model guidance, viewer references, explainers, and pending experiment registrations. Migrated every non-frozen tracked experiment to state both new switches OFF; frozen definitions remain byte-identical. No run was approved or launched.
