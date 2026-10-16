# people-ledger-v1: who is here, and when you last talked to them

Approved by the operator 2026-10-16 2:08 AM EDT (option 1, bundle). Forensics of `2026-10-16T00-34-26_qwen36-gpu1_show`: after BIRCH_STARTER_HANDOFF_COMPLETE the model entered MAY'S HOUSE 1F (T418), took NINJA_BOY for MAY and never re-talked to WOMAN_4 (May's mom, last spoken to at T145, before the starter), the only source of "ROUTE 103" (pokeemerald `LittlerootTown_MaysHouse_1F/scripts.inc:335`, gated on FLAG_SYS_POKEMON_GET). The character-presence line ("Not on this map: … MAY") sat at line ~49 of 72 and was referenced once in 869 turns.

Branch `claude/people-ledger` in `/private/tmp/pokebench-people-ledger`. Default-off bundle switch; bundle definition owned by the readiness thread. Standing merge OK once Claude, Codex and Grok LGTM.

## Design
- ON: a short block near the top of the overworld readout (right after Location/Position): every person on the current map (map-local object, sprite kind, position) with when the model last talked to them, in turns and in story milestones since: `People here: WOMAN_4 at (8,7): last talked turn 145, before 2 story milestones; NINJA_BOY at (8,5): never talked to.` Story characters by name where character-presence names them, and the absent-story-character list. Facts only, no instructions, nothing clipped.
- "Talked to" = a dialogue auto-advance or press result whose pages were opened by facing and pressing A on that object (object identity map group/num + local id), recorded harness-side from events the run already has.
- OFF: readout byte-identical.

## Decisions (M1)
- **Agent-side.** The talk history (which conversations the model was shown, on which turn, and the story milestones since) exists only in the harness's recorded events (`dialogue_auto_advance`, `tool_result`, `milestone`, `turn_start`), so the ledger lives in `packages/agent/src/people-ledger.ts`, subscribes to the recorder and rewrites the readout text the model receives. The game server stays unchanged.
- **Identity = current map id + map-local object id.** Membership comes from the typed `interaction_targets` of kind object (all 16 game object-event slots that are active, visible, on this map and scripted, with live position and current elevation, `world.py read_targets`), not `world_context.objects`, which the server cuts to 7 tiles (round-1 Codex blocker 1). Several objects share a sprite kind; the same local id on another map is another person.
- **"Talked to"** = a `dialogue_auto_advance` event whose first page's recorded state shows the player facing that object (the adjacent tile, or the tile beyond a counter, `MB_COUNTER` 0x80, with `GetObjectEventIdByPosition`'s elevation rule: object elevation must equal the player's unless either, or the player's tile, is 0 = `ELEVATION_TRANSITION`; as pokeemerald 731ad5bf `GetInteractedObjectEventScript` picks it, `src/field_control_avatar.c`; round-1 Codex blocker 2. Approximation: the server reads the player's current elevation, the game uses `previousElevation`, which differs only mid-step), and either the model's press ended in A or the page record already attributes its first page to that faced sprite (`speaker_source: faced_sprite`, e.g. a scripted person who walks up and speaks without a name prefix). Objects with no script of their own are not listed and never counted: at T161 May walks up from a scriptless cutscene object (MaysHouse_1F object 7), so that talk counts for no one; the same holds for Mom upstairs at T68 and Birch on Route 101 at T252 (round-2 Claude finding, tested at state 3183). Counted when its tool result reaches the model (an error result drops it); the call that shows the talk already lists it.
- **Needs `dialogue-auto-advance-v1`**: without its page records every talk would read "not talked to", which would be false.
- **Story characters:** names come from character-presence-v1's own readout line (`NAME at x,y` matched to the object at that tile; out-of-view entries and the absent list repeated). Without that line, no names. The presence line itself is left where it is (its own switch's output is unchanged).
- **Placement:** right after the Position line (after Location when position is off), before Party. In the evidence run the presence line sat at line ~49 of 72 and was referenced once in 869 turns; the top block (Screen..Position) is what the model quotes every turn.

## Milestones
**M1 — switch, RED, GREEN, gates.** **M2 — explainer, pending experiment, review (Claude CLI, Codex, Grok) until LGTM.**

### M1
- [x] RED: `people-ledger.test.ts` (T418/T424 replay from `test-support/people-ledger-show.json`, ledger rules, OFF identity, factory, registry) + explainer mapping test
  COMMIT: `test: RED people-ledger-v1 lists people on the map with when the model last talked to them` (3be1f4c4)
- [x] GREEN: `people-ledger.ts`; registry (`SWITCHABLE_FEATURES`, `FEATURES` observation entry with `needs: dialogue-auto-advance-v1`, `...when()` last); presets (optional, default false; `flagFeatures`); `DEFAULT_NEXT_RUN` false; `playGameTools` wraps the outermost tools; registry index tests shifted by one
- [x] Wiring-removal check: replaced `withPeopleLedger(...)` in `playGameTools` with the bare inner call → "the production factory honors the switch" FAILED (`expected '|Screen: overworld\nLocation: ROOM\nP…' to contain 'People and objects here'`), 1 failed / 10 passed; restored → 11 passed.
- [x] Exact T418 block (fixture assertion):
```
People and objects here (this map's live objects; a sprite kind is a graphic, not a name):
- object 4, sprite WOMAN_4, at (8,7): last talked to on turn 145 (273 turns ago; 5 story milestones since)
- object 6, sprite NINJA_BOY, at (8,5): not talked to this run
Story characters here: none. Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN.
```
- [x] Explainer `docs/explainers/people-ledger-v1.html` (`just pages-check` silent), README index, `FEATURE_EXPLAINERS` mapping
- [x] Pending `experiments/people-ledger.json` (finals incumbent + `dialogue-auto-advance-v1` ON, which this switch needs) and readiness line; `just experiments-check` reads main's directory (ok: 51), so the entry was validated with `parseExperiment` + `experimentArms` from the branch build
- [x] Gates: `just test` agent 1411 / viewer 797 / pytest 2017 passed (2 ROM skips); `just lint` TS clean, ruff clean, mypy fails only on the known `mgba._pylib` worktree import; `just build` ok; `just coverage` agent 97.76 lines / 94.54 branches / 98.02 functions, viewer 95.11 / 90.43 / 93.59, Python 97.08 / 92.67 / 100 (floor 90); `just verify-vendor` OK (submodule initialised in the worktree at the pin bbab97ad)


## Session Log
- 2026-10-16 02:10 AM EDT: worklog drafted (approved by the operator).
- 2026-10-16 02:18 AM EDT: RED committed.
- 2026-10-16 02:45 AM EDT: GREEN, explainer, pending experiment, gates green; review next.
  COMMIT: `feat: people-ledger-v1 lists the live objects on the map under Position with when the model last talked to each` (d2842817)
- 2026-10-16 02:55 AM EDT: pre-review hardening: the ledger indexes the faced object per recorded state seq instead of holding states until the next tool result (no reliance on tool calls running one at a time); fixture gains T127/T204 lab talks and the T406 lab readout, where character presence places PROF. BIRCH at 6,4 (test: Birch named on object 2, SCIENTIST_1 last talked turn 204, 202 turns and 2 story milestones ago).
- 2026-10-16 02:37–02:47 AM EDT: review round 1 on e8a46f22..fe8f94a1 (diff sha256 8ba069bd…a9547). Claude CLI (default profile; `~/.claude-review` is logged out) LGTM; Grok (cursor-grok-4.5-high) LGTM; Codex (gpt-5.6-sol) BLOCKING: (1) "every live object on the map" came from the 7-tile `world_context.objects`; (2) faced-object pick ignored the game's elevation match. Hardening notes taken: import `COUNTER` from tile-rules; Python golden test for the presence line format the ledger parses; `faced` index now stores only key strings (one per faced state, linear).
- 2026-10-16 03:05 AM EDT: round-1 fixes: objects from `interaction_targets` (fixture gains Littleroot state 889 where BOY_2 at (14,17) is loaded but outside the 7-tile list; the truck has no script and is not listed); elevation rule with bridge/transition tests; registry copy and explainer updated; `test_the_line_people_ledger_reads_keeps_its_exact_shape` in env tests.
  COMMIT: `fix: people-ledger-v1 lists every loaded scripted object on the map and picks the faced one at the player's elevation` (c8b74a93); gates: agent 1413, viewer 797, pytest 2018; coverage agent 97.76/94.57/98.02, viewer 95.11/90.43/93.59, Python 97.08/92.67/100.
- 2026-10-16 03:10–03:25 AM EDT: review round 2 on the fix delta fe8f94a1..c8b74a93 (sha256 df97fc98…6209). Grok LGTM. Claude CLI and Codex both BLOCKING on the same packet defect: the round-2 principles table had lost its PB6 row (a botched substitution left `| X |`). Both confirmed the two round-1 code blockers resolved. Claude hardening: scriptless cutscene objects (May walking up at T161, Mom upstairs T68, Birch on Route 101 T252) are not listed and their talks count for no one, while the worklog/explainer still cited T161 as a counted example. A reviewer process left an untracked `.scratch-investigate-r2.py` in the worktree; deleted, never committed.
- 2026-10-16 03:30 AM EDT: round-2 fixes: PB6 row restored with a quantified growth bound (principles-r3); T161 test (state 3183: May object 7 is in the 7-tile list but has no script, so facedObject is null and she is not listed); worklog Decisions and explainer examples corrected. Gates: agent 1414, viewer 797, pytest 2018 (2 ROM skips); coverage agent 97.76/94.57/98.02, viewer 95.11/90.43/93.59, Python 97.08/92.67/100; TS lint clean; ruff clean; verify-vendor OK. Two full rounds have produced new blockers, so per the review rule the loop stops here for the coordinator; round 3 not run.
