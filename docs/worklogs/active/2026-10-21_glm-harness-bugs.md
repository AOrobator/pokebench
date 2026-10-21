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
- [ ] Multi-model review loop until clean: round 1 on 331e10b3..32f1a1be — Grok (cursor-grok-4.5-high) LGTM, GPT (codex gpt-6-astra) LGTM; Claude: Cursor Opus at its usage limit, `claude -p` OAuth expired, so a Claude subagent reviews (memory: claude-review-lane)

**M2 — Drought briefings held during battles and ordered heals** (after `codex/bounded-heal-cycle` lands)
- [ ] Write tests from e9ee s8331/s10741/s11218, bbff s7768, ad34 s10846, acfa s4962/s5790/s6035; a true drought outside those windows still fires
- [ ] COMMIT (RED) · Implement · Gates · COMMIT (GREEN) · Review

**M3 — Cut-off reply feedback**
- [x] Write tests (`cut-off-reply.test.ts`): notice text per tool set; Governor sends it after a length stop with no tool call, NUDGE otherwise, OFF unchanged, failure count unchanged, text-only supervisor note still wins; decision probes rebuild the same follow-up (`followUpText`); live.ts and decision-probe.ts wiring
- [x] COMMIT (RED): `test: cut-off replies are named in the next message (RED)` (4b091e2c)
- [x] Implement: `cut-off-reply.ts` builds the notice from `playTools(features)` (names only the walking tools the run has); `Governor` sends `deps.cutOffNotice` instead of NUDGE/reminder after a length stop with no tool call (a due text-only note still wins; failure counting unchanged); `live.ts` passes it; `decision-probe.ts` rebuilds the same follow-up via `followUpText` with the probed switches and the recorded max tokens
- [x] Gates: lint clean; coverage agent 97.33/93.07/97.8/99.24, viewer 95.42/91.33/94.33/97.9, Python 3691 passed ≥90; agent 3338 tests
- [x] Guard check: dropping `cutOffNotice` from the Governor deps and the `cutOff` argument from decision-probe turned the wiring tests red; restored
- [x] COMMIT (GREEN): `feat: cut-off-reply-feedback-v1 tells the model its reply hit the output limit before any tool call (default off)` (f2f79d77)
- [ ] Multi-model review loop until clean

**M4 — Trainer sight for navigate_to_target**
- [ ] Write tests from e9ee s8193/s10444/s10997 and acfa route 102 calls
- [ ] COMMIT (RED) · Implement · Gates · COMMIT (GREEN) · Review

**M5 — Auto-talk skips beaten trainers**
- [ ] Write test from e9ee s10359
- [ ] COMMIT (RED) · Implement · Gates · COMMIT (GREEN) · Review

**M6 — Littleroot north stride stop and story-trigger avoidance**
- [ ] RAM re-parse at e9ee s7116, acfa s3014, ad34 s12351; verdict recorded here
- [ ] If a harness bug: tests, switch, fix, gates, review; otherwise DEFERRED with the reason

**M7 — Explainers, pending experiments, bundle proposal**
- [ ] One explainer per switch (feature-explainer), pending experiment entries, a bundle-membership proposal for the operator
- [ ] ASK USER: add the switches to the next bundle

## Closing the Loop

Per milestone: tests, replay of the recorded seqs through production code, Activity History check for new diagnostics (agent-observability). After landing: `just viewer-main`, live check that a held briefing shows in Activity History.

## Session Log

- 2026-10-21 11:40 AM New York: worklog drafted after the superseded-work check.
- 2026-10-21 11:37 AM New York: approved by the operator: "run it". Starting M1.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive this worklog
