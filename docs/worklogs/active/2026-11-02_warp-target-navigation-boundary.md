# Frozen boundary — warp-target-navigation-v1

Review claim: a warp the readout advertises is an accepted `navigate_to_target` argument when its
tile is `MB_LAVARIDGE_GYM_B1F_WARP`, that tile is a goal-only step, and the pad is labelled by
mechanic with no destination.

## Included behaviours

1. `packages/agent/src/navigation.ts` — `GOAL_ONLY_BEHAVIORS` (0x29 only) and `options.goalOnly`,
   which admits the goal-only metatile as the terminal node of a route and never as an intermediate.
2. `packages/agent/src/semantic-navigation.ts` — `advertisedWarp()` resolves a requested warp from
   the grid's warp records when `interaction_targets` lacks it and the tile is enrolled; both
   `resolve()` and `interactionRecipient()` use it.
3. Registry: `features.ts` (`SWITCHABLE_FEATURES`, `FEATURES`, `playHarnessFeatures`,
   `SERVER_FEATURES`), `play-preset.ts` (schema, `Exclude` list, `merged`, `flagFeatures`),
   `viewer/src/next-run.ts` default. Default OFF.
4. `env/pokebench_env/readout.py` — a warp on a `Wp:floor_up` element reads
   `Warp (step-on pad) … ; step onto tile` with no destination suffix, gated on the switch.
5. `experiments/feature-configs/{current.json,README.md}` — `warp-target-navigation-v1` and
   `active-warp-exits-v1` base-true and `onInBoth`; the latter leaves `switches`.

## Non-goals

- `0x68` floor-down holes stay traversable and unenrolled.
- No map-id special-casing: scope is the behaviour byte.
- No destination, landing coordinate, pad→floor map, or route advice in any model-facing string.
- No glyph work: `Wp:floor_up` / `Wp:floor_down` are already keyed to behaviour.
- The running control run is not touched, restarted or reconfigured.
- `max_tokens` truncation churn is out of scope.

## Owner / failure domains

Planner (`navigation.ts`), semantic tool (`semantic-navigation.ts`), registry (`features.ts`,
`play-preset.ts`, `next-run.ts`), server readout (`readout.py`), recipe (`current.json`).

## Terminator

FAIL if a returned route crosses a 0x29 tile as an intermediate, if a 0x29 tile is chosen as the
tile to stand on for another target, if any behaviour other than 0x29 resolves through the geometry
path, or if the switch OFF changes a byte of model-facing output.

## Split triggers

None. One switch, one variable.

Ad hoc review packet; not an M4/M5 operator checkpoint.
