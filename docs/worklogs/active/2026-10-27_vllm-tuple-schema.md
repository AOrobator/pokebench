# vLLM tuple tool schemas

Run 2026-10-27T14-10-38_hyperqwen-tp2_7147 died on turn 1: vLLM (`--tool-strict-level parameter`) compiles every tool schema with xgrammar, which rejects array-form `items` ("Invalid grammar specification: 'triggers'"). TypeBox `Type.Tuple` emits that form (navigate_to `map_id`).

Fix: vLLM models get their own provider id from discovery, and the loop config rewrites outgoing tool parameter schemas for that provider only: array `items` becomes `prefixItems` + `items: false`, `additionalItems` is dropped, length bounds stay. llama lanes send byte-identical requests.

Feature switch: not needed (see Decision below).

## M1 — transform and gate

- [x] RED: transform recursion, navigate_to map_id, full tool list free of array-form items on vLLM, llama wire bytes unchanged, vLLM discovery provider
- [ ] GREEN
- [ ] Gates: test, coverage (90), lint
- [ ] Live compile check against HyperQwen (if reachable)
- [ ] Review: Claude CLI, GPT (Codex), fallback (Grok waived)
- [ ] Land ff-only via the land board

## Log

- RED (2026-10-27 2:25 PM ET): tool-schema-dialect.test.ts, 108 tests: 57 fail as expected (stub transform, vLLM models still report local-llamacpp, no payload hook), 51 pass (every llama-lane byte check across 49 feature sets and the transform-free cases). The full tool list is built from the production factories (gameTools, contextTools, playGameTools) for all-on, the default flags and both arms of every fixed experiment.
