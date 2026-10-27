# vLLM tuple tool schemas

Run 2026-10-27T14-10-38_hyperqwen-tp2_7147 died on turn 1: vLLM (`--tool-strict-level parameter`) compiles every tool schema with xgrammar, which rejects array-form `items` ("Invalid grammar specification: 'triggers'"). TypeBox `Type.Tuple` emits that form (navigate_to `map_id`).

Fix: vLLM models get their own provider id from discovery, and the loop config rewrites outgoing tool parameter schemas for that provider only: array `items` becomes `prefixItems` + `items: false`, `additionalItems` is dropped, length bounds stay. llama lanes send byte-identical requests.

## Decision: no feature switch

The feature-switch skill requires a switch when tool descriptions or schemas change, and exempts "a refactor proven byte-identical by tests". llama and gateway lanes are byte-identical: the test compares the raw request's tools JSON with the unmodified schemas for 50 feature sets (all-on, default flags, both arms of every fixed experiment). On vLLM the OFF state is an HTTP 400 on every request, so there is no runnable OFF arm to compare. The constraint is unchanged (prefixItems + items false is the JSON Schema 2020-12 form of the same tuple). One caveat: Qwen's chat template puts the schema JSON into the prompt, so on vLLM the model reads "prefixItems" where it would have read an items array.

## M1 — transform and gate

- [x] RED: transform recursion, navigate_to map_id, full tool list free of array-form items on vLLM, llama wire bytes unchanged, vLLM discovery provider
- [x] GREEN
- [x] Gates: test, coverage (90), lint
- [x] Live compile check against HyperQwen (if reachable)
- [ ] Review: Claude CLI, GPT (Codex), fallback (Grok waived)
- [ ] Land ff-only via the land board

## Log

- RED (2026-10-27 2:25 PM ET): tool-schema-dialect.test.ts, 108 tests: 57 fail as expected (stub transform, vLLM models still report local-llamacpp, no payload hook), 51 pass (every llama-lane byte check across 50 feature sets and the transform-free cases). The full tool list is built from the production factories (gameTools, contextTools, playGameTools) for all-on, the default flags and both arms of every fixed experiment.
- GREEN (2:40 PM ET): tool-schema-dialect.ts rewrites tuples recursively on a copy; discoverLocal tags vLLM models with provider local-vllm (not recorded or parsed anywhere); gatewayLoopConfig installs an onPayload hook for that provider that runs after the sampling extras. Targeted tests 131/131.
- Gates: lint exit 0 (tsc, eslint, both packages). Coverage: agent 4586 tests, 96.44/92.64/97.54 (lines/branches/functions); viewer 2038 tests, 95.88/91.67/95.36. pytest in this worktree: 3639 passed and 261 failed, all because POKEBENCH_ROM is unset here (the gitignored .env is not in the worktree, and running with it set was denied). This diff touches no Python.
- Live check (HyperQwen vLLM 0.31.0, qwen3.8-27b, 127.0.0.1:18020): the real 9-tool list for hyperqwen-control-3h's control arm, sent raw, returns 400 "Invalid grammar specification: 'triggers'" (the run's error). Transformed, it returns a tool call (observe). A forced navigate_to returns arguments {"x":3,"y":4,"map_id":[0,9],...}.
- Review round 1 (packet 0050b7eb0): fallback (Sonnet subagent) LGTM. Claude CLI BLOCKING: the test leaked a listening server per vLLM row (the module-level `server` was overwritten), and 52 rows of real HTTP plus agent loops added cost but no proof. Both reviewers noted that data-valued keywords (const/enum/default/examples) were rewritten too. Codex CLI failed on its default model (gpt-6.1-sol was rejected for a ChatGPT account) and is rerun with gpt-5.6-sol.
- Fix: every server is tracked and closed, with an afterEach check that none is listening. Three wire tests stay on real HTTP (navigate_to on vLLM, llama byte identity, vLLM with presence_penalty). The 50-arm rows run the production onPayload in memory. Data keywords are copied unchanged. Break/restore: removing the rewrite from onPayload turns 51 of 60 red; restoring it makes 60 of 60 green. Agent lint 0. Coverage: 4538 tests, 96.44/92.64/97.54.
- Review round 2 (packet a3c80fbe9): Claude CLI LGTM. Fallback LGTM (non-blocking: the property-name collision below). GPT (Codex CLI, gpt-5.6-sol; harness switch because the default gpt-6.1-sol is rejected for this account) BLOCKING: data keywords were matched by name, so a property or $defs entry named default/const/enum/examples holding a tuple kept its array-form items, and data values were kept by reference. The row count is 50, not 49 (corrected above).
- Fix: the walk is position-aware. Values of properties, patternProperties, $defs, definitions and dependentSchemas are each recursed as a schema. Data keywords are structuredClone'd. New test covers 9 collision locations. 61/61 pass, lint 0. Agent coverage: 4539 tests, 96.44/92.63/97.54.
