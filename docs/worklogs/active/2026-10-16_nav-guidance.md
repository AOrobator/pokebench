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

Two new default-OFF switches. OFF reproduces today byte for byte.

| Switch | Group | Side | Needs | ON |
|---|---|---|---|---|
| `offscreen-objects-v1` | observation | server (Python readout) | `live-object-sprites-v1` | Field objects also lists every object the map's own object list places on this map that is not loaded on screen (flag not set), with the tile the map places it on and "out of view; where the map places it, it may have moved". Story characters line gives the same coordinates instead of "(on this map, out of view)" (only when character-presence-v1 is on). |
| `navigate-first-prompt-v1` | guidance | agent (prompt, tool description, press result) | `bounded-navigation-v1` | Tool list names navigate_to as the way to move; a "Moving around" section replaces the one-line usage rule; the navigate_to description leads with when to use it; after the third direction-only overworld press in a row (no navigate_to between), the press result adds one reminder line. |

Coordinates: `SaveBlock1.objectEventTemplates` (offset 0xC70, 64 x 24 bytes; x,y at +4/+6 as s16, flag at +0x14) are map coordinates in the same frame as the readout's Position (verified on cook #2 raw RAM 00004588 and 00005144: MAY template (10,3) equals her live position at T754; player (11,21) equals Position).

## Invariants

- INV-1 OFF is byte-identical for both switches (readout bytes on recorded raw RAM; system prompt, tool description and press-result text).
- INV-2 Off-screen entries come only from game RAM (templates, flags, graphics vars); hidden templates (flag set) are never listed; an object loaded on screen is listed once, with its live position.
- INV-3 No model-facing text is truncated; every off-screen object is listed.
- INV-4 The press reminder is true when shown: field controls available, the last three tool calls were direction-only presses on the overworld, no navigate_to since.
- INV-5 The prompt names no destination or story step.

## Security Review

Read-only RAM reads already used by character presence. No new network, file or subprocess surface.

## Milestones

**M1 — offscreen-objects-v1**
- [ ] RED: Python readout tests on cook #2 raw RAM (T416 state 4588: OFF bytes equal recorded; ON lists MAY at (10,3) and the other unflagged templates; hidden templates absent; live objects not duplicated); story-characters line ON/OFF; registry/presets/SERVER_FEATURES/default-off both stacks; production route test
- [ ] COMMIT: `test(RED): ...`
- [ ] GREEN + gates (`just test` counts, lint, build, coverage ≥90, verify-vendor)
- [ ] COMMIT: `feat: ...`
- [ ] Real-ROM re-render over cook #2 Route 103 states, OFF equal to recorded

**M2 — navigate-first-prompt-v1**
- [ ] RED: prompt OFF byte-identical, ON sections; navigate_to description ON/OFF; press reminder on the third direction-only press, not after navigate_to, not in battle/menus/dialogue; factory wiring; registry counts
- [ ] COMMIT: `test(RED): ...`
- [ ] GREEN + gates
- [ ] COMMIT: `feat: ...`

**M3 — presence-penalty-v1**
- [ ] RED: OFF request body unchanged; ON adds presence_penalty 1.5 to every chat request; value recorded in run_start; llama-server lane accepts it (probe); registry/presets/defaults
- [ ] GREEN + gates

**M4 — explainers, pending experiments, review**
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

## Surprises

- The served Qwen3.6 template puts tool JSON before the system prompt, not after.
- Serving uses presence_penalty 0.0; the card recommends 1.5 for thinking. Out of scope (serving config), reported to the operator.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive

