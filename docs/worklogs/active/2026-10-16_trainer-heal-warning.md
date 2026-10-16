# Trainer heal guidance and low-HP rival warning

## Problem Statement

Round 2 bundle run `runs/2026-10-16T04-51-03_qwen36-gpu0_54a7`: on turn 363 Torchic had 3/21 HP. The readout's battle-triage line said "below half" on every field turn from T362 to T368, and the model wrote "Torchic has 3/21 HP, which is below half. I need to find May." It talked to MAY on Route 103 (T369, 5:27 AM EDT), fainted on the first Tackle (T371), blacked out to Littleroot (₽3000 → ₽1500), dropped the rival goal and looped at the Oldale Maniac (110+ turns and counting). The Oldale POKéMON CENTER was about 27 tiles away. Options page: `runs/reports/may-whiteout-options/index.html`.

Operator decision (the operator, 2026-10-16 5:43 AM EDT): "Let's do both A and B. And then put them in the bundle. And then you have my standing approval to merge. Once you have code review. And things are approved."

Coordinator process: the readiness thread adds the switches to `experiments/fixed/bundle-v-control.json` (this branch does not edit it); merges touching the switch registry are serialized (ask the coordinator for a slot); `loop-supervisor.ts` is being changed by another thread, so B does not touch it.

## Skills Loaded

feature-switch, feature-explainer, execute-worklog, agent-observability, pokebench-game-state (rival object and blackout facts), experiment-queue (pending entries).

## Architecture

Two default-OFF agent-side switches. OFF reproduces today byte for byte.

| Switch | Group | Side | Needs | ON |
|---|---|---|---|---|
| `trainer-heal-guidance-v1` (A) | guidance | agent (system prompt) | none | One prompt section: trainer and rival battles cannot be fled; a blackout costs half your money and sends you back to the last POKéMON CENTER you visited or home; your rival usually battles you when you talk; heal before talking to a trainer or the rival when below half HP. |
| `low-hp-trainer-warning-v1` (B) | guard | agent (game-tool result) | none | When a game tool's resulting state shows the field (overworld, not in battle), the player's lead Pokémon below half HP, the map ROUTE 103 with the Route 103 rival battle not won and the rival's object (RIVAL_MAY_* / RIVAL_BRENDAN_*) loaded on the map, the result gains one SUPERVISOR paragraph naming the HP, the rival and tile, the no-running rule, the blackout cost (half of the current money), and where healing happens; healing items in the bag are named when present. Fires once, re-arms when the lead is back to at least half HP, the player leaves the map or the battle is won. Recorded as a `low_hp_trainer_warning` event shown in Activity History (SUPERVISOR chip); no timeline mark. |

Game grounding (pret/pokeemerald 731ad5bf): Route 103 rival script `data/maps/Route103/scripts.inc` (talk → `trainerbattle_no_intro`, sets FLAG_DEFEATED_RIVAL_ROUTE103, our `story.rival_battle_won`); whiteout `DoWhiteOut` halves money and warps to the last heal location (`SetWarpDestinationToLastHealLocation`), which is home until a POKéMON CENTER sets it. Recorded run 54a7: ₽3000 → ₽1500, woke in BRENDANS HOUSE 2F.

## Invariants

- INV-1 OFF is byte-identical: system prompt, tool list, tool results.
- INV-2 B fires only from game state in the tool result (no timers, sleeps or polling).
- INV-3 B's paragraph is true when shown: every number comes from that state.
- INV-4 No model-facing text truncated.
- INV-5 No timeline additions (operator decision 2026-10-16).

## Milestones

**M1 — trainer-heal-guidance-v1 (A)**
- [x] Deletion receipt: removing the prompt line turns 2/6 tests red; restored, 6/6 green.
- [x] RED: registry/presets/defaults, OFF prompt byte-identical (54a7 run_start), ON appends exactly the section after battle triage, factory path. 6/6 fail: unknown feature.
- [x] COMMIT RED: `test(RED): trainer-heal-guidance-v1 ...` (sha in git log; this line written before the commit)
- [x] GREEN + registry count updates (positional `.at(-N)`, preset lists, guidance count 33, switchboard rows 71). vitest agent 1561 passed, viewer 885 passed; pytest 2236 passed, 34 skipped (ROM unset in bare uv run; full gate later with .env).
- [x] COMMIT GREEN: `feat: trainer-heal-guidance-v1 ...` (sha in git log)

**M2 — low-hp-trainer-warning-v1 (B)**
- [x] RED: wrapper fires on 54a7-shaped state (T363), not when HP ≥ half, not off Route 103, not after rival won, not in battle, not twice, re-arms after heal / map change; bag items; recorded event; viewer Activity History row and SUP chip, no timeline mark; factory path through playGameTools
- [x] RED written (module missing). COMMIT RED: `test(RED): low-hp-trainer-warning-v1 ...`
- [x] GREEN, schema regenerated (`just schema`). Module `low-hp-trainer-warning.ts`; event `low_hp_trainer_warning`; recorder method; `playGameTools` wraps outermost; viewer: model KNOWN, Activity History row (panels), SUPERVISOR chip (trace), tail; no timeline mark (test compares lanes SVG with and without the event). vitest agent 1577 passed, viewer 887 passed.
- [x] Deletion receipts: dropping `withLowHpTrainerWarning` from `playGameTools` turns the factory test red (1/16); dropping the panels row turns 2 trace tests red; both restored green.
- [x] COMMIT GREEN: `feat: low-hp-trainer-warning-v1 ...` (sha in git log)

**M3 — explainers, pending experiments, review, land**
- [x] RED: panels/server explainer-link tests for both ids (2 fail: no mapping, no file). COMMIT RED.
- [x] Explainers `docs/explainers/<id>.html` + FEATURE_EXPLAINERS + README; `just pages-check` prints nothing; viewer 888 passed.
- [x] `experiments/<id>.json` pending entries (activation ROUTE_103, primary RIVAL_BATTLE_WON, finals incumbent) + readiness.md; `just experiments-check`: ok, 64 experiments. COMMIT GREEN.
- [x] Merged main twice (9e84ba4d, then a21c24db with disproved-beliefs-v1 and same-plan-breaker-v1): registry re-applied after same-plan-breaker-v1; legacy tests reset to main and re-bumped by script (+2 positions, lists, guidance 34, guard 14, switchboard rows 74).
- [x] Gates on main-merged tip (main 154d905e, Route 103 fixture fix included): `just build` ok; `just lint` ok (tsc, eslint, ruff, mypy); `just test` vitest agent 1641 passed, viewer 907 passed, pytest 2270 passed (with POKEBENCH_ROM from .env); `just coverage` agent lines 99.09 / branches 94.49 / functions 98.18, viewer 97.62 / 91.1 / 93.62, Python 97.33 / 93.17 / 100 (floor 90); low-hp-trainer-warning.ts 100% lines, 96.3% branches, 100% functions; `just verify-vendor` ok; `just experiments-check` ok (66). Before the fixture fix, main itself failed 34 real-ROM Python tests (owned by another thread; coordinator 10:11 UTC).
- [ ] Cloud review lanes: Claude (subagent), Grok (Cursor), GPT (Cursor/Codex) all LGTM on one frozen packet
- [ ] Merge slot from coordinator, `git merge --ff-only`, `just test` on main, report SHA

## Multi-Model Review Log

**Round 1** (packet base 154d905e, head 9072cec6, diff sha256 e094432d…0747). Principles self-review: 13 rows, zero FAIL (/private/tmp/review-thw/principles.md).
- Claude (Claude subagent lane): VERDICT: LGTM. Non-blocking: blackout amount said floor(m/2) lost, but DoWhiteOut keeps floor(m/2), so odd money loses ceil(m/2) (₽1 off); no direct test of re-arm on rival battle won.
- Grok (cursor-grok-4.5-high): VERDICT: LGTM. Non-blocking: same re-arm test gap.
- GPT (cursor gpt-5.6-sol-xhigh): no review, Cursor usage limit ("You've hit your usage limit", resets 10/17). Harness switch to isolated Codex for round 2.
- Accepted and fixed in one batch: amount lost is m - floor(m/2); tests for odd money and re-arm after the rival battle is won. Gates re-run green (vitest 1643 + 907, pytest 2270, coverage ≥90). Round 2 re-reviews the cumulative packet on all three lanes.

- Synced with main 411e097d (levelup-box-v1): registry re-applied after levelup-box-v1, legacy tests reset to main and re-bumped (guidance 34, guard 14, switchboard rows 75).
- Fixed the levelup sync merge, which had brought back the 98 worklogs main archived (b0310914): docs/worklogs now matches main except this worklog.
- Gates on main 8c98cb7c-merged tip: build, lint, test (vitest agent 1653, viewer 909; pytest 2297), coverage (agent 99.09/94.53/98.18, viewer 97.62/91.1/93.63, Python 97.36/93.22/100), verify-vendor, experiments-check (67) all green. Round 2 packet sealed next.

**Round 2** (packet base 45db59c1, head 2e6c11b9, diff sha256 d9a181e8…c3c0).
- Claude (subagent): VERDICT: LGTM. Non-blocking: B could declare needs story-state-v1; A's description says "last when triage is off" (explorer guidance follows); duplicate stateOf helper; wrapper also wraps context tools; experiments pinned pre-merge.
- Grok (cursor-grok-4.5-high): VERDICT: LGTM. Non-blocking: same description wording; bag list unbounded by text budget (schema max 186).
- GPT: Cursor gpt-5.6-sol-xhigh at its usage limit; Codex default model rejected for a ChatGPT account; Codex `-m gpt-5.6-sol` (xhigh): VERDICT: BLOCKING, 5 findings, all accepted:
  1. predicate allowed a missing party_owner and a rival object whose own map_id is not Route 103 → now requires party_owner === "player" and the object on [0,18]; negative tests added.
  2. A's activation milestone → NEW_GAME_CREATED (prompt differs from the first request); readiness row updated.
  3. both incumbents now list every registered switch explicitly, in registry order.
  4. server explainer loop no longer gains two rows (mapping + file are proven in panels.test).
  5. new `low-hp-trainer-warning-wire.test.ts`: production playGameTools + real RunRecorder + pinned pi loop against a gateway fixture; the second model request carries the warning, the log holds the event before the augmented tool_result; OFF carries neither. Deletion receipt: dropping the wrapper from playGameTools turns it red; restored green.
- Gates after the batch: build, lint, test (vitest agent 1654, viewer 909; pytest 2297), coverage (Python 97.36/93.22/100; TS ≥90), experiments-check ok.
- Holding: coordinator assigned the next merge slot to people-ledger-v1 (10:42 UTC). Next: sync main once (briefing-exits-v1, untaken-exits-v1 and people-ledger-v1 added since), round 3 on all three lanes, land.
- Merge slot granted (coordinator 10:53 UTC). Synced with main be428cdb (people-ledger-v1, briefing-exits-v1, untaken-exits-v1): registry after people-ledger-v1; playGameTools keeps main's untaken-exits/people-ledger wrappers with the warning outermost; legacy tests re-bumped (guidance 34, guard 15, switchboard rows 78).
- Gates on be428cdb-merged tip: build, lint, test (vitest agent 1725, viewer 917; pytest 2299), coverage (agent 99.08/94.56/98.37, viewer 97.62/91.13/93.63, Python 97.36/93.22/100), verify-vendor, experiments-check (70) green. One coverage run hit test_warp_arrival_settle::test_a_fade_only_wait_keeps_the_fade_bound_with_the_switch_on (untouched by this branch); it passed 3/3 alone and in the full rerun. Round 3 packet next.

**Round 3** (packet base be428cdb, head 0361aa96, sha256 c228934f…5f205).
- Claude (subagent), Grok (cursor-grok-4.5-high), GPT (Codex gpt-5.6-sol xhigh): all VERDICT: BLOCKING on the same point: after the people-ledger sync both raw incumbents lacked briefing-exits-v1, untaken-exits-v1, people-ledger-v1. GPT also: the new explainer test rendered the full Harness Config once per case; no live built-viewer replay/click receipt.
- Fixed in one batch: both incumbents list all 78 switches in registry order; new raw-definition test (`trainer-heal-guidance.test.ts`: Object.keys(incumbent.features) equals SWITCHABLE_FEATURES, only changedFeature flips, no queuePosition; deletion receipt: restoring the old file turns it red); explainer test renders the two cards once with a filtered registry.
- Live proof (agent-observability + feature-explainer), isolated built viewer on 127.0.0.1:8794 (startViewer only, no queue/autorun; stopped after): a production-shaped run made by the real RunRecorder + pinned pi loop + playGameTools (proof script runs/reviews/trainer-heal-warning/proof/make-run.mjs; run kept at runs/reviews/trainer-heal-warning/proof-run). Agent Trace shows "SUP Low-HP trainer warning … #5 · 411 chars"; selecting it shows the whole paragraph and the raw event; the timeline errors lane is empty. Harness Config READ EXPLAINER opens /explainers/trainer-heal-guidance-v1.html and /explainers/low-hp-trainer-warning-v1.html (expected text present). Served app/{app,model,trace,panels,timeline}.js and both explainers hash-equal the built/tracked files (runs/reviews/trainer-heal-warning/proof/assets.txt; screenshots alongside).
- Synced main 9e27986a (viewer-only). Gates: build, lint, test (vitest 1726 + 927, pytest 2299), coverage (agent 99.08/94.54/98.37, viewer 97.63/91.09/93.68, Python 97.36/93.22/100), verify-vendor, experiments-check (70) green. Round 4 packet next.

**Round 4** (base 9e27986a, head ddf3834f, sha c79a4960…acfc). Claude: LGTM. Grok: BLOCKING (live receipts not readable inside the worktree; digests not in the worklog). GPT (Codex): BLOCKING (after a won rival battle, the post-battle dialogue runs with the rival loaded and the flag clear, so a low-HP lead could get a false 'talking starts a battle' warning). Fixes: the warning requires field_controls_locked === false (new test with a post-victory locked state, null and missing lock; deletion receipt: dropping the check turns it red), registry copy corrected (wraps every tool, free field; A's placement wording), explainer updated; live proof redone on the fixed head with receipts in the worktree (ignored runs/reviews/) and digests below.

Live proof on 19fd7bc0 (round 4 fix), isolated built viewer 127.0.0.1:8794 (startViewer only; stopped after). Receipts in this worktree at `runs/reviews/trainer-heal-warning/proof-r5/` (gitignored; copy at ~/dev/pokebench/runs/reviews/trainer-heal-warning/proof-r5): screenshots 1 (run loaded, timeline errors lane empty), 2 (Agent Trace SUP 'Low-HP trainer warning' row selected, paragraph and raw event JSON type low_hp_trainer_warning seq 5), 3 (Harness Config card with READ EXPLAINER); both READ EXPLAINER clicks opened /explainers/trainer-heal-guidance-v1.html and /explainers/low-hp-trainer-warning-v1.html with the expected text. Proof run made by make-run.mjs (real RunRecorder + pinned pi loop + playGameTools); its events.jsonl sha256 and the served-vs-built digests:
```
head 19fd7bc019a8e338363b15b2b4e9c494d5d05342 (proof taken on this commit; tree clean)
app/app.js served=53dc71d4c91f61209965ef23571c4887d24653bba79ffae332319a4254b51dd1 built=53dc71d4c91f61209965ef23571c4887d24653bba79ffae332319a4254b51dd1
app/model.js served=948c66b423a5c7738014beb56838d706464b3576d111b178c96c32b42d44c416 built=948c66b423a5c7738014beb56838d706464b3576d111b178c96c32b42d44c416
app/trace.js served=c6a8fc971536913cd49fcd75d9f5a3609ca184bd2b9ec7e8916c728e0e3af83f built=c6a8fc971536913cd49fcd75d9f5a3609ca184bd2b9ec7e8916c728e0e3af83f
app/panels.js served=49e0e8aa7b3221d14d166717e4eed9e6d56757a8d715974208d88e5d5ab7e3bb built=49e0e8aa7b3221d14d166717e4eed9e6d56757a8d715974208d88e5d5ab7e3bb
app/timeline.js served=967784b1ff61f46b37399e356b52b797c2115670ed7e97907c1d27900ad1a854 built=967784b1ff61f46b37399e356b52b797c2115670ed7e97907c1d27900ad1a854
app/main.js served=3f2f343764ef68a1ebc9daf52d611383203b8094e98245202f554ef487a34c9d built=3f2f343764ef68a1ebc9daf52d611383203b8094e98245202f554ef487a34c9d
explainers/trainer-heal-guidance-v1.html served=60d85fbb59d4d32ba2a7b8a495cef4316d23da5d84004fb04a729e59ae74fe3c tracked=60d85fbb59d4d32ba2a7b8a495cef4316d23da5d84004fb04a729e59ae74fe3c
explainers/low-hp-trainer-warning-v1.html served=d12a3f37b37f64a8be8e13dd4290cc73c41d396a0e910376a7e9e845108394a6 tracked=d12a3f37b37f64a8be8e13dd4290cc73c41d396a0e910376a7e9e845108394a6
events.jsonl bec601fc54e18935bff93c48043e39364648682cd4f31f724d48b97bd85042d8
```

**Round 5** (base 9e27986a, head bc6010f1, sha 852aafdf…f056). Claude: LGTM. Grok: LGTM. GPT (Codex): BLOCKING — (1) proof script wrote a short commit and dirty:true, so the receipt was not source-bound, and the explainer clicks had no page captures; (2) wire test ran ON and OFF through disk and HTTP, explainer test re-read files the mapped-explainer test reads; (3) tail line untested. Fixes: wire test is one ON real-adapter run (OFF/matrix proven in memory); explainer card test checks links only; new tail test asserts the exact SUPERVISOR line (deletion receipt: removing the tail case turns it red); proof script now records the full HEAD and the real dirty state; proof redone below on the committed, clean head with both explainer pages captured.
