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
