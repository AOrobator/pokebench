# schemas

JSON Schema (draft 2020-12) files for the data PokeBench records and passes between the game environment and the agent.

## events.v1.json

- What: one line of a run's `runs/<id>/events.jsonl`, the event log every run writes (run start, turns, tool calls, state, milestones, run end).
- Source: generated output. The schema is defined in TypeBox in [`packages/agent/src/events.ts`](../packages/agent/src/events.ts) and rendered by `renderEventsJsonSchema()`; do not edit the JSON by hand.
- Regenerate: `just schema` (builds, then runs `packages/agent/dist/schema.js` into this file).
- Validation: the agent and viewer validate events against the TypeBox schema in `events.ts` at runtime; this JSON file is the language-neutral copy for outside tools and readers (the viewer spec in [`docs/design/viewer/viewer-spec.md`](../docs/design/viewer/viewer-spec.md) maps its panels to it).

## map-observation-v1.json

- What: the current-map observation the Python environment builds for the agent: map id, origin, size, map elements and what is unavailable.
- Source: hand-written; this file is the single source of truth.
- Generated from it by [`scripts/map-observation-schema.py`](../scripts/map-observation-schema.py):
  - [`packages/agent/src/map-observation.generated.ts`](../packages/agent/src/map-observation.generated.ts), the TypeBox `MapObservationSchema`;
  - [`env/pokebench_env/map_observation_types.py`](../env/pokebench_env/map_observation_types.py), the `MapElement` dataclass.
  Run the script after editing the schema; `--check` fails if the generated files are stale.
- Used by:
  - `env/pokebench_env/map_observation.py` and the map element readers, which build `MapElement` values;
  - `events.ts`, where `MapObservationSchema` types the optional `map_observation` field of recorded events, so it is also embedded in `events.v1.json`;
  - `packages/agent/src/map-observation.test.ts`, which checks observations against it.
