# Semantic navigation v2

## Operator decision

2026-10-20 (the operator, via the coordinator): with `semantic-navigation-v1` on, the model was barely steered to `navigate_to_target` (1 of 16 MAY probe samples at f28d turn 443, and that one used a wrong target shape). The operator called the misprompting a bug: "the first version shouldnt be on anywhere". Build `semantic-navigation-v2`: the same tool plus prompting everywhere navigation is mentioned. Turn v1 off in every preset, put v2 in the bundle arm in its place, and let deterministic exploration run with v2.

## Scope and invariants

- `semantic-navigation-v2` is default OFF, its own switch, bundle arm only. OFF keeps every prompt, tool description, readout byte and result exactly as today. `semantic-navigation-v1` ON keeps its own landed behavior.
- v2 ON provides `navigate_to_target` (and the native slot receipts) without v1.
- Model-facing text uses the game's own identities only: no walkthroughs, no place or person the game has not shown. Nothing is truncated.
- `deterministic-exploration-v1` accepts v1 or v2.

## Milestones

- [x] M1: registry, presets, defaults, server switch, dependency, tool enablement; v1 off everywhere, v2 on in bundle-v-control.
- [x] M2: what the model reads: system prompt tool list, Moving around, Talk to people, untaken exits, dialogue auto-advance wording, tool descriptions, and readout lines that state each listed target's `navigate_to_target` argument.
- [x] M3: navigate_to_target and explore_map results get the same result handling as navigate_to (dialogue auto-advance, trust lines, ledgers, ID cards, untaken exits, story destinations, result facts, loop supervisor, recorder).
- [ ] Gates, explainer, pending experiment, Claude + Grok review, merge slot, ff landing, viewer restart.

## Log

- 2026-10-20: Branch `claude/semantic-nav-prompts` from main `688b1764`.
- 2026-10-20: M1 plus the readout half of M2. Registered `semantic-navigation-v2` (appended; guidance; needs bounded navigation; server switch so the slot receipts and readout targets apply). `semanticNavigation()` = v1 or v2 gates navigate_to_target, the server slot read and exploration's dependency (exploration `needs` is now null with a custom v1-or-v2 rule). v1 is off in every preset: bundle-v-control and bundle-cook-1h list v2 in `switches` instead of v1 (base false for both); open-goal-prompt and deterministic-exploration incumbents swap v1→v2. Python readout with v2 on appends `navigate_to_target target {...}` to each resolvable interaction candidate (not to exits cut off or across water), to walkable map connections with edge tiles, and to story characters the readout lists as objects; new test_semantic_targets.py. Agent 2,798 and pytest 2,901 pass after index/LATER-set updates.
- 2026-10-20: M2 + M3. Prompt with v2: tool list leads with navigate_to_target (navigate_to for a plain tile), Semantic Moving around (local/full/visited tails), a navigate_to_target section that says to copy the readout's target, SEMANTIC_NAVIGATE_RULES replaces NAVIGATE_RULES in the prompt and navigate_to's description (which also leads with SEMANTIC_NAVIGATE_DESCRIPTION), dialogue auto-advance names navigate_to_target, Talk-is-cheap goes through navigate_to_target, untaken-exits sentence mentions targets, usage rule gains a sentence when navigate-first is off, press reminder names navigate_to_target. Agent-side lists carry `[navigate_to_target target {...}]`: untaken exits (warp tiles, walkable edges), trust header exits and goal entrances, loop supervisor's current-map untried list. Results: dialogue auto-advance, harness trust, ID cards, people ledger, conversation ledger, story destinations, untaken exits, starter decision and result facts wrap navigate_to_target and explore_map under v2; loop supervisor tracks their calls (a target counts as tried); recorder records their state; dialogue_auto_advance event tool enum gains both names (schema regenerated). Fixed bundles keep v1 in offInBoth (base false) so the control base still matches. Mutation proof: disabling the auto-advance, untaken-exits and prompt gates turned 5 v2 tests red; restored. Gates: agent 2,813, viewer 1,361, pytest 2,901.
