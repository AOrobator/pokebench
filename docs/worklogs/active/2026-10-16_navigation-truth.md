# Navigation truth (cook harness audit fixes, TypeScript)

Branch `claude/navigation-truth`, worktree `/private/tmp/pokebench-navigation-truth`, cut from main 1f4ac74e. Operator (the operator) approved fixing these bugs at 5:34 AM New York time 2026-10-16 ("fix all of these bugs and then put them in the bundle"), relayed by the thread owner; that is this worklog's approval. Merging is left to the thread owner (no self-merge from this branch).

## Problem Statement

The 2026-10-16 cook harness audit (`runs/reports/2026-10-16-cook-harness-audit/`) found TypeScript harness messages that tell the model false or incomplete things:

1. navigate_to offers "to talk to it or use it … press A" for a live object with no script (sh02 T260 seq 5861, PROF_BIRCH on Route 101, script 0x0, absent from `interaction_targets`).
2. The planner walks and offers stand tiles through coordinate triggers whose condition matches now, which run a script that pushes the player back (sh02 T260: PreventExitWest (6,15–18), PreventExitNorth (7,13); 3f21 T123 seq 2374: NeedPokemon triggers (10,1)/(11,1), "nearest walkable … (10,0)").
3. "blocked; inspect obstacle" does not name the wandering NPC that stepped into the route (54a7 T169 seq 3790, FAT_MAN (13,14)->(14,14)).
4. A walk that advances and then refuses, or hits the 8-press cap, does not say where it stopped (sh02 T806 seq 13284: stopped at (13,7), result named (19,7)).
5. The interaction loop-guard text says "Reopening the same message is not story progress." when no message was open (sh02 T810 seq 13428, T1061 seq 18027; 54a7 T125 seq 2745).
6. Dialogue auto-advance cuts a page at every scroll prompt, so one sentence becomes several "pages" (54a7 seq 3032, 3959, 4838).
7. Speakers: narration ("GMREEN received the TORCHIC!") is tagged with the previous speaker (sh02 T334); a speaker named by "MAY:" on page 1 becomes `RIVAL_MAY_NORMAL (sprite kind, not a name)` on the next pages of the same conversation (sh02 T922).
8. (Behavior change) A goal reachable only through tiles outside the 15×15 local window is refused with "no supported local path" and no reason (show T800; 54a7 T213–218 seq 5217–5268; e588 seq 21016/21228/21335).

## Skills Loaded

feature-worklog, execute-worklog (incl. Landing on main), feature-switch, feature-explainer, pokebench-game-state, agent-observability, multi-model-review (+ reviewer-invocation reference). pokeemerald reference checkout 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean.

## Architecture

Two new switches, registered at the registry tail:

- `navigation-truth-v1` (correctness group for items 1–7; needs null; default OFF in presets; **intended ON in both arms** of bundle-v-control, set by the integrator, not this branch). OFF reproduces today's bytes.
  - `navigation.ts`: `targetReason` offers "press A" only for an object in `interaction_targets` (object with a script, world.py) or an A-activated target; otherwise says the object has no script. Planner option `triggers`: tiles of `world_context.triggers` with `condition_met === true`, `variable !== 0` (TRIGGER_RUN_IMMEDIATELY returns no script, pokeemerald `TryRunCoordEventScript`) and elevation 0 or the walker's elevation (`GetCoordEventScriptAtPosition`) are never crossed on the way to another goal; stand tiles and the nearest-walkable suggestion skip them; when the goal is reachable only across one, the refusal names the trigger. Trigger avoidance needs `coordinate-script-conditions-v1` too (that switch owns telling the model about triggers). The walk names the object that now stands on the next route tile when it is blocked, and says where a partial walk stopped and why (refusal after steps, or the per-call press cap).
  - `loop-detection.ts`: the interaction message keeps "Reopening the same message is not story progress." only when this call ended with a ready message or restarted a conversation (message text only; repeating/recover untouched).
  - `dialogue-auto-advance.ts` (`Pages` only): a `scroll_wait` (RENDER_STATE_SCROLL_START, `\l`) is not a page end; the page closes at `page_wait` (`\p` clear), `button_wait`, `dismiss_wait` or flush. A speaker named by a NAME: prefix is kept for later messages while the player still faces the same object; a page that narrates the player's own action (`{PLAYER} received …`) gets no speaker.
- `navigation-refusal-reasons-v2` (behavior change, needs `bounded-navigation-v1`, default OFF, **bundle arm only**). Local mode, goal inside the window, standable, unreachable inside it, map bounds known: the refusal says the route would leave the 15×15 local map and names the reachable window-edge tile (one with an unseen in-map neighbour) nearest the goal. Does not enable full-map-navigation-v1.

## Invariants

- INV-1 OFF is byte-identical: every changed message and plan is gated; existing tests stay green unchanged. Test: OFF assertions on each fixture.
- INV-2 No model-facing truncation; pages are whole paragraphs. Test: 54a7 seq 3014–3026 states produce one page.
- INV-3 Trigger facts come from `world_context.triggers` (game RAM, `condition_met`), grounded in pokeemerald `field_control_avatar.c` 877–916.
- INV-4 The production factories honor both switches (withNavigation, attachLoopGuard via live/decision-probe, withDialogueAutoAdvance). Test: factory tests + wiring deletion.

## Security Review

No new I/O, subprocesses, network, persistence or permissions. Strings are built from typed state only.

## Milestones

**M1 — navigation-truth-v1 + navigation-refusal-reasons-v2**
- [x] RED: tests for items 1–8 from recorded states (sh02 5860, 3f21 T123, 54a7 T169, sh02 T806, 54a7 seq 3014–3026, sh02 T922/T334, e588 seq 21335 / 54a7 T213), OFF byte-identity, factory wiring
- [x] COMMIT RED: `test(agent): RED navigation-truth-v1 and navigation-refusal-reasons-v2 from recorded cook states` (73a12a86)
- [x] GREEN: implement, register switches, presets, next-run defaults, explainers, FEATURE_EXPLAINERS, pending experiments + readiness rows
- [x] Wiring deletion check (red once, restored): 16 receipts, see Session Log
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90), `just verify-vendor` (pytest: 34 failures inherited from main, see Surprises)
- [x] COMMIT GREEN: `feat(agent): GREEN navigation-truth-v1 and navigation-refusal-reasons-v2 (default off)` (16baa877)
- [x] Merge main (154d905e), rerun gates
- [ ] Seal packet
- [x] Principles self-review (PB1–PB13): zero FAIL (table below)
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
- [ ] STOP: report to thread owner (no self-merge)

## Closing the Loop

Report branch, frozen head, packet sha256, verdicts, gates, switch ids and intended arms to the thread owner.

## Session Log

- 2026-10-16: worktree from main 1f4ac74e; evidence read (sh02, 3f21 qualification N4, 54a7 live F8–F11, e588 F6, show F5).

- 2026-10-16: RED. `navigation-truth.test.ts` (25 tests: 16 fail, the 9 OFF/byte-identity cases pass). Fixture `fixtures/navigation-truth-states.json.gz` (82 recorded state events from sh02, 3f21, 54a7, e588, show; envelope plus resources/running/party_ownership/game_stats stripped). The dialogue replay reproduces the recorded 54a7 seq 3032 pages exactly with the switch off.

- 2026-10-16: GREEN. navigation.ts (talk offer, trigger-aware planner/stand/nearest, triggerReason, windowReason, blocker, partial-walk and command-limit status), loop-detection.ts (message text only; `messageTruth` 7th ctor arg, attachLoopGuard 8th, wired in live.ts and decision-probe.ts), dialogue-auto-advance.ts (Pages only: scroll_wait is not a page end; named speaker kept while the same object is faced; narration pages get no speaker). Registry: `navigation-truth-v1` (guidance, needs null) and `navigation-refusal-reasons-v2` (guidance, needs bounded-navigation-v1) appended last; presets/flagFeatures/next-run default false; registry position tests bumped by 2. Explainers `docs/explainers/navigation-truth-v1.html`, `navigation-refusal-reasons-v2.html` (figures drawn from the recorded local maps), mapped in FEATURE_EXPLAINERS; `just pages-check` prints nothing. Pending experiments `experiments/navigation-truth.json`, `experiments/navigation-refusal-reasons-v2.json` + readiness rows (PENDING).
  - Wiring/guard deletion receipts (scratchpad nt/receipts, each red once then green): withNavigation truth, triggers, windowReasons; live.ts messageTruth arg; harness.ts pass-through; dialogue truth; scroll guard; narration guard; speaker keep; reopen guard; planner trigger step; blocker; partial walk; command limit; no-script offer; gated nearer.
  - Gates: agent 1588 passed, viewer 885 passed; pytest 2236 passed / 34 failed (all `KeyError: 33786826` in `pokebench_env/route103_rival.py:34`, inherited from main; env/ untouched); lint clean (mypy needed the main checkout's native mgba binding linked into the worktree venv); build OK; verify-vendor OK. Coverage: agent lines 99.16 / branches 94.35 / functions 98.08; viewer 97.64 / 91.02 / 93.62; python lines 97.31 / branches 93.11 / functions 100.
  - Evidence outputs (ON): show T800 lists (6,16) south then (14,9) east; e588 (11,3) lists (7,6) west first; 54a7 T213 (10,0) lists (14,9) east first.
- 2026-10-16: merged main 154d905e (disproved-beliefs-v1, same-plan-breaker-v1, Route 103 fixture windows). Registry tails: main's two switches first, then navigation-truth-v1, navigation-refusal-reasons-v2; position tests re-bumped by 2 over main's (identical-edit hunks merged silently at main's value and were corrected from the failing assertions); switchboard row count 74. Gates on the merge: agent 1652, viewer 904, pytest 2270 passed (main's fixture-window fix cleared the 34 inherited failures); lint, build, verify-vendor OK; coverage agent 99.16/94.27/98.27, viewer 97.62/91.10/93.62, python 97.33/93.17/100 (lines/branches/functions).
- 2026-10-16: merged main 36aad5b1 (levelup-box-v1, timeline text). Same resolution: main's switches first, then navigation-truth-v1 and navigation-refusal-reasons-v2; position tests re-bumped from failing assertions; switchboard rows 75; guidance count 35. Gates: agent 1662, viewer 906, pytest 2297 passed; lint, build, verify-vendor, pages-check OK; coverage agent 99.17/94.30/98.27, viewer 97.62/91.10/93.63, python 97.36/93.22/100.
- 2026-10-16: merged main 8c98cb7c (viewer hide-live-replay-controls, worklog archive), clean merge. Gates: agent 1662, viewer 906, pytest 2297 passed; lint, build OK; coverage unchanged within 0.01.
- 2026-10-16: merged main be428cdb (briefing-exits-v1, untaken-exits-v1, people-ledger-v1). Registry reapplied after main's last switch (scripted: take main's side, re-add the two ids, re-bump position tests from failing assertions). Gates: agent 1738, viewer 914, pytest 2299 passed; lint, build, verify-vendor, pages-check OK; coverage agent 99.13/94.40/98.39, viewer 97.62/91.12/93.63, python 97.36/93.22/100.

- 2026-10-16: merged main 6603d64f (trainer-heal-guidance-v1, low-hp-trainer-warning-v1, briefing-battle-outcomes-v1, blocked-exit-fact-v1, battle-loss-recap-v1, pushback-loop-detection-v1, pushback-press-result-v1, battle-observation-loop-v1). Registry reapplied after main's last switch (battle-observation-loop-v1); position tests re-bumped from failing assertions (pushback slice -3,-1 to -5,-3 by hand). Overlap: main added `pushback` and `battles` as LoopDetector/attachLoopGuard args 7-8, so `messageTruth` moved to arg 9 (live.ts, decision-probe.ts, harness.ts, and the two direct LoopDetector constructions in navigation-truth.test.ts, one of which had silently become a pushback flag); the reopened-message sentence composes with main's PUSHBACK_MESSAGE branch (pushback first, unchanged). dialogue-auto-advance.ts merged cleanly: main changed navigationAfter/finish/summary/press (pushback-press-result-v1), this branch only `Pages`; navigation.ts unchanged on main. live-world-features.test.ts keeps main's pushBack/battleLoop branches and adds the noMessage branch. Gates (ROM set): agent 1907, viewer 932, pytest 2313 passed; lint, build, verify-vendor, pages-check, experiments-check (75) OK; coverage agent 99.15/94.55/98.31, viewer 97.63/91.09/93.68, python 97.37/93.23/100 (lines/branches/functions).

- 2026-10-16: merged main 66866eb8 (transition-coherence-v1, battle-start journal). Registry reapplied after transition-coherence-v1; position tests re-bumped (pushback slice to -6,-4 by hand). Removed a duplicate FEATURE_EXPLAINERS pair for the two switches in panels.ts left by the 6603d64f merge (the auto-merged tail entries plus the reapplied ones; same values, so behavior was unchanged). No overlap with navigation.ts, dialogue-auto-advance.ts or loop-detection.ts. Gates (ROM set): agent 1913, viewer 933, pytest 2372 passed; lint, build, verify-vendor, pages-check, experiments-check OK; coverage agent 99.15/94.57/98.31, viewer 97.63/91.09/93.68, python 97.42/93.35/100 (lines/branches/functions).

- 2026-10-16: merged main 53461a49 (Route 103 review notes: milestones.ts order, route103 feature copy), clean. Gates: agent 1914, viewer 933, pytest 2372 passed (one run had a timing failure in env/tests/env/test_warp_arrival_settle.py, env untouched by this branch; passed 5/5 reruns and the full coverage rerun); lint, build, verify-vendor, experiments-check OK; coverage agent 99.15/94.57/98.31, viewer 97.63/91.09/93.68, python 97.42/93.35/100.

- 2026-10-16: merged main 259aeb08 (viewer phone header Q, close-the-loop skill), clean. Gates: agent 1918, viewer 951, pytest 2372 passed; lint, build, verify-vendor, pages-check, experiments-check OK; coverage agent 99.16/94.51/98.32, viewer 97.66/91.14/93.77, python 97.42/93.35/100.

## Principles Adherence (rounds 1-2; round 2 packet base main be428cdb)

| ID | Score | Evidence |
|---|---|---|
| PB1 game grades the run | N/A | No milestone, grading or split code touched; messages only. |
| PB2 failed runs count | N/A | No run accounting touched. |
| PB3 one run is an anecdote | PASS | No improvement is claimed; both switches default OFF and are registered as PENDING experiments (8 trials per arm). |
| PB4 declare every advantage | PASS | Both behaviors are named switches recorded in `harness_features` (appended last to `playHarnessFeatures`), OFF reproduces today's bytes (OFF assertions on every fixture), vendor untouched (`just verify-vendor`). Trigger facts are only used with `coordinate-script-conditions-v1`, the switch that already tells the model about triggers. |
| PB5 change one thing | PASS | Correctness fixes grouped under `navigation-truth-v1` (operator: one switch for the group, ON in both arms); the behavior change has its own switch `navigation-refusal-reasons-v2` (bundle arm only). Hypotheses in `experiments/navigation-truth.json` and `experiments/navigation-refusal-reasons-v2.json`. |
| PB6 long runs | PASS | No new context growth; refusal text is bounded by the 15x15 window (at most 4 edge tiles listed). No truncation. |
| PB7 event log | PASS | Page and speaker changes are recorded in the existing `dialogue_auto_advance` pages; navigation status stays in `details.navigation.status`; no new event types. |
| PB8 model misbehavior | N/A | No tool schema or retry policy changed. |
| PB9 rock-solid-or-ask | PASS | Ambiguities resolved from game source (coord trigger elevation/variable rules, render states) and recorded states, not defaults; unknown trigger values stay passable (today's behavior). |
| PB10 no carve-outs | PASS | No skipped tests, excludes or threshold changes; coverage agent 99.16/94.27/98.27, viewer 97.62/91.10/93.62, python 97.33/93.17/100. |
| PB11 pinned dependency | N/A | No new dependency or integration call. |
| PB12 macOS privacy | PASS | ROM only via `POKEBENCH_ROM` (.env); no protected paths read. |
| PB13 close the loop | PASS | RED 73a12a86, GREEN 16baa877, merges 5234e6b6 and the main 36aad5b1 merge, gates recorded; review loop below. |

Zero FAIL rows.

- 2026-10-16: explainer caption corrected (two synthetic rows named); explainers copied to `runs/mockups/<id>/` in the main checkout and checked 200 at 127.0.0.1:8791; figure rendering checked in the browser pane.

## Surprises

- pytest on main 1f4ac74e had 34 failures (fixed on main by 2cb0e316 before this branch's merge): `read_route103_rival` (route103-rival-splits merge) reads 0x0203A1CA, which older recorded raw-RAM fixtures do not contain. Not touched here (Python env belongs to other branches); reported to the thread owner.
- The worktree needed `git submodule update --init` (from the main checkout's submodule) before pytest; vendor stays at the pin.

## Multi-Model Review Log

- Round 1 (packet base 45db59c1, head 6dd2ab29, diff sha256 424ec9dd18c883d547f5b6cf3bba7ea875bec90f5b76f50a48040537a9142ffa). Claude (claude -p, default login; ~/.claude-review is logged out): BLOCKING. Grok (Cursor cursor-grok-4.5-high): BLOCKING. GPT: Cursor gpt-5.6-sol-xhigh failed (ActionRequiredError usage limit, resets 10/17); Codex default model gpt-6.1-sol rejected for ChatGPT accounts; switched (standing authorization) to isolated `codex exec -m gpt-5.6-sol -c model_reasoning_effort="xhigh" --ephemeral --sandbox read-only`: BLOCKING.
  - All three: v2 refusal fired for non-standable goals when refusal-reasons-v1 is off (the pending experiment's arm). Accepted: windowReason now requires a walkable goal with no person, object or warp.
  - Codex: counter talk bypassed the no-script rule (accepted: counterHint skips scriptless people when targets are known); a named speaker was carried with nothing faced (accepted: dropped, matches boundary item 7); the reopened sentence ignored navigate_to ending on a ready message (accepted: reopened = the call's state has a ready message or a conversation restarted); decision-probe wiring untested (accepted: synthetic recorded run through decisionContext, ON/OFF); Harness Config click-through unproven (done: isolated worktree viewer on 127.0.0.1:8797 with a synthetic run; both READ EXPLAINER links opened the right pages; viewer stopped).
  - Hardening taken in the same batch: e588 assertion exact; 54a7 T213 pinned; explainer wiring caption corrected.
  - RED 07fb5bec (4 of 36 fail). GREEN gates: agent 1667, viewer 906, pytest 2297; lint, build, verify-vendor OK; coverage agent 99.17/94.35/98.28, viewer 97.62/91.10/93.63, python 97.36/93.22/100. Feature copy and both explainers updated for the new rules.
  - Deletion receipts r1-v2-standable, r1-counter, r1-reopen-nav, r1-speaker-drop, r1-probe-wiring: each red once, green restored.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
- Round 2 (packet base be428cdb, head 7dffe327, diff sha256 8704a938...; same harnesses: claude -p default login, Cursor cursor-grok-4.5-high, isolated Codex gpt-5.6-sol xhigh because Cursor GPT is over its usage limit). All three BLOCKING, new findings:
  - Claude: "every route crosses (x,y)" named one tile though sibling trigger tiles also block (true: blocking only (6,15) leaves a route via (6,16)). Accepted: the text says every route crosses a matching trigger and names the first one on the unavoided route; a test proves the all-triggers plan is null and the single-tile plan is not.
  - Grok: a counter as the target still offered talk to a scriptless person behind it. Accepted: with targets known, only a scripted person behind a counter counts.
  - Codex: (1) speaker identity used the tile when only interaction targets identify the object; accepted: keyed by map-local id and map. (2) the cap text said "call again" before the final observation; accepted: built from the returned observation, and says the field is no longer free otherwise. (3) the v2 explainer claimed trigger exclusion unconditionally; accepted: wording is conditional on navigation-truth-v1 + coordinate-script-conditions-v1. (4) experiments pinned the RED commit; accepted: provisional pin 4a582a5f (contains both switches and entries). (5) the navigation-truth hypothesis named dialogue effects its arms cannot show (auto-advance off); accepted: hypothesis narrowed, notes say where the dialogue parts are tested and act.
  - RED eb0d089b (9 of 38 fail). GREEN gates: agent 1740, viewer 914, pytest 2299; lint, build, verify-vendor, pages-check OK; coverage agent 99.13/94.39/98.39, viewer 97.62/91.12/93.63, python 97.36/93.22/100. Main has moved past be428cdb since; not re-merged while round 3 waits on the operator.
  - Deletion receipts r2-counter-goal, r2-target-id, r2-cap-final: each red once, green restored.
  - Per the multi-model-review contract, two complete rounds produced new blockers, so round 3 needs the operator's scope confirmation; stopped here and reported to the thread owner.
- Operator decision (the operator, 1:11 PM New York time 2026-10-16, "yes to all", relayed by the thread owner): run review round 3 with the same scope (items 1-7 under navigation-truth-v1, intended ON in both arms; item 8 under navigation-refusal-reasons-v2, bundle arm only), merge main first, and continue further rounds as needed for this scope; stop and report if a finding needs a new scope decision.
- Round 3 (packet base main 6603d64f, head 907764a6, diff sha256 bcd75c979417430f6b0db78b13a8c986e6d7cf0c773dec92ee23c22e9385f5bb; claude -p default login, Cursor cursor-grok-4.5-high, isolated Codex gpt-5.6-sol xhigh). Grok: LGTM. Claude: BLOCKING. Codex: BLOCKING.
  - Claude: the navigation-truth hypothesis still names parts its arms cannot show (talk offer, stand tiles, gated nearer tile and counter talk need navigation-refusal-reasons-v1 / counter-talk-v1, both off in the incumbent). Accepted: hypothesis and notes narrowed (text only).
  - Codex (1): "it has no script" claimed for a scriptless object on a tile with another A target (hidden item / background event; pokeemerald falls through to the background script). Accepted: the claim needs no other A target there; otherwise today's offer.
  - Codex (2): v2 said "any route leaves" the window when only the configured terrain switches (ledges / one-way tiles / floor off) miss a route inside it. Accepted: v2 speaks only when the planner with ledge hops, one-way tiles and walkable floor also finds no route inside the window.
  - RED: 2 new tests in navigation-truth.test.ts (2 of 40 fail).
  - GREEN: navigation.ts (no-script claim only with no other A target on the tile; windowReason first plans with ledges, one-way tiles and floor on and stays silent if that finds a route), features.ts copy for both switches, both explainers (rule rows; local copies refreshed in runs/mockups and checked 200 at 127.0.0.1:8791), experiments/navigation-truth.json hypothesis and notes narrowed. Gates: agent 1909, viewer 932, pytest 2313 passed; lint, build, verify-vendor, pages-check, experiments-check OK; coverage agent 99.15/94.55/98.31, viewer 97.63/91.09/93.68, python 97.37/93.23/100. Guard receipts: both new tests failed on RED b94fe806 against the unchanged code and pass on GREEN.
- Round 4 (packet base main 53461a49, head e3267f78, diff sha256 42a421ae5e7a9884fc180eb3b81984c54c891316bc960eec206a143ed7e12542; same three harnesses). Claude: LGTM. Grok: LGTM. Codex: BLOCKING, three new findings, all accepted (in scope: items 1, 2 and 8 must be true to the game):
  - (1) stacked objects: talk offers matched interaction targets by (x,y) only; the game finds the object at the player's elevation (ObjectEventDoesElevationMatch; Route 120 Kecleon at (12,16), scripted at 4, scriptless shadow at 3). Accepted: under truth a stand tile is offered only when its arrival elevation matches a scripted object there (elevation 0 matches any); counter talk the same.
  - (2) a matching trigger on a multi-level (15) stand tile was checked against the start elevation, not the one the route brings. Accepted: stand tiles, the gated nearer tile and v2 edge tiles use the walker's elevation at the end of the planned path.
  - (3) v2's permissive confirmation kept the legacy elevation rule. Accepted: it plans with the game's elevation rule too.
  - RED: 4 new tests in navigation-truth.test.ts (4 of 44 fail; their OFF assertions pass).
  - GREEN: navigation.ts (elevationsMatch per ObjectEventDoesElevationMatch; `walked()` replays a planned path for the first crossed trigger and the arrival elevation, replacing routeTrigger/standingTrigger; talk offers and counter talk keep only stand tiles whose arrival elevation matches a scripted object there, otherwise an elevation reason; triggers on stand, gated-nearer and v2 edge tiles checked at arrival elevation; v2 confirmation plans with the game elevation rule), feature copy for both switches, both explainers (local copies refreshed, 200). Gates: agent 1918, viewer 933, pytest 2372 passed; lint, build, verify-vendor, pages-check, experiments-check OK; coverage agent 99.16/94.50/98.32, viewer 97.63/91.09/93.68, python 97.42/93.35/100. Guard receipts: the 4 new tests failed on RED df6f6000 against the unchanged code (OFF assertions passing) and pass on GREEN.
- Round 5 (packet base main 259aeb08, head 30051524, diff sha256 6dec08c7857dc22c3eb8c17599b3401e88553c8ed7b2d360c1530a5b976d5bc9; same three harnesses). All three BLOCKING; findings narrow and accepted (completing round-4 fixes, same scope):
  - Grok + Codex: counterHint still pre-filtered scripted counter objects on the start elevation, so a 3 -> 0 -> 4 route to an elevation-4 stand lost the offer, and a start-matching but arrival-mismatching clerk still got the "press A ... behind it" text. Accepted: under truth only the arrival elevation at the named stand counts, and the counter fallback text needs a talk offer.
  - Claude: v2's permissive confirmation kept the matching triggers, so a route across a trigger that only walkable floor finds was reported as leaving the window. Accepted: the confirmation plans without triggers.
  - RED: 2 new tests (2 of 46 fail; OFF/CONTROL assertions pass).
  - GREEN: counterHint (no start-elevation prefilter; under truth a scripted person counts only at the stand's arrival elevation and the fallback text needs no targets), windowReason confirmation plans with `triggers:[]`; hardening: the elevation reason lists every scripted elevation on the tile; routeTrigger wrapper inlined. Copy and both explainers updated (local copies refreshed, 200). Gates: agent 1920, viewer 951, pytest 2372 passed; lint, build, verify-vendor, pages-check, experiments-check OK; coverage agent 99.16/94.53/98.32, viewer 97.66/91.14/93.77, python 97.42/93.35/100. Guard receipts: both new tests failed on RED 17884682 and pass on GREEN.
