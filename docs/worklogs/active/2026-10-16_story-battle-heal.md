# Low-HP warning v2: heal to full before any story battle

## Problem Statement

`low-hp-trainer-warning-v1` (landed 60f66178) warns only on Route 103, only for the rival, and only below half HP. Operator (the operator, 2026-10-16 2:43 PM EDT): "the low HP trainer warning should not be route specific. This is general game guidance" and "we need to do the heal before story trainer battles at any HP below max. And I want it to generalize ... that fix needs to go into the bundle." Coordinator brief: cover any unbeaten story or rival trainer on the map, new switch version, tests and the three reviews, ask for the merge slot.

## Skills Loaded

feature-switch, feature-explainer, execute-worklog, agent-observability, close-the-loop, pokebench-game-state.

## Architecture

New switch `low-hp-trainer-warning-v2` (guard, agent side, default OFF, needs `low-hp-trainer-warning-v1`). With it ON the v1 wrapper uses the v2 condition and records a `story_battle_warning` event instead of `low_hp_trainer_warning`. OFF: v1 exactly.

Story battles the game state can see today (pret/pokeemerald 731ad5bf):

| Battle | Map | Won flag (story field) | Present when | Starts by |
|---|---|---|---|---|
| Rival MAY/BRENDAN | ROUTE103 [0,18] | FLAG_DEFEATED_RIVAL_ROUTE103 0x82 (`rival_battle_won`) | rival object loaded (OBJ_EVENT_GFX_RIVAL_MAY_NORMAL 105 / RIVAL_BRENDAN_NORMAL 100) | talking (Route103_EventScript_Rival, trainerbattle_no_intro) |
| Gym Leader ROXANNE | RUSTBORO CITY GYM [11,3] | TRAINER_ROXANNE_1 flag 0x609 (`roxanne_defeated`) | Roxanne object loaded (OBJ_EVENT_GFX_ROXANNE 125) | talking (RustboroCity_Gym_EventScript_Roxanne, trainerbattle_single) |
| TEAM AQUA grunt | PETALBURG WOODS [24,11] | TRAINER_GRUNT_PETALBURG_WOODS flag 0x50A (`petalburg_woods_aqua_grunt_defeated`) | on the map (his object, gfx 117 at 26,17, is loaded but has no talk script; removeobject runs after the battle) | walking into the Devon researcher scene (coord events PetalburgWoods_EventScript_DevonResearcherLeft/Right, trainerbattle_no_intro) |

Condition: free field (overworld, not in battle, field controls unlocked), player party, one of the rows above unbeaten (flag explicitly false), and any party Pokémon (not an egg) below its max HP. Re-arm: whole party at full HP (every HP read and at max), another map, or that battle won.

## Invariants

- INV-1 v2 OFF = v1 byte-identical (paragraph, events, tools).
- INV-2 Fires only from the tool result's own game state.
- INV-3 Every sentence true when shown; numbers from the state.
- INV-4 No truncation; every hurt party member listed.
- INV-5 No timeline additions.

## Milestones

**M1 — low-hp-trainer-warning-v2**
- [x] RED: registry/presets/defaults/needs; condition per row (fires, not when won/unknown/locked/full HP/other map/not loaded); party list; text per row; re-arm; v2 OFF = v1; event schema; viewer Activity History + tail; factory path; pi delivery
- [x] COMMIT RED: `test(RED): low-hp-trainer-warning-v2 ...` (13 tests fail: unknown feature)
- [x] GREEN: `low-hp-trainer-warning.ts` (STORY_BATTLES table, storyBattleWarning, storyBattleText, StoryBattleWarning arm keyed by battle, v2 branch in withLowHpTrainerWarning that throws without a storyBattleWarning recorder), `story_battle_warning` event + `just schema`, RunRecorder.storyBattleWarning, tail line, viewer KNOWN/Activity History row/SUP chip, no timeline mark; pi delivery test has a v2 row. Legacy positional and preset-list tests updated (guard 19, switchboard rows 89). vitest agent 1894, viewer 974; lint clean.
- [x] Deletion receipts: disabling the v2 branch turns 3 tests red (story-battle + wire); removing the tail case turns 1 red; removing the Activity History row turns 2 trace tests red; all restored green.
- [x] COMMIT GREEN: `feat: low-hp-trainer-warning-v2 ...`

**M2 — explainer, pending experiment, gates, review, land**
- [x] Explainer `docs/explainers/low-hp-trainer-warning-v2.html` (pages-check clean) + FEATURE_EXPLAINERS + README + link test; pending `experiments/low-hp-trainer-warning-v2.json` (incumbent = finals incumbent with v1 ON; raw-key test) + readiness row; experiments-check ok (79).
- [x] Gates; live viewer proof (isolated viewer) — see Round 0–3 notes below
- [ ] Claude, Grok, GPT LGTM on one frozen packet; merge slot; ff-only merge; report SHA

## Multi-Model Review Log

Rounds are recorded below in order.

- [x] Gates on b9998d70 (main 4070e250): build, lint, test (vitest agent 1895, viewer 974; pytest 2465), coverage (agent 99.13/94.61/98.29, viewer 97.68/91.17/93.79, Python 97.52/93.55/100; low-hp-trainer-warning.ts 98.67 stmts / 92.04 branches / 100 funcs), verify-vendor, experiments-check (79).
- [x] Live proof on clean b9998d70, isolated built viewer 127.0.0.1:8794 (startViewer only; stopped after). Two runs made by make-run.mjs (real RunRecorder + pinned pi loop + playGameTools, v1+v2 ON): rival (T363) and woods (T363 moved to PETALBURG WOODS, grunt unbeaten). Woods run in the viewer: timeline errors lane empty (1), Agent Trace SUP 'Story battle warning' row with the paragraph and raw event story_battle_warning seq 5, kind aqua_grunt (2), Harness Config card (3), READ EXPLAINER opened /explainers/low-hp-trainer-warning-v2.html (4 desktop, 5 phone). Receipts in this worktree at `runs/reviews/story-battle-heal/proof/` (gitignored). Digests:
```
head b9998d7062ae55e1472b24bf117c8526b1ff9ffd clean=yes
rival run_start.harness {"commit":"b9998d7062ae55e1472b24bf117c8526b1ff9ffd","dirty":false} events.jsonl 0b3df9f8b5c882d7a8d844b912477b4321f7eb7e85529841fb7ab004eea65186
woods run_start.harness {"commit":"b9998d7062ae55e1472b24bf117c8526b1ff9ffd","dirty":false} events.jsonl 805af6a1100be392246416e16ab951ad6de2881777a626069448404d7c92ad69
app/app.js served=7f3ba73f8e01f22bb868636c818470039d52582ba05bcdf1debec5c8f3a00e2c built=7f3ba73f8e01f22bb868636c818470039d52582ba05bcdf1debec5c8f3a00e2c
app/model.js served=0f4f3e3f7cd6e25c70064534c95b75c5dc58f6dfaa83069657f2b5ac4a9f7ee3 built=0f4f3e3f7cd6e25c70064534c95b75c5dc58f6dfaa83069657f2b5ac4a9f7ee3
app/trace.js served=5a80bc1689f19dc79daf4db6896fa368ecb0f377d757ea5fc7cde29ffce2b067 built=5a80bc1689f19dc79daf4db6896fa368ecb0f377d757ea5fc7cde29ffce2b067
app/panels.js served=a0b0f80cb7569bf10ff11b1c30ff46c5e2e16d6360905066092e421d8b9c134c built=a0b0f80cb7569bf10ff11b1c30ff46c5e2e16d6360905066092e421d8b9c134c
app/timeline.js served=967784b1ff61f46b37399e356b52b797c2115670ed7e97907c1d27900ad1a854 built=967784b1ff61f46b37399e356b52b797c2115670ed7e97907c1d27900ad1a854
app/main.js served=3f2f343764ef68a1ebc9daf52d611383203b8094e98245202f554ef487a34c9d built=3f2f343764ef68a1ebc9daf52d611383203b8094e98245202f554ef487a34c9d
explainers/low-hp-trainer-warning-v2.html served=3f1a80a72241d9b8dd21279e4597609ec451e55e7a26119aa0fb52114717858b tracked=3f1a80a72241d9b8dd21279e4597609ec451e55e7a26119aa0fb52114717858b
```

**Round 1** (base 4070e250, head a4afae39, sha 817dfcc3…4208). Grok: LGTM (non-blocking: PB11 mis-tagged; duplicate v2 ids in features.test off() calls). Claude: BLOCKING (the grunt is not hidden before his scene: FLAG_HIDE_PETALBURG_WOODS_AQUA_GRUNT is never set before the battle; his object is loaded with no talk script and coord events at (26,23)/(27,23) start it; wording only). GPT (Codex): BLOCKING (an unreadable party, hp/max_hp null, counted as full and re-armed the warning). Fixes: fullParty() requires every non-egg HP read and at max (new test: unreadable and partly unreadable parties do not re-arm; deletion receipt: the old expression turns it red); grunt wording fixed in the code comment, registry copy, explainer, test name and worklog; PB11 re-scored N/A (grounding under PB1); stray blank line and duplicate test ids removed.

- Synced main 4c805958 (viewer story-frontier colors; no registry change). Gates on 944c04f2: build, lint, test (vitest 1896 + 996, pytest 2465), coverage (agent 99.13/94.61/98.3, viewer 97.74/91.3/93.9, Python 97.52/93.55/100), verify-vendor, experiments-check (79). One earlier coverage run hit an unrelated flake in viewer server-stream.test.ts (passed 3/3 alone and in the rerun).
- Live proof on clean 944c04f2 (isolated built viewer 8794, stopped after): woods run SUP row + raw event, timeline errors lane empty, READ EXPLAINER opened the v2 explainer with the corrected grunt wording. Receipts at `runs/reviews/story-battle-heal/proof-r2/`. Digests:
```
head 944c04f28aeb0bb7d2c11f7c345f23a51861d8ec clean=yes
rival run_start.harness {"commit":"944c04f28aeb0bb7d2c11f7c345f23a51861d8ec","dirty":false} events.jsonl 97a11fab6651c51b3ea01f856b31bd3acd3f6ceec5f34e397227c6929971dcea
woods run_start.harness {"commit":"944c04f28aeb0bb7d2c11f7c345f23a51861d8ec","dirty":false} events.jsonl a03d47fb72da60e7f9f70422efec6ae33d850f1c85723a738b1afd00ad5a1a69
app/app.js served=7f3ba73f8e01f22bb868636c818470039d52582ba05bcdf1debec5c8f3a00e2c built=7f3ba73f8e01f22bb868636c818470039d52582ba05bcdf1debec5c8f3a00e2c
app/model.js served=0f4f3e3f7cd6e25c70064534c95b75c5dc58f6dfaa83069657f2b5ac4a9f7ee3 built=0f4f3e3f7cd6e25c70064534c95b75c5dc58f6dfaa83069657f2b5ac4a9f7ee3
app/trace.js served=5a80bc1689f19dc79daf4db6896fa368ecb0f377d757ea5fc7cde29ffce2b067 built=5a80bc1689f19dc79daf4db6896fa368ecb0f377d757ea5fc7cde29ffce2b067
app/panels.js served=a0b0f80cb7569bf10ff11b1c30ff46c5e2e16d6360905066092e421d8b9c134c built=a0b0f80cb7569bf10ff11b1c30ff46c5e2e16d6360905066092e421d8b9c134c
app/timeline.js served=967784b1ff61f46b37399e356b52b797c2115670ed7e97907c1d27900ad1a854 built=967784b1ff61f46b37399e356b52b797c2115670ed7e97907c1d27900ad1a854
app/main.js served=3f2f343764ef68a1ebc9daf52d611383203b8094e98245202f554ef487a34c9d built=3f2f343764ef68a1ebc9daf52d611383203b8094e98245202f554ef487a34c9d
explainers/low-hp-trainer-warning-v2.html served=ad3ca69d4c46cc46c368f6ec3c32f0f369f315b40eb5a11061d1ba79b3202f7d tracked=ad3ca69d4c46cc46c368f6ec3c32f0f369f315b40eb5a11061d1ba79b3202f7d
```
- Synced main b0179665 (ledger re-score, viewer; no registry change). Gates green again: vitest agent+viewer pass (viewer 1002), pytest 2465, coverage ≥90 (Python 97.52/93.55/100), lint, experiments-check. Agent code from main merged cleanly; the live receipts above were taken on 944c04f2 and the warning's code is unchanged since.

**Round 2** (base e349269c, head 273d804d, sha bed3862b…c763). Claude: LGTM. Grok: LGTM. GPT (Codex): BLOCKING — (1) a party with one readable hurt member and one unreadable member gave a partial list; (2) revival medicine (REVIVE, MAX REVIVE, REVIVAL HERB; ItemUseOutOfBattle_Medicine in src/data/items.h) was not named though v2 lists fainted Pokémon; (3) live proof was one main sync behind the frozen head and lacked 1280×900/1440×900/375×812 captures. Fixes: v2 stays silent while any non-egg party Pokémon is unreadable (test; deletion receipt red); v2's item list adds the three revival items, v1's list unchanged (test asserts both; deletion receipt red); fullParty uses hp === max_hp; duplicate ids in features.test off() lists removed; copy updated in the registry and explainer. Round 3 live proof is taken on the frozen round-3 head itself (no commit after it): receipts and digests in the gitignored runs/reviews/story-battle-heal/proof-r3/ (head.txt names the commit).

**Round 3** (base 986cb496, head 36829c55, sha 8e0f522c…764c). Claude: LGTM. Grok: LGTM. GPT (Codex): BLOCKING — (1) bag items were named even when no hurt Pokémon could use them (REVIVE with no fainted member, POTION with only a fainted one; src/pokemon.c refuses both); (2) the another-map re-arm path had no test. Fixes: items filtered by target (HP medicine only with a conscious hurt member, revival medicine only with a fainted one), test for both mismatches and the mixed case; new test leave-the-map-and-return fires again; deletion receipts: removing the map branch and removing the filter each turn a test red. Copy updated in the registry and explainer. Round 4 receipts on the frozen round-4 head at runs/reviews/story-battle-heal/proof-r4/.
- Synced main 54a525b5 (surf-gated-exits-v1): registry re-applied after surf-gated-exits-v1, legacy tests reset to main and re-bumped (guard 19, switchboard rows 90), v2 experiment incumbent lists the 90 switches up to v2.
- Gates on the synced head (main 03e45115): build, lint, test (pytest 2498, vitest pass), coverage (agent 99.21/94.75/98.32, viewer 97.75/91.33/93.97, Python 97.55/93.60/100), verify-vendor, experiments-check (82).
- Synced main 2c1befc7 (navigation-truth-v1, navigation-refusal-reasons-v2): registry re-applied after navigation-refusal-reasons-v2; legacy tests reset to main and re-bumped (guard 19, switchboard rows 92); duplicate v2 keys removed; v2 experiment incumbent lists the 92 switches up to v2.
- navigation-truth.test.ts kept as main has it (the list edit there was not needed). Viewer coverage run hit the server-stream.test.ts timing flake again (untouched by this branch); rerun below.

**Round 4** (base 2c1befc7, head f4e8c673, sha 786a8904…4c3f). Claude: LGTM. Grok: LGTM. GPT (Codex): BLOCKING on evidence and process — (1) not every gate recorded on the frozen head; (2) no experiment design for the pending entry; (3) no server test for the v2 explainer route; (4) opened raw event and explainer not captured at all three widths, no keyboard activation. Fixes: server.test serves low-hp-trainer-warning-v2.html byte for byte (deletion receipt: removing the FEATURE_EXPLAINERS entry turns it red); features.test off() duplicates removed; the pending entry and readiness row now say it is not designed and must be designed before queueing — the same state as levelup-box (experiment-queue skill: design before queueing; registering a pending entry is the feature-switch skill's requirement, and the operator's GPU-hour budget is needed for a design). Round 5 receipts at runs/reviews/story-battle-heal/proof-r5/ on the frozen round-5 head: every gate's output in gates/, pointer and keyboard activation of READ EXPLAINER, raw event and explainer at 1280x900, 1440x900 and 375x812.
- features.test.ts: off() rejects duplicate ids; every off() list deduped (Codex r5 #3). features.test 26/26.
- Synced main cefacbf1 (cross-map-goal-v1). v2 stays last in the registry; positional tests +1; features.test rebuilt from main with the duplicate guard and deduped lists; cross-map-goal's pending-experiment test now compares keys up to its own switch (same convention as trainer-heal-guidance and script-line-presence); switchboard 93 rows; incumbent gains cross-map-goal-v1 OFF. agent 1995/1995, viewer 1027/1027.
- RED (Codex r6 #1): a party read at full HP with an unreadable species must re-arm v2; new test fails at the third observe (fullParty requires species).
- GREEN: fullParty needs only every non-egg HP read and at max (species no longer required); features.test round-trip loop builds the ALL_ON list once and uses a Set (Codex r6 #2). story-battle-warning 21/21, features 26/26.
- Synced main 53448a0d (explorer-guidance-v2). Positional tests set from the real registry; explorer-guidance-v2's frozen main-switch list excludes v2 (its main prompt digests still match with v2 ON: v2 never touches the system prompt); cross-map-goal.json incumbent gains low-hp-trainer-warning-v2 OFF (main's own convention when explorer-guidance-v2 landed); v2 incumbent gains explorer-guidance-v2 OFF; switchboard 94 rows. agent 2007/2007, viewer 1029/1029.
- Synced main f7ee1bae (ineffective-loops-v1): positional tests from the registry; explorer-guidance-v2's main-switch filter also excludes v2; cross-map-goal.json and ineffective-loops.json incumbents gain low-hp-trainer-warning-v2 OFF; v2 incumbent gains ineffective-loops-v1 OFF. agent 2043/2043.
- Synced main 6db26e44 (ineffective-loops pin, bundle membership): clean merge.
