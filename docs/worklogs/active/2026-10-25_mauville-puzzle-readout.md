# Mauville puzzle readout correctness

Authorization: The operator: “Let’s do it… bug fix… on in both arms, the control and the bundle.”

One bounded milestone: expose observable Mauville Gym floor-switch state and electric-door tiles from the current live map. Distinguish these from permanent walls/floor; label the existing interaction targets without changing their keys or selecting an action. Show the current barrier configuration on each observation so changes remain visible. Register mauville-puzzle-readout-v1, default ON with explicit OFF restoring legacy bytes, and onInBoth in the current feature recipe. Preserve frozen active runs and historical metadata.

No puzzle solver, route policy, foreknowledge of switch effects, input changes, or live-run restart. Runtime field state comes from the current paired map snapshot, never a predicted puzzle state. No new persistence or event schema.

- [x] RED tests committed (22f42e155).
- [x] GREEN implementation, shared arm config, explainer.
- [x] Native archived-state proof and mutation check.
- [x] Full gates and principles PASS; independent review completed.
- [x] Serialized landing and viewer proof.

Reference: clean pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, matching US ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7. Sources: MauvilleCity_Gym/scripts.inc, field_specials.c MauvilleGymPressSwitch/SetDefaultBarriers, metatile_labels.h. Evidence d41e #193989/#194138/#195466 reproduces recorded full grids exactly from hash-validated raw RAM.

RED: production-readout and arm-materialization regressions added. Python collection fails because the puzzle module is absent (expected).

## Implementation evidence

- Default ON explicitly authorized in both arms; current.json features true plus onInBoth. Old frozen definitions/headers unmodified. Six production definition materializations checked, all phases/control/bundle.
- Text-only rendering over existing paired LocalMap/FullMap, map10/0 qualified; collision/elevation grid and interaction target identity unchanged. Local views never annotate outside their tiles. No state history, predicted switch effects, navigation policy or new schema. Switch/door coordinate lists describe the current configuration, including beneath preserved @/N/W.
- 13 focused Python checks pass, including exact production formatting, partial/full views, inactive screens, all vertical footprint states, fixed-pole exclusions and adjacent labels. Two production arm/default/env recording tests pass; viewer map routes/cards covered by existing owner tests.
- Native reparse of raw63370/63432/63956 with archive and ROM hash validation: outputs show raised->pressed switch and blocked->open->blocked upper gate. OFF equals pre-fix main production bytes for all three; SHA256 1f933039f7ca443deb40060ff5fccb245987c720f77d7dff5a05bbb7d480b568 / bbf22a07b3481cb507dc51aa3e615a6fc4b7017428b97a4444f736e2989b8ffb / 3a553497dfa6201b26d6b80773e51182a2b9b346c59ce9df947371026506dc17. No live gameplay input.
- Mutation: removed readout overlay wiring -> intended production readout assertion FAIL; restored ->13PASS. Receipts /tmp/mauville-mutation-{no-overlay,restored}.log.
- Pre-sync agent4407PASS/viewer1954PASS/Python4171PASS+one expected registry-count failure (88->89 corrected). Legacy fixture lists now explicitly include the new server OFF id; flags/default expectations use the operator-approved ON. An overlapping coverage/test invocation timed out two unrelated5000ms tests; discarded, gates rerun serially without timeout changes. Lint/build/vendor pass; final combined gates pending.
- Headless Chromium: matching Harness Config card ON -> real READ EXPLAINER click opens exact tracked page;1280/1440/375 no overflow, no page errors; all screenshots inspected. Offline candidate replay is labelled NOT A GAMEPLAY TRIAL / NOT MODEL DELIVERY; original logs untouched. Native saved frames inspected.
- Coordinator confirms live9e33/d41e/6bbd/429f and runner84389/97487 remain frozen; queued swapped pair also captured old pin. Only future fresh launches inherit the fix. One eventual coordinated viewer refresh permitted at number1, using /private/tmp/pokebench-viewer-qwen36-20261024. Another branch landed f6da68cf3 while this branch gated; sync before freezing and rerun combined gates.

Sync: GREEN f06c74d10; main f6da68cf3 adds caught-nickname-prompt-v2 in the same append-only registries. Resolved by retaining main first and appending Mauville; preserved V2’s own defaults/recipe. Combined gate run supersedes all pre-sync receipts.

Final main evidence sync: nickname owner replaced its evidence-only46afb8914 with3f926f129; kept their current worklog exactly. Runtime/test trees are unchanged from f11c6efd9, the combined gate source. No candidate production delta changed.

## Final combined verification before review

- Combined main3f926f129 + candidate production/test content byte-identical to f11c6efd9 (later merges change only the other worklog). `just test`:4408 agent,1958 viewer,4184 Python, three approved trainer-card screenshots pass at1280/1440/375. `just coverage`: agent L/B/F99.17/92.74/97.58%; viewer98.20/91.81/95.37%; Python97.41/93.46/100%. `just lint`, build and verify-vendor PASS. Receipts canonical runs/reviews/mauville-puzzle-readout/gates/.
- The isolated visual check initially failed because art was missing; configured the canonical read-only trainer-card-v1 path, then full `just test` and all exact baselines passed. No source fix, baseline update or gate bypass.
- Explainer mobile diagram uses an internal horizontal scroller for readable labels;1280/1440/375 screenshots rechecked, no page overflow or page errors. pages-check silent. Config card->READ EXPLAINER real click verified. Offline trace row#195467 and raw JSON contain the new coordinate lists and named targets, with recorded frame visible. These offline receipts are not a live model trial.
- Activation boundary: fresh launches only, both arm materializations ON. Active and already queued frozen sources unmodified.

## Principles Adherence

Repo CLAUDE.md selects PB1-PB13; the old draft header in agent-principles.md is superseded.

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | Current live metatile/collision facts; three hash-validated native snapshots and paired frames, not model narration. |
| PB2 | PASS | Original run logs/checkpoints/frames preserved, including the struggling gym trace; no new measured trial or hidden failure. |
| PB3 | N/A | Correctness proof only; no claim that the model solves the gym faster or more often. |
| PB4 | PASS | Named recorded switch, explicit exact-OFF behavior, source-bounded factual observations; vendor clean, no RAM writes or solver. |
| PB5 | PASS | One observation correction, shared ON in both arms per explicit user; no navigation or experiment protocol changes. |
| PB6 | N/A | Context budget/history/compaction unchanged; bounded map footprint lists replace no history owner. |
| PB7 | PASS | Existing tool-result text remains the durable feedback channel; offline trace/raw-inspector/replay proof labelled NOT MODEL DELIVERY, originals immutable. |
| PB8 | N/A | Tool input/activation/validation/retry/stop behavior unchanged. |
| PB9 | PASS | User explicitly approved implementation and ON in control/bundle; observational labels chosen from source/paired live tiles, no unresolved policy proxy. |
| PB10 | PASS | Final full tests/build/lint/coverage/vendor/three exact protected visual baselines pass; no skips, lowered gates, timeout increases or baseline edits. |
| PB11 | PASS | Verified clean source731ad5bf, ROM and archive hashes; replay uses existing production reader/formatter. No new library/API dependency. |
| PB12 | PASS | Existing external ~/.roms ROM read in place; no ROM copy or TCC access. Background Chromium only; screenshots inspected with image tool. |
| PB13 | PASS | RED22f42e155, GREENf06c74d10, combined gates/native/mutation/browser receipts recorded. Independent frozen review now required before landing; no premature completed/live claim. |

## Multi-Model Review Log — round 1

Frozen reviewed HEAD `1fbfd04181a43f67680b86dd48a8ea43d9169c57`, base `3f926f1295e179b3f6ee178da90431286f7f4b15`, binary diff SHA256 `7833ee9394fb08a2a4a8a03563968c2872b3b604071ebe270b38f9bb5f751735`. Candidate stayed clean and unchanged throughout review; each reviewer independently verified identity. Receipts: `runs/reviews/mauville-puzzle-readout/round1/`.

- Claude Opus 5.5 CLI (plan/read-only), exit0, empty stderr: VERDICT: LGTM.
- Normal isolated GPT lane, gpt-5.6-sol xhigh: VERDICT: LGTM.
- Availability fallback gpt-6.1-sol high: VERDICT: LGTM.
- Availability fallback gpt-6-astra high: VERDICT: LGTM.
- Grok4.5-high and Grok4.7-high each exit1, ActionRequiredError exhausted Cursor usage. These are outages, not approvals. Fallbacks have reduced vendor diversity and are not Grok approval.
- Independently verified original standing human authorization to land without Grok during the outage (server-copied user entries, including “land without grok. you're not a very good coordinator if you force me to go into chats”); current coordinator explicitly confirmed scope and non-revocation. Original authorization payload receipts retained at `grok-authorization-source.json` and `grok-authorization-scope.json`.
- Zero required fixes. Claude optional extra OFF golden is a follow-up; actual archived-base byte comparisons already pass. Authorized default ON is intentional. Existing terrain handling protects the reused lowercase s outside Mauville. No review-driven scope changes.

## Landing and served proof — 2026-10-25 13:12 EDT

- Took landing slot with actual Codex thread 00000000-0000-4000-8000-90ca69b45a28. Fast-forwarded clean local main to exact reviewed `1fbfd04181a43f67680b86dd48a8ea43d9169c57`; no remote or PR.
- `just build` then `just test` on main PASS: agent4408, viewer1958, Python4184, approved exact trainer-card screenshots3/3. Main receipt `gates/main-test.log`; prior combined coverage/lint/vendor receipts remain applicable to unchanged production/test tree.
- One coordinated `just viewer-main`, clean detached `/private/tmp/pokebench-viewer-capture-f6da68c`, serves clean1fbfd0418. Single8790 listener9871 parent1. Served app/panels bytes exactly match disk. APIs runs/workbench/next-run200; new draft featuretrue. All four original runs still live with no catalog problems. All10 captured gameplay/server/runner process identities survived; restart guard also confirms4 gameplay processes preserved. Receipts `pre-refresh.json`, `live-proof.json`, `gates/viewer-refresh.log`.
- Headless real viewer selected d41e: Harness Config shows NOT RECORDED for the new switch, preserving historical identity; actual READ EXPLAINER opens the tracked page. Desktop1280/phone375 screenshots inspected, no page errors or outer overflow. Local8791 canonical explainer returns200; pages-check clean. Screenshot/interaction receipts in `runs/mockups/mauville-puzzle-readout/shots/live-*`.
- Fresh future control and bundle definitions enable the fix. Active trials and already queued frozen pair remain at their previous pins; no gameplay input, restart, trial launch or queue mutation. No measured gameplay benefit claimed.
- This final commit changes this worklog only and records evidence after the exact reviewed source landed. Served runtime remains the reviewed1fbfd0418; this evidence commit changes no runtime content.
