# people-ledger-v1: who is here, and when you last talked to them

Approved by the operator 2026-10-16 2:08 AM EDT (option 1, bundle). Forensics of `2026-10-16T00-34-26_qwen36-gpu1_show`: after BIRCH_STARTER_HANDOFF_COMPLETE the model entered MAY'S HOUSE 1F (T418), took NINJA_BOY for MAY and never re-talked to WOMAN_4 (May's mom, last spoken to at T145, before the starter), the only source of "ROUTE 103" (pokeemerald `LittlerootTown_MaysHouse_1F/scripts.inc:335`, gated on FLAG_SYS_POKEMON_GET). The character-presence line ("Not on this map: … MAY") sat at line ~49 of 72 and was referenced once in 869 turns.

Branch `claude/people-ledger` in `/private/tmp/pokebench-people-ledger`. Default-off bundle switch; bundle definition owned by the readiness thread. Standing merge OK once Claude, Codex and Grok LGTM.

## Design
- ON: a short block near the top of the overworld readout (right after Location/Position): every person on the current map (map-local object, sprite kind, position) with when the model last talked to them, in turns and in story milestones since: `People here: WOMAN_4 at (8,7): last talked turn 145, before 2 story milestones; NINJA_BOY at (8,5): never talked to.` Story characters by name where character-presence names them, and the absent-story-character list. Facts only, no instructions, nothing clipped.
- "Talked to" = a dialogue auto-advance or press result whose pages were opened by facing and pressing A on that object (object identity map group/num + local id), recorded harness-side from events the run already has.
- OFF: readout byte-identical.

## Decisions (M1)
- **Agent-side.** The talk history (which conversations the model was shown, on which turn, and the story milestones since) exists only in the harness's recorded events (`dialogue_auto_advance`, `tool_result`, `milestone`, `turn_start`), so the ledger lives in `packages/agent/src/people-ledger.ts`, subscribes to the recorder and rewrites the readout text the model receives. The game server stays unchanged.
- **Identity = object's own map id + map-local object id**, from the typed `world_context.objects` (several objects share a sprite kind; the same local id on another map is another person).
- **"Talked to"** = a `dialogue_auto_advance` event whose first page's recorded state shows the player facing that object (the adjacent tile, or the tile beyond a counter, `MB_COUNTER` 0x80, exactly as pokeemerald 731ad5bf `GetInteractedObjectEventScript` picks it, `src/field_control_avatar.c`), and either the model's press ended in A or the page record already attributes its first page to that faced sprite (`speaker_source: faced_sprite`, e.g. the rival walking up at T161). Counted when its tool result reaches the model (an error result drops it); the call that shows the talk already lists it.
- **Needs `dialogue-auto-advance-v1`**: without its page records every talk would read "not talked to", which would be false.
- **Story characters:** names come from character-presence-v1's own readout line (`NAME at x,y` matched to the object at that tile; out-of-view entries and the absent list repeated). Without that line, no names. The presence line itself is left where it is (its own switch's output is unchanged).
- **Placement:** right after the Position line (after Location when position is off), before Party. In the evidence run the presence line sat at line ~49 of 72 and was referenced once in 869 turns; the top block (Screen..Position) is what the model quotes every turn.

## Milestones
**M1 — switch, RED, GREEN, gates.** **M2 — explainer, pending experiment, review (Claude CLI, Codex, Grok) until LGTM.**

### M1
- [x] RED: `people-ledger.test.ts` (T418/T424 replay from `test-support/people-ledger-show.json`, ledger rules, OFF identity, factory, registry) + explainer mapping test
- [ ] GREEN: module, registry, presets, defaults, wiring
- [ ] Wiring-removal check
- [ ] Gates


## Session Log
- 2026-10-16 02:10 AM EDT: worklog drafted (approved by the operator).
