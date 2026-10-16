# script-line-presence-v1: say who is on screen when a dialogue page has no speaker

Dispatched 2026-10-16 03:00 AM EDT for the operator (standing merge approval once the cloud review lanes, Codex, Grok and Claude, approve and all gates pass). Branch `claude/script-line-presence` in worktree `.claude/worktrees/agent-a93f01a46943b223f`. Local only: no push, no PR, no remote. Does not edit `experiments/bundle-v-control.json` (owned by another thread); registers its own pending experiment. Does not launch, restart or stop runs or the viewer.

## Evidence

Live run `2026-10-16T02-23-17_qwen36-gpu1_sh02` (read-only), analysis `runs/reports/cook-run2-forensics.html` section 6. At turn 259 (tool_result seq 5853) the press result listed Birch's rescue lines with no speaker at all:

```
1. turn 259 · ROUTE101 (map 0/16) · at 11,19: "H-help me!"
2. turn 259 · ROUTE101 (map 0/16) · at 11,15: "Hello! You over there!
Please! Help!"
3. turn 259 · ROUTE101 (map 0/16) · at 11,15: "In my BAG!
There's a POKé BALL!"
```

The pages come from map scripts (pokeemerald `data/maps/Route101/scripts.inc`, `Route101_EventScript_StartBirchRescue`, `PreventExit*`), so there is no faced object and no `NAME:` prefix: `dialogue_auto_advance` seq 5851 records `speaker: null, speaker_source: null` on all three pages. The recorded page states (5833, 5839, 5845) list PROF_BIRCH (graphics 64), BIRCHS_BAG (97), ZIGZAGOON_1 (98) and, from 5839, YOUNGSTER (35) at (16,8). The readout's own character-presence line at 5853 names `PROF. BIRCH at 4,13`. The model never tied "my BAG" to Birch or to the bag object at (7,14) and walked toward Birch 30+ times. The T307 stall briefing (loop_guard seq 7272) quotes the same pages again without a speaker.

## Design

- **ON:** a page whose speaker is null (no `NAME:` prefix and no faced object) gets a factual tag in place of the speaker label, built from that page's own recorded state:
  `(no speaker shown by the game; on screen: PROF. BIRCH (sprite PROF_BIRCH) at 4,13; ZIGZAGOON_1 at 5,13; BIRCHS_BAG at 7,14)`.
  It never guesses a speaker.
- **On screen** = the state's `world_context.objects` (live, visible, non-player objects on the current map; `env/pokebench_env/world_context.py`) whose tile lies within 7 columns and 5 rows of the player. Grounding: the GBA screen is 240×160 = 15 columns × 10 rows of 16 px tiles; the player's tile is drawn at column 7 and pixel rows 72–88, half a tile below centre (`SetSpritePosToMapCoords`, `src/event_object_movement.c`), so rows −5 and +5 are partly visible. Checked on recorded frames: sh02 frame 5853 (Birch at dx −7 on the left edge, bag at dy −1), 66d3 frame 2114 (object at dy −5 visible at the top), 6160 (MOM at dy +5 visible at the bottom). Listed in reading order (row, then column).
- **Names:** only with `character-presence-v1` on, and only by that switch's own rule (graphics id in the character's set and the map in that character's list, `env/pokebench_env/character_presence.py` `CHARACTERS`). A live object's graphics id is already resolved (the VAR_OBJ_GFX_ID lookup happens at spawn) and a live object's hide flag was clear at spawn. The TS mirror is pinned to the Python table by one shared golden fixture checked from both stacks. Otherwise sprite kinds only.
- **Recorded:** the page record gains an optional `on_screen` (absent when OFF or when the page has a speaker), so every re-show reads it from the event: the "Dialogue shown during this call" block, `get_dialogue`, dialogue-context-kept (byte copy of the block), the stall briefing's story-step pages (`speakerLabel`), and the supervisors' "Recent dialogue" / story-context quotes and `recall_dialogue` (DialogueLog entries).
- **Needs** `dialogue-auto-advance-v1` (it owns the page records). Default OFF. OFF: no field recorded, every text byte-identical.

## Overlap check

- `claude/people-ledger` (unmerged): lists every scripted map object under Position and parses character-presence's readout line. Not reused for names here: pages are cut from intermediate auto-advance states that carry no readout text, and the ledger lists the whole map, not the screen. No shared code to extract; if it lands first, rebase only.
- `claude/displayed-names-everywhere` (unmerged): adds optional `map_display` to the page record and `location_display` to states, in the same files (`events.ts`, `dialogue-auto-advance.ts` `place()`/`Pages.add`, `dialogue-log.ts`). Mechanical conflict only; rebase if it lands first.
- `claude/pushback-loop-guard`, `claude/briefing-and-rooms`: no commits yet. Briefing edit kept to one line (`quote` in `loop-supervisor.ts`).

## Milestones

M1: RED, GREEN, gates. M2: explainer, pending experiment, review (Claude, Codex, Grok), merge.

### M1
- [x] RED: `script-line-presence.test.ts` (T259 replay from `test-support/script-line-presence-sh02.json`, screen window, names rule, OFF identity, factory wiring through `playGameTools`, stall briefing replay), story-character golden fixture (TS + Python), registry counts and OFF lists. Fails: module `./script-line-presence.js` missing (whole file red). The Python golden test passes at RED by design (it pins the fixture to today's `CHARACTERS`).
  COMMIT: `test: RED script-line-presence-v1 names who is on screen for a dialogue page with no speaker` (f1225d3d)
- [x] GREEN: `script-line-presence.ts` (screen window, character mirror, tag); page schema `on_screen` (optional, ON only, pages with no speaker) + `just schema`; `Pages` records it from the page's own state (`withDialogueAutoAdvance` builds the reader from the FeatureSet); `pageLines` exported from the summary; `speakerLabel` renders the tag (stall briefing story-step pages, page list, get_dialogue); DialogueLog entries carry `presence` (recall_dialogue, supervisors' `quote`, one-line edit in loop-supervisor.ts); registry (`SWITCHABLE_FEATURES`, `FEATURES` observation entry needing dialogue-auto-advance-v1, `...when()` last), presets optional/default false, `flagFeatures` false, `DEFAULT_NEXT_RUN` false. Registry test positions shifted by one; OFF lists gained the id; switchboard counts 21/21 and 60 rows. Added an ON test that a page with a speaker records nothing extra (the speaker-gate deletion below was first undetected).
- [x] Wiring-removal checks (each restored, all green after): `present` forced null in `withDialogueAutoAdvance` → factory ON test red (1 failed / 16); `speakerLabel` tag → 4 red; DialogueLog `presence` → 2 red; recall render → 1 red; briefing `quote` → 1 red; Pages speaker gate → 0 red at first, then 1 red after the added test. Logs in the session scratchpad (`break-*.log`, `wiring-removal-1.log`).
- [x] Gates: `just test` agent 90 files / 1428, viewer 60 / 803, pytest 2119 passed. `just coverage` agent 97.74 stmts / 94.61 branches / 98 functions / 99.09 lines, viewer 95.15 / 90.52 / 93.61 / 97.62, Python lines 97.12 / branches 92.77 / functions 100 (floor 90); `script-line-presence.ts` 25/25 statements, 27/27 branches, 10/10 functions. `just lint`: tsc + eslint clean both packages, ruff clean; mypy fails only on the known `mgba._pylib` import in this worktree's venv, and `mypy` run from this tree with the main checkout's venv (binding built) reports no issues in 74 files. `just build` ok; `just verify-vendor` OK.

### M2
- [ ] Explainer `docs/explainers/script-line-presence-v1.html`, README, `FEATURE_EXPLAINERS`
- [ ] Pending `experiments/script-line-presence.json`, readiness line
- [ ] Principles self-review
- [ ] Review: Claude, Codex, Grok
- [ ] Merge latest main, re-run gates, merge into main

## Session Log
- 2026-10-16 03:05 AM EDT: worklog drafted; fixture extracted from the live run (read-only).
- 2026-10-16 03:06 AM EDT: main fast-forwarded to bebb98c3 (adjacent-tiles) before RED.
- 2026-10-16 03:15 AM EDT: GREEN and gates.
