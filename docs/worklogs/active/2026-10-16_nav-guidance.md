# Navigation guidance: off-screen people on the map, navigate_to-first prompting

## Problem Statement

Cook run #2 (`runs/2026-10-16T02-23-17_qwen36-gpu1_sh02`, Qwen3.6-35B-A3B Q4_K_M on llama.cpp b10236) spent 540 turns on Route 103 (T415 to T955). Forensics: `runs/reports/cook2-navigation.html`.

- From T416 the readout said `MAY (on this map, out of view)` but gave no position. It gave her coordinates only once she entered the 15x15 window at T754. Until then the model pursued an east exit.
- At T888 the readout showed MAY at (10,3) and a route around the ledge row. The model planned by hand over the ASCII map, misread the ledges, pressed into them (T889 to T894) and walked into grass. It never gave navigate_to the destination. At T920 navigate_to stopped one tile short ("command limit") and the model finished by hand.
- On Route 103, 76 overworld turns walked by press against 56 by navigate_to.

Operator request (the operator, 2026-10-16 03:30 AM EDT): "if someone is on the map, they appear on it, even if they are not on screen"; get the model to use navigate_to "way more often"; research how Qwen 3.6 likes to be prompted and make the prompting updates. The false battle readout is fixed on `claude/battle-message-waiting` (another thread) and is out of scope here.

## Skills Loaded

feature-switch, feature-worklog, execute-worklog, feature-explainer, pokebench-game-state, pokebench-trace-forensics (evidence only), agent-observability (press-result reminder).

## Research: prompting Qwen3.6-35B-A3B (the served model, from run_start `model.id`)

- Official model card (huggingface.co/Qwen/Qwen3.6-35B-A3B): thinking on by default. `preserve_thinking` keeps earlier reasoning and "can improve decision consistency, cut redundant reasoning". The gateway already sends it (`gateway.ts` `thinkingFormat: "qwen-chat-template"`). Recommended thinking sampling: temperature 1.0, top_p 0.95, top_k 20, min_p 0, presence_penalty 1.5. The serving lane's `/props` shows presence_penalty 0.0 and min_p 0.05. No official system-prompt style guide.
- Qwen function-calling docs (qwen.readthedocs.io): use the native (Hermes-style) tool template, not ReAct stopwords. Give each function a description that says when to use it.
- The served chat template (`/props` on lane A) renders `# Tools` JSON first, then the system prompt, then the conversation. So the system prompt sits closer to the turn than the tool descriptions, and the tool list in the system prompt is the model's first summary of what it can do.
- Trace evidence: the system prompt's tool list names only observe and press. navigate_to appears in a later bullet and the usage rule is the last paragraph. "Think briefly" did not stop hand route planning (T887 to T893 thinking repeats a tile-by-tile search).

## Architecture

Three default-OFF switches (presence-penalty-v1 added by operator decision 03:41 AM EDT; see M3). OFF reproduces today byte for byte.

| Switch | Group | Side | Needs | ON |
|---|---|---|---|---|
| `offscreen-objects-v1` | observation | server (Python readout) | `live-object-sprites-v1` | Field objects also lists every object the map's own object list places on this map that is not loaded on screen (flag not set), with the tile the map places it on and "out of view; where the map places it, it may have moved". Story characters line gives the same coordinates instead of "(on this map, out of view)" (only when character-presence-v1 is on). |
| `navigate-first-prompt-v1` | guidance | agent (prompt, tool description, press result) | `bounded-navigation-v1` | Tool list names navigate_to as the way to move; a "Moving around" section replaces the one-line usage rule; the navigate_to description leads with when to use it; after the third direction-only overworld press in a row (no navigate_to between), the press result adds one reminder line. |

Coordinates: `SaveBlock1.objectEventTemplates` (offset 0xC70, 64 x 24 bytes; x,y at +4/+6 as s16, flag at +0x14) are map coordinates in the same frame as the readout's Position (verified on cook #2 raw RAM 00004588 and 00005144: MAY template (10,3) equals her live position at T754; player (11,21) equals Position).

## Invariants

- INV-1 OFF is byte-identical for every switch (readout bytes on recorded raw RAM; system prompt, tool description and press-result text; chat request body for presence-penalty-v1).
- INV-2 Off-screen entries come only from game RAM (templates, flags, graphics vars); hidden templates (flag set) are never listed; an object loaded on screen is listed once, with its live position.
- INV-3 No model-facing text is truncated; every off-screen object is listed.
- INV-4 The press reminder is true when shown: the last three tool calls were direction-only presses that each ended on the free field (overworld, not in battle, field controls unlocked, no message), with no other tool call between them.
- INV-5 The prompt names no destination or story step.

## Security Review

Read-only RAM reads already used by character presence. No new network, file or subprocess surface.

## Milestones

**M1 — offscreen-objects-v1**
- [x] RED: Python readout tests on cook #2 raw RAM (T416 state 4588: OFF bytes equal recorded; ON lists MAY at (10,3) and the other unflagged templates; hidden templates absent; live objects not duplicated); story-characters line ON/OFF; registry/presets/SERVER_FEATURES/default-off both stacks; production route test
- [x] COMMIT: `test(RED): ...` (b2c91d88)
- [x] GREEN + gates (`just test` counts, lint, build, coverage ≥90, verify-vendor)
- [x] COMMIT: `feat: ...`
- [x] Real-ROM re-render over cook #2 Route 103 states, OFF equal to recorded

**M2 — navigate-first-prompt-v1**
- [x] RED: prompt OFF byte-identical, ON sections; navigate_to description ON/OFF; press reminder on the third direction-only press, not after navigate_to, not in battle/menus/dialogue; factory wiring; registry counts
- [x] COMMIT: `test(RED): ...` (67117ff6)
- [x] GREEN + gates
- [x] COMMIT: `feat: ...`

**M3 — presence-penalty-v1**
- [x] RED: OFF request body unchanged; ON adds presence_penalty 1.5 to every chat request; value recorded in run_start; llama-server lane accepts it (probe); registry/presets/defaults
- [x] GREEN + gates

**M4 — explainers, pending experiments, review**
- [x] RED: explainer links and serving
- [x] Explainers, README, FEATURE_EXPLAINERS, pages-check
- [x] Pending experiments and readiness rows
- [ ] Explainers (`docs/explainers/offscreen-objects-v1.html`, `navigate-first-prompt-v1.html`), README, FEATURE_EXPLAINERS, pages-check
- [ ] Pending `experiments/offscreen-objects.json`, `experiments/navigate-first-prompt.json`; readiness rows
- [ ] Principles self-review; Claude CLI, think_fast/think_swarm, Grok and GPT lanes until LGTM
- [ ] ASK USER: merge

## Closing the Loop

Done when both switches are merged after review, explainers link from Harness Config, and the pending experiments are registered. Measured runs are the operator's call.

## Session Log

- 2026-10-16 03:41 AM EDT: The operator approved all three for the bundle: off-screen objects, navigate_to-first prompting, and presence_penalty 1.5 ("should go in the bundle"). The readiness thread owns `experiments/fixed/bundle-v-control.json`; this branch hands it the switch names and merge SHAs and does not edit it. Presence penalty is an ordinary registered switch (`presence-penalty-v1`), bundle arm only, not a preset sampling field (base.sampling is shared and checked against the control base).
- 2026-10-16 03:35 AM EDT: worklog created on `claude/nav-guidance` (`/private/tmp/pokebench-nav-guidance`, from main 8819f761). Template coordinates verified on raw RAM as above. Research recorded above.

- 2026-10-16 03:46 AM EDT: M1 RED. Fixture `env/tests/env/fixtures/offscreen-objects-sh02.json`: RAM windows read while re-rendering cook #2 raw RAM 4588 (T416) and 5144 (T754), plus the tool results the model got (seqs 9618, 12495); recorded OFF set from run_start harness_features. Tests: `env/tests/env/test_offscreen_objects.py` (OFF contained in received text; T416 ON lists MAY at (10,3) and changes only the story line and the new block; BIRCH's flagged template absent; T754 MAY on screen not repeated; synthetic loaded/invisible/flag/var-graphics/invalid cases; text; story line ON/OFF; switch default off), `packages/agent/src/offscreen-objects.test.ts` (registry, server list, presets). Python: collection error (module missing); agent: 3 failing.
  COMMIT: `test(RED): offscreen-objects-v1 lists people and objects the local map does not show (cook run #2 MAY at T416)`
- 2026-10-16 03:58 AM EDT: M1 GREEN. `env/pokebench_env/offscreen_objects.py` (templates + loaded gObjectEvents, flag-hidden and invisible skipped, window ±7 matches the Field objects list); `StoryCharacters.out_of_view` + `text(placed)`; `GameState.offscreen_objects` read only when the switch is on (state JSON unchanged); `rerender.read_state` passes it; readout block after Field objects (needs live-object-sprites-v1), one line "…: none." when empty; SERVER_FEATURES + default-off both stacks; TS registry (observation, needs live-object-sprites-v1), presets default false, DEFAULT_NEXT_RUN false; `experiments/readout-rules-in-prompt.json` incumbent gains the key (off). Registry shifts: `.at(-N)` +1 in 8 agent tests, Python SERVER_FEATURES[-N] +1 in 4 tests, observation count 22, switchboard 22/22 and 61 rows, server count 30, recorded-off sets in rerender/readout-rules/displayed-names tests.
  - Wiring removal: dropping `offscreen_objects_enabled` in rerender → 6 red; dropping the readout append → 5 red; restored → green.
  - Proof over cook #2 T415–T960 (546 tool results with raw RAM): OFF re-render contained in what the model got 546/546; ON adds the block on 137 and gives MAY's tile while out of view on 105, first at T415.
  - Gates: agent 1429, viewer 821, Python 2147 passed (ROM); coverage agent 97.73/94.58/97.98/99.08, viewer 95.19/90.64/93.55/97.65, Python total 96% (offscreen_objects, character_presence, readout 100%); lint green except the known mypy `mgba._pylib`; build green.
  COMMIT: `feat: offscreen-objects-v1 lists the map's people and objects outside the local map, with their tiles (default off)`
- 2026-10-16 04:00 AM EDT: M2 RED. `packages/agent/src/navigate-first.test.ts` + `test-support/navigate-first-sh02.json` (cook #2 run_start: harness_features and system_prompt; `playSystemPrompt(featuresOf(...))` reproduces it byte for byte today). Cases: registry/presets; OFF prompt equals cook #2's; ON tool list order and press suffix; Moving around replaces NAVIGATE_TO_USAGE and is the last section; full-map wording; screen-only press line; objective text still last; no story names; navigate_to description OFF unchanged / ON prefix and local suffix; reminder every 3rd direction-only free-field press, reset by navigate_to and non-direction presses, not by observe, not counted off the free field; OFF returns tools untouched; playGameTools wiring. Fails: module missing.
  COMMIT: `test(RED): navigate-first-prompt-v1 steers walking to navigate_to (cook run #2 prompt)`
- 2026-10-16 04:08 AM EDT: M2 GREEN. `packages/agent/src/navigate-first.ts` (tool-list edit, Moving around local/full, description prefix + local command-limit hint, `withNavigateFirst` press reminder every 3rd direction-only free-field press, reset by navigate_to and other presses); `playSystemPrompt` drops NAVIGATE_TO_USAGE and appends Moving around last when on; `navigationTool` port `navigateFirst`; `playGameTools` wraps last. Registry (guidance, needs bounded-navigation-v1), presets/defaults false, readout-rules incumbent key. Test fixes in GREEN: the production-wiring fake observation needed a PNG frame; added tool-list refusal and unreadable-state/no-buttons cases for coverage. Shifts: `.at(-N)` +1 in 8 agent tests, guidance count 28, switchboard 62 rows, ALL_ON-based prompt tests turn the switch off (battle-triage, experiment-gate, play-config, state-runtime, features dependency).
  - Wiring removal: dropping `withNavigateFirst` in playGameTools → 1 red; dropping `navigateFirst` in withNavigation → 1 red; restored → green.
  - Gates: agent 1445, viewer 821, Python 2147 passed; coverage agent 97.76/94.63/98/99.09 (navigate-first.ts 100%), viewer 95.19/90.64/93.55/97.65, Python 96%; lint green except known mypy `mgba._pylib`; build green.
  COMMIT: `feat: navigate-first-prompt-v1 names navigate_to as the way to move in the prompt, its description and a press reminder (default off)`
- 2026-10-16 04:12 AM EDT: M3 RED. `packages/agent/src/presence-penalty.test.ts` (registry, presets, `samplingExtras`/`playSampling` ON/OFF, run_start schema accepts a numeric presence_penalty and records without it); `provider.test.ts` adds wire tests through the fake gateway: OFF request bodies have no presence_penalty and the loop base equals today's, ON every chat request carries presence_penalty 1.5 and is otherwise byte-equal. Fails: module missing.
  COMMIT: `test(RED): presence-penalty-v1 sends and records presence_penalty 1.5 on every chat request`
- 2026-10-16 04:20 AM EDT: M3 GREEN. `packages/agent/src/presence-penalty.ts` (PRESENCE_PENALTY 1.5, `samplingExtras`, `playSampling`); `gatewayLoopConfig(..., extras)` adds an `onPayload` hook only when extras exist (OFF config has no hook, so the body is unchanged); `playLoopBase` used by live.ts for both the agent loop and state mode; run_start `sampling` via `playSampling` and an optional numeric `presence_penalty` in the event schema (`schemas/events.v1.json` regenerated). Registry (guidance, needs null), presets/defaults false. Test fixes in GREEN: the OFF config check compares keys (functions differ by identity); the run_start test uses cook #2's full recorded run_start (`test-support/run-start-sh02.json`); payload pass-through case for coverage.
  - Lane check (llama-server b10236, Qwen3.6-35B-A3B on [local inference port]): `/props` lists presence_penalty in default_generation_settings.params; a chat request with presence_penalty 1.5 returned 200, and `/completion` echoed `generation_settings.presence_penalty = 1.5`. MISTAKE: these two requests (~04:08 AM EDT) reached the lane while overnight control trial `runs/2026-10-16T03-50-01_qwen36-gpu1_687e` was live (slot looked idle between turns). Outlier latencies at its turns 374 (7.6 s) and 382 (6.3 s); reported to the coordinator for the overnight thread to flag. Rule for this branch: no requests to either GPU lane while trials run.
  - Wiring removal: dropping `samplingExtras(features)` in playLoopBase → 1 red; restored → green.
  - Gates: agent 1451, viewer 821, Python 2147 passed; coverage agent 97.76/94.65/98.01/99.09 (presence-penalty.ts, provider.ts 100%), viewer 95.19/90.64/93.55/97.65, Python 96%; lint green except known mypy `mgba._pylib`; build green.
  COMMIT: `feat: presence-penalty-v1 sends presence_penalty 1.5 with every chat request and records it in run_start (default off)`
- 2026-10-16 04:25 AM EDT: M4 RED. `panels.test.ts`: the three cards link to `/explainers/<id>.html` via FEATURE_EXPLAINERS and each tracked explainer quotes its key line (MAY story line and the 546-result proof; the reminder text and the `# Tools` template order; presence_penalty 1.5); `server.test.ts`: the allowlist serves all three. 2 failing.
  COMMIT: `test(RED): explainer links for offscreen-objects-v1, navigate-first-prompt-v1 and presence-penalty-v1`

## Surprises

- The served Qwen3.6 template puts tool JSON before the system prompt, not after.
- Serving uses presence_penalty 0.0; the card recommends 1.5 for thinking. Out of scope (serving config), reported to the operator.
- 2026-10-16 04:35 AM EDT: M4 GREEN. Explainers `docs/explainers/offscreen-objects-v1.html`, `navigate-first-prompt-v1.html`, `presence-penalty-v1.html` (written by three read-only-scoped helper agents from the code, tests, fixture and this worklog; `just pages-check` prints nothing); README entries; FEATURE_EXPLAINERS mappings. Pending `experiments/offscreen-objects.json`, `navigate-first-prompt.json`, `presence-penalty.json` (finals incumbent with every switch key, the three new ones off; primary RIVAL_BATTLE_WON; provisional source.commit = branch head) parse with `parseExperiment`/`experimentArms` (incumbent OFF, candidate ON); readiness rows PENDING. Gates: agent 1451, viewer 822, Python 2147; lint green except the known mypy `mgba._pylib`.
  COMMIT: `docs: explainers, harness-config links and pending experiments for the three navigation-guidance switches`

## Surprises (M4)

- Helper agents were told not to touch GPU lanes; the offscreen explainer agent re-rendered locally from the fixture and ROM only.
- 2026-10-16 04:30 AM EDT: merged main (1e1feec9: explorer-guidance-v1, connection-edge-tiles-v1, in-game-naming-readout-v1, no-nickname-guidance-v1). Code conflicts resolved by hand (game_state, readout, rerender, navigation, play-config: both sides kept; Moving around still last after explorer guidance). Mechanical test/registry files taken from main and re-applied: the three switches now follow no-nickname-guidance-v1 (offscreen-objects-v1 follows in-game-naming-readout-v1 in SERVER_FEATURES); `.at(-N)` +3 (+1 for SERVER_FEATURES); counts observation 24, guidance 31, switchboard 67 rows, server 32; my experiment incumbents list switches up to their own (main's convention); readout-rules incumbent left as main's; offscreen OFF test adds the two server switches registered after cook #2. Gates: agent 1476, viewer 850, Python 2195; coverage agent 97.79/94.65/98.11/99.1, viewer 95.16/90.69/93.41/97.61, Python 96%; lint green except known mypy `mgba._pylib`; build, pages-check, verify-vendor OK.
  COMMIT: `Merge branch 'main' into claude/nav-guidance`

## Multi-Model Review Log

### Principles self-review (docs/agent-principles.md, PB1–PB13), cumulative diff main..claude/nav-guidance

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | No result is claimed; proofs cite run ids, turns and seqs from event logs and raw RAM. |
| PB2 | N/A | No runs launched. |
| PB3 | PASS | No improvement claimed; the three entries are pending experiments with trialsPerArm 8. |
| PB4 | PASS | Each advantage is a named, recorded switch (`harness_features`, run_start sampling records presence_penalty); vendor untouched (`just verify-vendor` OK). |
| PB5 | PASS | One switch per behavior, each with a pending experiment and hypothesis; bundle membership is the readiness thread's file. |
| PB6 | PASS | Off-screen block adds one line per object (about 20 on Route 103), never truncated (INV-3); prompt grows by one section. |
| PB7 | PASS | No new unlogged behavior: the reminder is part of the recorded tool result; presence_penalty is recorded in run_start. |
| PB8 | N/A | Tool schemas unchanged. |
| PB9 | PASS | Prompt wording shown to and approved by the operator (03:41 AM EDT); defaults picked where unspecified (reminder every 3rd press; block after Field objects) are recorded here. |
| PB10 | PASS | No skipped tests, no excludes widened, floor 90 kept, hook never bypassed. |
| PB11 | PASS | `onPayload` checked in pinned pi-ai `providers/openai-completions.js` (params replaced before the request) and proven by the fake-gateway wire test; llama-server b10236 accepted presence_penalty (see M3; that probe's timing mistake is recorded there). |
| PB12 | PASS | ROM read only via POKEBENCH_ROM for re-render tests; fixtures hold RAM windows only, never ROM bytes. |
| PB13 | PASS | RED/GREEN/gates per milestone recorded; review loop below. |

Lanes: the think_fast/think_swarm endpoint lanes are not used while overnight trials run on the GPU lanes (coordinator instruction 04:09 AM EDT); project practice for this repo is Claude, Codex (GPT family) and Grok.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive


### Round 1 (packet base 1e1feec9, head 497b39e4, diff SHA-256 4719290e…77adf; boundary and principles in the session scratchpad)

- Claude lane: Claude CLI failed (`Failed to authenticate: OAuth session expired`); used a fresh read-only Claude subagent (operator rule 2026-10-16 03:45 AM: a Claude sub-agent review counts as the Claude lane). VERDICT: BLOCKING. B1 reminder streak survives non-press tool calls (INV-4). Hardening: H1 off-screen header untrue under full-map navigation; H2 decision probes do not resend presence_penalty; H3 navigate-first is inert in state-only mode; H4 free field ignores active_ui; H5 fixture rereads ROM/map catalog; H6 OFF test is containment.
- Codex lane: default `gpt-6.1-sol` rejected for this account (HTTP 400); reran with `-m gpt-5.6-sol`. VERDICT: BLOCKING. Same INV-4 blocker; blocker 2 repeated ROM reads and map-catalog loads per render in test_offscreen_objects.py.
- Grok lane (cursor-agent, cursor-grok-4.5-high, ask mode): VERDICT: BLOCKING. Same INV-4 blocker; asks to sync the boundary text with presence-penalty-v1; PB9/PB11 caveats.
- Synthesis and fixes (one batch):
  - INV-4: every non-press tool call now resets the streak (`withNavigateFirst` wraps all other tools); `playGameTools` takes the run's context tools as `extra` so get_dialogue/recall calls reset it too (live.ts passes them instead of pushing after); tests flip the observe case and add a get_dialogue case; registry copy and explainer updated.
  - Fixture I/O: `operator_rom()` and the map catalog are cached once per module (`functools.cache`).
  - H1: header now reads "more than 7 tiles from you, so the Field objects list leaves them out", true with or without full-map navigation.
  - H4: free field also requires `active_ui` empty; test added.
  - Boundary text: three switches; INV-1 covers the request body; INV-4 restated.
  - PB9 caveat: REMINDER_EVERY=3 and the block placement were agent defaults within the approved wording (the operator approved "after a third direction-only press in a row"). PB11 caveat: the fake-gateway wire test is the proof; the live probe was contaminated by overlapping a trial.
  - Deferred (HARDENING FOLLOW-UP, not in this boundary): H2 probe-decision-cli resending presence_penalty from run_start; H3 state-only mode ignores navigate-first (state-only is incompatible with bounded navigation per stateOnlyProblems, so the combination is not run); H6 OFF byte identity also held by the existing goldens.
  - Gates: agent 1476, viewer 850, Python 2195; coverage agent 97.79/94.65/98.11/99.1, viewer 95.16/90.69/93.41/97.61, Python 96%; lint green except known mypy; pages-check clean.
  COMMIT: `fix: navigate_to reminder resets on any other tool call; off-screen header wording; cached test fixtures (review round 1)`

### Round 2 (fix delta 497b39e4..d1440397, delta SHA-256 4c75840a…3342; cumulative from 1e1feec9)

- Packet note: in the round-2 prompt the zsh array was indexed from 0, so the delta SHA printed blank and the cumulative SHA label was shifted; the shas file was correct and reviewers verified against git directly. The cumulative patch excludes the two one-line JSON fixtures, as stated in the boundary.
- Grok lane: VERDICT: LGTM (INV-4 and fixture I/O resolved; decision-probe.ts consistency as hardening only).
- Claude lane (fresh read-only subagent): VERDICT: LGTM (checked sequential tool execution, OFF order/identity, cook #2's 2399 free-field states all have active_ui null; hardening: decision-probe.ts could pass context tools as extra).
- Codex lane (gpt-5.6-sol): VERDICT: BLOCKING. A press that throws kept the streak, so UP, UP, (rejected UP), UP showed the reminder (INV-4).
- Fix: the press wrapper zeroes the streak before executing and restores it only when the press returns, so a thrown press ends the run; test added. Agent 1477 passed; lint green except known mypy; agent coverage unchanged (navigate-first.ts 100%).
  COMMIT: `fix: a press that throws ends the navigate_to reminder streak (review round 2)`
- Round 3 needs the operator's scope confirmation (two complete rounds with new blockers).

### Round 3 (operator OK 04:44 AM EDT; fix delta d1440397..a8514328, SHA-256 3fffeaed…de24)

- Claude lane (fresh read-only subagent): VERDICT: LGTM.
- Codex lane (gpt-5.6-sol): VERDICT: LGTM.
- Grok lane (cursor-grok-4.5-high): VERDICT: LGTM; hardening: registry copy and explainer did not yet name "a press that errors" among the resets. Synced after review (doc/copy only, no code).
  COMMIT: `docs: navigate-first copy names an erroring press among the resets (review round 3)`

### Merge of main 6d2be8af (battle-text-auto-advance-v1)

- Conflicts: play-config.ts resolved by hand (battle-text section kept before the evidence section; navigate-first logic unchanged); mechanical registry/test files taken from main and re-applied: the three switches follow battle-text-auto-advance-v1; `.at(-N)` +3 (+1 SERVER_FEATURES); battle-text "last key" tests now `.at(-4)`; counts observation 24, guidance 32, switchboard 68; my incumbents list switches up to their own; readiness rows and README entries re-appended.
- Gates: agent 1519, viewer 866, Python 2224; lint green except known mypy; coverage and pages-check below.
  COMMIT: `Merge branch 'main' into claude/nav-guidance (battle-text-auto-advance-v1)`
- Merge-resolution review (remerge diff of 8b15f1e5): Grok LGTM (hardening: battle-text test names still say "last"). Codex BLOCKING: battle-text's historical-preset normalization test inherited the three new switches from ALL_ON, so it no longer proved a pre-merge preset gets them OFF and ordered after battle-text. Fix: both battle-text historical fixtures omit the three switches too and assert the last four keys are battle-text then the three, all three false; test names updated. Agent 1519 passed.
  COMMIT: `test: battle-text historical-preset tests also omit the three navigation-guidance switches (merge review)`
- Merge-resolution re-review: Codex LGTM (a3badf7c). All lanes clean; landing.

### Merge of main 48d6b48f (battle-message-waiting-v1)

- Conflicts: readout.py (SERVER_FEATURES and default-off list keep both, offscreen last) and panels.ts (both explainer mappings) by hand; mechanical files from main and re-applied: the three switches follow battle-message-waiting-v1 (offscreen also after it in SERVER_FEATURES); `.at(-N)` +3 (+1 SERVER_FEATURES); battle-text historical-preset tests again omit the three and assert the tail; battle-message-waiting's readout.py tail check and Python `SERVER_FEATURES[-2]`; counts observation 25, guidance 32, switchboard 69, server 33; rerender recorded-off and pass-through dict; incumbents, readiness rows, README re-applied.
- Gates: agent 1524, viewer 867, Python 2249; coverage agent 97.87/94.44/98.17/99.13, viewer 95.36/90.98/93.57/97.7, Python 96%; lint green except known mypy; pages-check clean.
  COMMIT: `Merge branch 'main' into claude/nav-guidance (battle-message-waiting-v1)`
