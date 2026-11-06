# First visit cycle credit

The operator 2026-11-06: "first-visit-cycle-credit-v1, i want this on in both arms. this supervisor suppression feels like a correctness fix." Spec from the coordinator, confirmed with the operator in the thread.

## Spec

- A map this run has never been on, entered: map-pair counts reset, so the entry cannot complete a cycle.
- `map_cycle` and `milestone_drought` notes are held for the next 10 tool results, each recorded once as a `would_warn` diagnostic naming the map.
- When the hold ends, a note still due is sent under the normal rules; one no longer due is recorded, never dropped silently.
- Another first entry restarts the hold. Interface dwell, text-only, battle and other guards are unchanged. No model-facing wording changes.
- Default OFF, byte-identical to today. onInBoth in `current.json`, explicit true in `current-control-24h-8k`. Not added to the Rayquaza lane; that recipe is a separate copy and the operator's pointer question is open.

The entering call's own result does not count as one of the 10.

## Milestone 1

- [x] RED tests in `stall-briefing.test.ts`: 4 failing, 24 passing
- [ ] GREEN in `stall-briefing.ts`, wiring, viewer timeline exclusion
- [ ] Explainer, recipe, preset, README
- [ ] Gates, review, landing
