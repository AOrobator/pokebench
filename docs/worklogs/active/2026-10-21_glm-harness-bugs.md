# GLM-run harness bugs: story goal for the default name, battle/heal stall briefings, cut-off replies, trainer sight for navigate_to_target, auto-talk on beaten trainers, Littleroot north stride

## Problem Statement

The run analysis of the four GLM-5.3-Flash trials (`glm53-flash-2h`, pin 8c0cf282; report `runs/reports/run-analysis/2026-10-21_glm53-flash-2h/index.html`, packet `runs/reviews/2026-10-21-run-analysis-glm53/`) found these harness bugs. The operator, 2026-10-21 11:32 AM New York: "we should make sure to address all of the harness bugs and before you start, you should check main and the existing branches and work trees to make sure that your work is not superseded."

1. **Wrong Story goal for the default player name (bundle, `harness-trust-v1` + story destinations).** `2026-10-21T01-16-23_glm53-mac_e9ee` (player BRENDAN) showed `Story goal: "Look! It's PETALBURG GYM! …" (MOM, turn 33)` in 24 tool results (seq 1630–3812) after Mom said "He lives right next door". Suspected cause: the `LIVES` pronoun resolver in `story-destinations.ts` needs exactly one named candidate, and BRENDAN is the player's name and also in `STORY_CHARACTERS`. `…_acfa` (player ASH) resolved the same pages to Birch's house (seq 1536). Cost ≈10 min.
2. **False "not moving forward" drought briefings during battles and harness-ordered heals (both arms).** 18 fires: e9ee s8331/s10445/s10741/s11218 (Route 102 trainer battles and a sight script), bbff s5693/s6146/s7768/s8785, ad34 s7984/s9115/s9424/s10846/s11612, acfa s4962/s5790/s6035/s7262 (during the Pokémon Center trip the heal warning ordered). In control the clock also skips measurement-only milestones because `story-progress-clock-v1` is off.
3. **Misleading feedback after a reply cut off at max_tokens (both arms).** On `stopReason === "length"` with no tool call the model gets `NUDGE` ("Keep playing: call observe or press…") and never learns its reply was cut off, so it restarts the same hand-parse of the ASCII map: ad34 three in a row (s13818–s14998), e9ee s9146/s9738/s10341, bbff s4699/s5305/s13642, acfa s4461. 11 cut-offs, ≈31 min.
4. **`trainer-sight-check-v1` only covers `navigate_to`.** e9ee walked into Calvin, Rick and Allen via `navigate_to_target` WEST (s8193, s10444, s10997); acfa again (s9108, s9470, s9998). ≈35 min of battles over two runs.
5. **`auto-talk-v1` walked to a trainer already beaten** (e9ee s10359).
6. **`navigate_to_target` NORTH stops at (10,10) in Littleroot** with "corridor changed or unsafe" and oscillates east–west (e9ee s2017, s7116; acfa s3014); `navigate_to` works from the same tile. Cause not yet known (row-9 coordinate triggers suspected). Related: `navigate_to` routed around the running-shoes trigger when it was the next story event (ad34 s12351).

### Superseded-work check (2026-10-21 11:40 AM New York)

Read main (fe4ed9c70), all 126 worktrees and every branch with commits since 2026-10-20:
- `codex/bounded-heal-cycle` (Codex, 12 unmerged commits, landing queued): adds `progress-aware-cycles-v1`, which counts measurement-only milestones as progress and retires **map-cycle** history across gate-directed heal round trips. It covers the control-arm skipped-milestone half of bug 2 and the map-cycle part of acfa's heal trip. It does **not** gate **milestone-drought** briefings during a battle or an ordered heal. Bug 2 is built on top of it after it lands, in `stall-briefing.ts` only where it does not already act.
- `archive/claude/supervisor-truth-fixes`, `archive/claude/loop-guard-gaps`: archived, older than main's story-destinations and stall-briefing; nothing to reuse.
- `codex/navigation-recovery` (9 unmerged): navigation-failure recovery feedback; does not touch the stride-stop cause. Re-checked before M6.
- `codex/strategy-support` touches `auto-talk.ts` only for the strategy prompt; no overlap with bug 5.
- No branch touches `trainer-sight.ts`, the `length` stop handling in `harness.ts`, or the `LIVES` resolver.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, agent-observability, pokebench-game-state (bugs 1 and 6), feature-explainer, experiment-queue (pending entries), close-the-loop, multi-model-review (cloud lanes only: Claude, Grok, GPT/Codex).

## Architecture

Each fix ships behind a new registered switch whose OFF state is today's behavior, added to the bundle (`experiments/fixed/*` bundle lists) only with the operator's OK.

- **M1 `story-goal-player-name-v1`** (`story-destinations.ts`): when resolving "He/She lives…", the player's own name (from RAM, `player.name`) is not a candidate. Replay test from e9ee seq 1628 under BRENDAN and acfa seq 1536 under ASH.
- **M2 `drought-battle-heal-hold-v1`** (`stall-briefing.ts`): a milestone-drought briefing is held (recorded as a diagnostic with its text, like `positive-supervisor-v1` retirements) while a battle is on screen, while a trainer's sight script owns the field, and while the player is on an active heal trip the harness ordered (from the heal-first / story-battle heal records until a heal is observed or the trip is abandoned). The drought clock restarts when the battle or trip ends. Built after `progress-aware-cycles-v1` lands.
- **M3 `cut-off-reply-feedback-v1`** (`harness.ts`): after a `length` stop with no tool call, the next user turn says the reply was cut off at the max_tokens limit before any tool call, so nothing happened in the game, and to make one tool call now (naming `navigate_to_target`/`navigate_to` for movement instead of counting map cells). No text sent to the model is clipped (memory: no model-facing truncation). The `failureLimit` count is unchanged.
- **M4 `trainer-sight-check-v2`** (`trainer-sight.ts` + the `navigate_to_target` path): the same unbeaten-trainer line-of-sight check and confirm argument for routes planned by `navigate_to_target`.
- **M5 `auto-talk-v2`** (`auto-talk.ts`): beaten trainers (heal_before_trainers `defeated`) are not auto-talk targets.
- **M6 investigation then fix**: re-parse RAM at e9ee s7116 and acfa s3014 (VAR 0x4050, coordinate events on row 9) to find why the north stride is called unsafe; fix behind a switch only if it is a harness bug. Same for ad34 s12351 (trigger avoidance when the trigger is the next story event).

## Invariants

- INV-1: Every fix is OFF-equivalent: with its switch off, recorded-run replays produce byte-identical model input. Test: replay fixtures with the switch off match today's output.
- INV-2: No harness message states something the recorded state contradicts (PB truthfulness). Test: each RED test is built from the recorded seq that showed the false message.
- INV-3: No model-facing text is clipped. Test: M3 asserts the full prior context is kept.
- INV-4: Diagnostics for held briefings reach Activity History and the raw-event inspector, never the timeline (timeline closed). Test: viewer label test, no timeline lane added.

## Security Review

No new subprocesses, network calls or file paths. RAM reads go through `pokebench_env.raw_ram.load_raw_ram`. Argv-only rules unchanged.

## Milestones

**M1 — Story goal ignores the player's own name**
- [x] Write tests: e9ee seq 1628 pages under BRENDAN resolve "He lives right next door" to Birch's house; ASH unchanged; switch off keeps "could be BRENDAN or PROF. BIRCH"; harness-trust Story goal and the withStoryDestinations factory follow the switch (`story-goal-player-name.test.ts`)
- [x] Registry for all four agent-side switches (story-goal-player-name-v1, cut-off-reply-feedback-v1, trainer-sight-check-v2, auto-talk-v2), default off; position assertions in older tests shifted by 4
- [x] COMMIT (RED): `test: story goal ignores the player's own name; registry for the four GLM-run switches (RED)` — 3 failing (ON behavior, Story goal line, factory), 4 passing
- [x] Implement: `StoryDestinations(…, playerName)` drops the readout's player name from the "He/She lives" candidates at resolve time; wired in `withStoryDestinations` and, through `TrustOptions.playerName`, in `play-wiring.ts` for the harness-trust Story goal line
- [x] Guard check: removing the play-wiring option turned "playGameTools passes the switch…" red; removing the withStoryDestinations argument turned "withStoryDestinations reads the switch…" red; both restored
- [x] Gates: lint clean (tsc, eslint, ruff, mypy); build; coverage agent 97.33/93.06/97.8/99.24 (stmts/branches/funcs/lines), viewer 95.41/91.33/94.33/97.9, Python gate ≥90; agent 3330 tests, viewer 1613, Python 3691. (The worktree's env venv needed the main checkout's mgba binding symlinked; test_view failed without it.)
- [x] COMMIT (GREEN): `feat: story-goal-player-name-v1 leaves the player's own name out of He/She lives (default off)` (bc5565aaf)
- [x] Multi-model review loop until clean: round 1 on 331e10b3..32f1a1be (packet SHA-256 5dd44234…) — Grok (cursor-grok-4.5-high) LGTM, GPT (codex gpt-6-astra) LGTM, Claude (subagent; Cursor Opus at its usage limit, `claude -p` OAuth expired; memory claude-review-lane) LGTM. Non-blocking: keep the three behaviorless switches out of experiments until M3–M5 land (they are); the ASH case reuses e9ee's pages with the name swapped, not acfa's recording.

**M2 — Drought briefings held during battles and ordered heals** (`codex/bounded-heal-cycle` landed and was merged in; its progress-aware-cycles-v1 covers the control arm's skipped measurement-only milestones and map-cycle history on gate heal trips, not drought briefings)
- [x] Switch `drought-battle-heal-hold-v1` (guard, needs stall-briefing-v1, default off), registered sixth
- [x] Write tests (`drought-battle-heal-hold.test.ts`, recorded heal warnings from acfa seq 3857/4811/6838 and run 8892 seq 12979 in `test-support/drought-hold-warnings.json`): OFF fires in battle; ON holds in battle, records a diagnostic, restarts the clock when the battle ends; holds during a heal trip until full HP; a trip that never reaches full HP stops holding after 48 tool results; the other warnings open a trip; an ordinary drought still fires; the production stallBriefing records a would_warn diagnostic only with the switch; registry
- [x] COMMIT (RED): `test: drought briefings held in battles and harness-ordered heal trips (RED)` — 5 failing (cea3390b)
- [x] Implement (`stall-briefing.ts`): with the switch on, a due drought briefing is held while a battle is on screen, while an unbeaten trainer's sight script holds the field (field controls locked, trainer_opponent set, not defeated, battle not yet active; added for e9ee seq 10445, RICK), or while a heal trip is open (from heal_first_line / story_battle_warning / heal_before_trainers_warning / gym_heal_warning / refused story_battle_heal_gate until full party HP, a battle, or 48 tool results). Each held level is recorded once through a new constructor callback; `play-wiring.ts` records it as a loop_guard milestone_drought would_warn diagnostic (Activity History, no timeline). The drought clock restarts when the hold ends.
- [x] Replay of the four GLM runs through the production `stallBriefing` (scratch test, wall clock from event times): OFF reproduces the recorded drought fires exactly (acfa 4961,5789,6034,7261,8004,9827,10965; e9ee 2158,7012,8330,10444,10740,11217); ON leaves acfa 8004 only and e9ee 2158, 7012 (the true briefings that led to progress), holding the battle/heal/sight-script ones. The control runs' other false fires (bbff 5692, 8784) come from measurement-only milestones the control clock skips; progress-aware-cycles-v1 / story-progress-clock-v1 own that.
- [x] Guard check: dropping the play-wiring callback turned the factory test red; restored
- [x] Gates: lint clean; coverage agent 97.27/93.12/97.8/99.2, viewer 95.42/91.33/94.33/97.9, Python 3708 passed ≥90; agent 3377 tests
- [x] COMMIT (GREEN): `feat: drought-battle-heal-hold-v1 holds drought briefings in battles, trainer sight scripts and harness-ordered heal trips (default off)` (b23f1ece)
- [ ] Multi-model review loop until clean: round 1 on cb757550..b23f1ece — Claude LGTM (noted every short battle reset the clock); Grok CHANGES REQUESTED (no test for the refused-gate opener); GPT CHANGES REQUESTED: (1) the held diagnostic drew a TIMELINE loop mark (viewer model.ts pushes every loop_guard but same_target_no_progress), (2) the hold-end reset changed positive-supervisor-v1's retired schedule, (3) the 48-result limit expired on result 49. Fixes (tests red first: 3 agent, 1 viewer): the viewer keeps "Not sent (drought-battle-heal-hold-v1): " messages off the timeline (Activity History and inspector unchanged); a hold restarts the clock only when it kept a due briefing back, or when the heal the warning asked for is done (full HP), so short battles change nothing and positive-supervisor's schedule is unchanged; the trip ends at the 48th result; tests for the refused/confirmed gate, the 48 endpoint, the no-reset short battle and positive-supervisor parity. Replay after the fix: ON sends acfa 6367 (a drought due right after a wild battle ended), 8004; e9ee 2158, 7012; held the battle, sight-script and heal ones. Agent 3381, viewer 1617 tests; agent coverage 97.27/93.13/97.8/99.2. Round 2 on b23f1ece..2d7458ea: Claude and GPT CHANGES REQUESTED, same finding — the finished-heal reset still moved positive-supervisor-v1's retired schedule. Fix: that reset is skipped with positive-supervisor-v1 on (nothing is held there); a milestone also clears the held level; registry copy updated to the narrowed restart rule; heal-path positive-supervisor parity test (red before the fix, green after). Agent 3381 tests. COMMIT: `fix: a finished heal leaves positive-supervisor's retired drought schedule alone (review round 2)` (e620c0da). Round 3 on 2d7458ea..e620c0da: Claude LGTM (explainer caption updated to carry the positive-supervisor exception).

**M3 — Cut-off reply feedback**
- [x] Write tests (`cut-off-reply.test.ts`): notice text per tool set; Governor sends it after a length stop with no tool call, NUDGE otherwise, OFF unchanged, failure count unchanged, text-only supervisor note still wins; decision probes rebuild the same follow-up (`followUpText`); live.ts and decision-probe.ts wiring
- [x] COMMIT (RED): `test: cut-off replies are named in the next message (RED)` (4b091e2c)
- [x] Implement: `cut-off-reply.ts` builds the notice from `playTools(features)` (names only the walking tools the run has); `Governor` sends `deps.cutOffNotice` instead of NUDGE/reminder after a length stop with no tool call (a due text-only note still wins; failure counting unchanged); `live.ts` passes it; `decision-probe.ts` rebuilds the same follow-up via `followUpText` with the probed switches and the recorded max tokens
- [x] Gates: lint clean; coverage agent 97.33/93.07/97.8/99.24, viewer 95.42/91.33/94.33/97.9, Python 3691 passed ≥90; agent 3338 tests
- [x] Guard check: dropping `cutOffNotice` from the Governor deps and the `cutOff` argument from decision-probe turned the wiring tests red; restored
- [x] COMMIT (GREEN): `feat: cut-off-reply-feedback-v1 tells the model its reply hit the output limit before any tool call (default off)` (f2f79d77)
- [ ] Multi-model review loop until clean: round 1 on 32f1a1be..c37eeaf9 — Claude (subagent) LGTM, Grok LGTM, GPT (codex) CHANGES REQUESTED: the wiring tests only matched source text. Fix: `decision-probe-live.test.ts` now drives live.ts end to end with a scripted reply that stops at max_tokens, asserts the next request carries the notice (ON) or NUDGE (OFF), and that probes rebuild every turn identically and a flipped switch changes exactly that follow-up. Guard check: reversing live.ts's conditional spread, and passing undefined to followUpText, each turned it red; restored. Round 2 (GPT): CHANGES REQUESTED only because the packet c37eeaf9..f9625228 spanned M4's intentionally failing RED commit 2215d1b7; round 3 on the fix commit alone (2215d1b7..f9625228): GPT LGTM. M3 review closed: Claude, Grok, GPT LGTM. Lint later flagged an unnecessary assertion in the new decision-probe-live test; fixed with M4's green commit.

**M4 — Trainer sight for navigate_to_target**
- [x] Write tests (`trainer-sight-check-v2.test.ts`, b300 gym state and sight reply as the stand-in game): OFF walks without asking; ON refuses a seen route with navigate_to_target wording, records it, confirm_trainer_sight walks; the trainer the call goes to talk to is excluded from the sightings; confirm argument and description sentence only with the switch; playGameTools wiring
- [x] COMMIT (RED): `test: navigate_to_target routes get the trainer sight check (RED)` — 5 failing, 1 passing (OFF) (2215d1b7)
- [x] Implement: `CheckedNavigationOptions.sightCheck {confirm, exclude}`; navigate_to's checked walk runs trainer-sight-check-v1's `checkSight` once when navigate_to_target asks (the target object's own sight excluded; the story-battle heal gate keeps its own navigate_to_target check); `sightText` names the tool and how to call it again; navigate_to_target gets `confirm_trainer_sight` and one description sentence only with trainer-sight-check-v1 and v2 on, and returns at once with the sight status. Tests reworked: b300's gym has no reachable trainer approach, so the exclusion is tested at the navigation layer (exclude 3) and the request shape on a small field (object 2, warp). semantic-navigation-v2.test's pending ALL_ON leaves the new switch off (registry position −1)
- [x] Guard check: dropping the semantic `sightCheck` spread, and disabling the navigation check, each turned 4 tests red; restored
- [x] Gates: lint clean; coverage agent 97.34/93.1/97.8/99.24, viewer 95.42/91.33/94.33/97.9, Python 3691 passed ≥90; agent 3347 tests
- [x] COMMIT (GREEN): `feat: trainer-sight-check-v2 checks navigate_to_target routes against unbeaten trainers' sight (default off)` (f31463bf)
- [x] Multi-model review loop until clean: round 1 on c37eeaf9..f31463bf (SHA-256 1375d2a1…) — Claude (subagent) LGTM, Grok LGTM, GPT (codex) LGTM. Non-blocking: later segment walks are not checked (by contract; watch in long runs); the event does not record the excluded target id.

**M5 — Auto-talk skips beaten trainers**
- [x] Write tests (`auto-talk-v2.test.ts`): a Route 102 field with a beaten YOUNGSTER next to the player and a BOY_1 farther; auto-talk-v1 alone talks to the beaten trainer (as e9ee s10359), v2 skips to BOY_1; an unbeaten trainer stays excluded either way
- [x] COMMIT (RED): `test: auto-talk skips beaten trainers (RED)` — 1 failing (ON), 2 passing (69508a8d)
- [x] Implement: `AutoTalk.candidates` leaves out trainers `heal_before_trainers` shows as defeated when auto-talk-v2 is on (read from the FeatureSet the production `autoTalkContext` factory receives)
- [x] Guard check: dropping the beaten filter turned the ON test red; restored
- [x] Gates: lint clean; coverage agent 97.34/93.09/97.8/99.24, viewer 95.42/91.33/94.33/97.9, Python 3691 passed ≥90; agent 3350 tests
- [x] COMMIT (GREEN): `feat: auto-talk-v2 leaves trainers the readout shows as defeated out of auto-talk (default off)` (acc661b8)
- [x] Multi-model review loop until clean: round 1 on f31463bf..acc661b8 (SHA-256 f1bf44d5…) — Claude (subagent), Grok, GPT (codex) LGTM. Non-blocking: a beaten trainer who is also an untalked story character stays a story candidate (by contract).

**M6 — Littleroot north stride stop and story-trigger avoidance**
- [x] RAM re-parse at e9ee s7116, acfa s3014, ad34 s12351; verdict recorded in the Session Log (stride stop: harness bug, the 7-tile trigger window; ad34 trigger avoidance: by design, not a bug)
- [x] Fix design: `map-wide-triggers-v1` (server observation switch, needs coordinate-script-conditions-v1, default off): `read_world_context(map_wide_triggers=True)` keeps every coordinate trigger on the map in the state the planner reads; `WorldContext.text()` still lists only triggers within 7 tiles of the player, so the readout text is unchanged; the state JSON gains the far triggers. planStride and the trigger-avoiding planner already read `world_context.triggers`, so the stride ends one tile short of a far trigger and the avoided set stops changing as the player moves.
- [x] Write tests: `env/tests/env/test_map_wide_triggers.py` (off keeps the window; on lists a far trigger in the state but not the text; nearby trigger text unchanged; bad pointers still dropped; read_game_state and rerender follow the switch; registered last and off by default) and `map-wide-triggers.test.ts` (registry, server env, planStride stops before a listed far trigger). Registry for the fifth switch; position and server-env assertions in older tests shifted by 1.
- [x] COMMIT (RED): `test: map-wide coordinate triggers for the planner (RED)` — Python 4 failing (182be4a4)
- [x] Implement: `read_world_context(map_wide_triggers=)` drops the 7-tile filter for triggers and records `trigger_origin`; `WorldContext.text()` lists only triggers within 7 tiles of it; `json()` leaves `trigger_origin` out; `read_game_state(map_wide_triggers_enabled=)`; rerender turns it on unless map-wide-triggers-v1 or coordinate-script-conditions-v1 is off. Golden OFF fixtures in test_readout_truth_fixes force the new switch off like the other later switches; test_rerender's flag list gains the new flag.
- [x] Guard check: removing the rerender wiring turned the production test red; restored
- [x] Gates: lint clean (tsc, eslint, ruff, ruff format, mypy); coverage agent 97.26/93.11/97.79/99.2, viewer 95.42/91.33/94.33/97.9, Python lines 97.29 branches 93.06 functions 100 (floor 90); agent 3367, viewer 1616, Python 3708 tests. (One agent and one viewer test timed out once under machine load and passed on rerun: serial-comparison hung-child, experiment-cli production host.)
- [x] COMMIT (GREEN): `feat: map-wide-triggers-v1 gives the planner every coordinate trigger on the map; the readout text keeps the nearby ones (default off)` (cb757550)
- [x] Multi-model review loop until clean: round 1 on b057dde1..cb757550 (SHA-256 53581062…) — Claude (subagent), Grok, GPT (codex) LGTM. Non-blocking: other TS readers of world_context.triggers also get far triggers when on (blocked-exit-fact has its own nearness gate); keep 7/8-tile boundary cases; share the radius constant.

**M7 — Explainers, pending experiments, bundle proposal**
- [x] One explainer per switch (feature-explainer): `docs/explainers/<id>.html` for all six, themed (`just pages-theme`), `just pages-check` clean, README entries, `FEATURE_EXPLAINERS` mappings in `packages/viewer/src/panels.ts` with panels/server tests (viewer 250 targeted tests pass). Written by a subagent; headless screenshots checked. The live READ EXPLAINER click waits until the viewer serves this code (after landing, `just viewer-main`).
- [x] Pending experiment entries `experiments/<id>.json` for all six (incumbent copied from progress-aware-cycles-v1 with the six new switches off; source = each switch's green commit, repin to the merge SHA after landing) and a readiness note in `docs/experiments/readiness.md`. `just experiments-check` reports no problem for them (its 150 starter-decision-salience ledger problems are pre-existing on main).
- [ ] Bundle-membership proposal for the operator
- [ ] ASK USER: add the switches to the next bundle

## Closing the Loop

Per milestone: tests, replay of the recorded seqs through production code, Activity History check for new diagnostics (agent-observability). After landing: `just viewer-main`, live check that a held briefing shows in Activity History.

## Session Log

- 2026-10-21 ~12:40 PM New York: `codex/bounded-heal-cycle` (progress-aware-cycles-v1) landed on main. Merged main into this branch: the registry churn conflicted in 64 files; resolved by taking main's versions and re-applying the four switches after progress-aware-cycles-v1 (scratch register2.py) plus the same mechanical position shifts; agent 3365, viewer 1616 tests pass, lint clean.
- M6 investigation (read-only subagent, RAM and code): (1) HARNESS BUG CONFIRMED — the readout lists coordinate triggers only within 7 tiles (`env/pokebench_env/world_context.py:376`), so `planStride` (navigation.ts) plans an 8-tile stride from (10,17) to (10,9) through a row-9 trigger, the Python stride executor (`strides.py` `_safe_next`) refuses at (10,10) once the trigger comes into range, and navigate_to_target ends the call (e9ee seq 1985→2017, 6979→7012; acfa seq 2981→3014); the same 7-tile window makes the trigger-avoidance plan flip east/west as the set changes (e9ee seq 7063→7116). (2) NOT A BUG — ad34 seq 12351: navigate_to avoids matching triggers by design (coordinate-script-conditions-v1) and said so, naming (11,2); the cost came from the model's next choices.

- 2026-10-21 11:40 AM New York: worklog drafted after the superseded-work check.
- 2026-10-21 11:37 AM New York: approved by the operator: "run it". Starting M1.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog
