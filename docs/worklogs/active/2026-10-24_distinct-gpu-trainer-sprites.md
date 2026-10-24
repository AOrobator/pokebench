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
