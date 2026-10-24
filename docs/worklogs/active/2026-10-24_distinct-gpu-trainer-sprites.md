# Distinct GPU trainer sprites

User correction (2026-10-24, chat 00000000-0000-4000-8000-442532a64cf1): "why do the first two trainer cards have the same sprite? each GPU should have a different trainer. it should be based off the hash of gpu + experiment + experiment arm".

## Frozen scope
Viewer-only sprite identity correction. Seed GPU + experiment + arm, in that order; resolve collisions in one shared table for live/paused cards across experiments, not independently per experiment. Same tuple shares sprite across trial/model/clock changes. Deterministic sorted allocation for an unchanged peer set, independent of input order. Finite palette: distinct tuple assignments while slots remain; no claim of infinite unique sprites. Reserve legacy no-GPU picks so existing cards keep their assignment; isolate ended replay allocation from unrelated live experiments. Preserve approved frame/layout/labels/party/status and gameplay. No harness switches, launches or inference. User explicitly authorizes the sprite and corresponding protected test/baseline update; approval receipt required.

## Milestone
- [ ] RED actual154a/0517 collision + ordered tuple + forced cross-experiment collision
- [ ] GREEN narrow renderer allocation, consumer checks and sprite-only baseline update
- [ ] Full gates in coordinated finite CPU window, headless candidate proof
- [ ] Principles + cloud reviews with documented Grok outage fallback if still necessary
- [ ] Landing board, reviewed fast-forward, fullmain tests and coordinated live proof

## Evidence and coordination
Current renderer already hashes experiment/arm/GPU, but collision probing is scoped to each experiment. Actual GPU runs use distinct solo experiment ids and both pick the same sprite. Prior restoration deliberately retained allocator; duplicate in live screenshots was missed. No full-test/coverage window claimed yet; coordinator notified this chat will keep to light setup/focused tests while top5Item3 has the next ~5min window. Preserve live loops/Mac and desktop focus.

RED: source-level trainer-card tests on current code fail the actual concurrent different-experiment pair, ordered full-tuple hash expectations, and forced collision contract. Existing agent dist copied read-only from matching main for focused tests; no full build/test/coverage chain started.

## Implementation and focused proof
- RED c847defdc: 3 new tests fail /18 existing pass on original allocator. GREEN: GPU-qualified seed is GPU\0experiment\0arm; current live/paused keys allocate through one sorted shared table. Legacy no-GPU picks are reserved unchanged, ended replays use their own group. Identical tuple shares trainer across trial/model/clock; unrelated ended runs and input order do not affect live choices.
- Focused source tests:71 passed (renderer, mounted App desktop/phone, comparisons). Updated the existing exact GPU sprite expectations to the new ordered hash, leaving legacy expectations intact. Actual154a/0517 different-experiment regression passes. Forced 4-sprite collision starts both full keys at slot0 and expects slots0/1; paused peers included.
- Performed independent source mutations: remove GPU, experiment or arm component; disable collision probing; remove legacy reservation. Each selected regression fails for its intended exact value/uniqueness assertion; original source restored and all71 focused tests pass. Logs /tmp/gpu-trainer-mutation-*.log.
- Baseline checks initially fail only because selected trainer images changed. Regenerated under this user's explicit sprite correction; all3 widths pass. Pixel comparison with prior protected baselines proves identical dimensions and all changed pixels inside only the two GPU trainer-image boxes:3052 pixels each desktop,2560 phone. Frames, labels, badges, party, bars and first legacy sprite unchanged. Images inspected; structured proof runs/gpu-trainer-proof/sprite-only-pixel-diff.json.
- Lightweight preview used only single-file ES-module transpilation with existing matching base artifacts; full TypeScript build/typecheck remains required in the coordinated gate window. No full build/test/coverage chain launched while Item3 owns the host. Live API read-only projection now shows distinct actual current sprites (actual-current-assignments.json).

## Review round1 and bounded test fix
- Frozen005d762b4 (basebbefc77b8), binary diff SHA2569c68b1074e7abc0dea1b8edc4bb769dee4d4aca98b13b95cb56695464059e69d. Independent GPT and fresh Sol/Astra fallback source LGTM. Grok4.5/4.7 still usage-exhausted. Claude found a test-quality blocker: original ended/reversed fixtures didn't collide, so current/replay filtering and sorting were not falsified by those assertions. Accepted in-contract evidence gap, tests-only fix.
- Changed ended fixture to GPU0/a-13/bundle which sorts first and hashes into the actual pair's slot5. Added reverse-order assertion to the forced4-sprite collision; added an ended replay pair with an unrelated current key colliding at slot2; added current cross-experiment no-GPU reservation exact slots1/0.
- Performed five more distinct mutations: include ended peers in live pool; include unrelated current peers in replay pool; incorrectly use live filter for ended replay; remove sorting; remove current legacy reservation. Each selected new assertion fails with exact changed trainer values; restored source passes73 focused tests. Production renderer, protected baselines and card style remain byte-identical to005d762b4.
- Coordinator notified readiness withdrawal while tightening tests. No full-heavy jobs started; Item5 has active max480s window, this chat may become next READY after its explicit release. Will publish replacement frozen head and240s supervised gate claim only when ready.
