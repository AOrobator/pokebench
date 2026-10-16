# battle-triage-guidance-v1: when to run from wild battles and when to heal

Asked by the operator 2026-10-16 01:56 AM EDT: "the current Pokemon of the agent had low HP ... have guidance on when to run and heal". Forensics of `2026-10-16T00-34-26_qwen36-gpu1_show`: 7 wild battles, 0 fled, blackout at turn 768. The party line showed the model's own HP (12/21 at T606, 3/23 at T744) and the prompt said nothing about running or healing. Its one RUN attempt (T611, `RIGHT, A` from FIGHT) opened BAG because RUN is bottom-right of the 2x2 menu. A YOUNGSTER told it three times that OLDALE has a POKéMON CENTER; it never healed.

Branch `claude/battle-triage-guidance` in `/private/tmp/pokebench-battle-triage`. Default-off bundle switch; the bundle definition is owned by the Dual GPU experiment readiness thread. Merge only after the operator types "merge it".

## Design

- ON, system prompt: wild battles can be left with RUN, the bottom-right option of FIGHT/BAG/POKéMON/RUN (from FIGHT: RIGHT then DOWN); trainer battles cannot be fled. Run from a wild battle when your active Pokémon is below half its HP or when you are travelling to a story goal and the fight is not needed. Heal before walking into tall grass with a weak Pokémon: a POKéMON CENTER nurse heals the party, and so does resting at home. Names game rules, no destination.
- ON, battle result: when a battle is input-ready, the player's active Pokémon is below half HP and the game would allow RUN (wild battle, not the Birch rescue), one line states it from RAM: `Your TORCHIC has 5/23 HP (below half). This is a wild battle: RUN is allowed.`
- ON, overworld result: when the lead Pokémon is below half HP, one line says so and that POKéMON CENTERs and home heal it.
- OFF: no section, no lines; prompt and results byte-identical.

## Decisions (M1, 2026-10-16 02:10 AM EDT)

- **Server-side readout, not agent-side.** The RUN rule already lives in `env/pokebench_env/battle_details.py` (`_run`), and it needs the held item's hold effect from the ROM item table (SMOKE BALL always escapes, ENIGMA BERRY is unread), which the agent's state JSON does not carry. Re-deriving it in TypeScript would be a second copy. So the battle and field lines are drawn in the readout (`format_readout`), and the switch joins `SERVER_FEATURES` in both stacks (Python default-off list too). The system prompt section is agent-side (`playSystemPrompt`).
- **One RUN owner.** `_run` is factored into `run_verdict(battle, actor, held) -> RunVerdict(allowed, text)`; battle-details-v2 prints `.text` (byte-identical), the triage line requires `.allowed is True`. `rerender.read_state` now reads `battle_details` when either switch is on (the readout only prints the details block when battle-details-v2 is on; `battle_details` is not in the state JSON).
- **Not shown when RUN is not allowed** (trainer, Birch rescue, link, Safari, Wally tutorial, recorded playback, trapped/bound, unread hold effect). Simplest truthful choice: the line's job is to point at an available escape; in a trainer battle the game itself refuses RUN with its own message, battle-details-v2 (when on) already states the refusal, and the prompt says trainer and some story battles cannot be fled. A "RUN is not allowed" line would add no action.
- **Battle line conditions:** player-side battler (even position), not absent, a player input for that battler ready in `action` or `move` phase (the battle menu is open or one B away), 0 < HP and 2·HP < max HP, battle details readable (no diagnostic), no TRAINER/LINK/SAFARI/WALLY/RECORDED bit, shared verdict allowed. Name = the battler's species, the same name the party line leads with.
- **Field line conditions:** not in battle and no battle state; party owner `player`; the lead is the first party member that is not an egg and not at 0 HP (the one the game sends out first); shown when 0 < HP and 2·HP < max HP; nothing when that member has a decode diagnostic or unknown HP, or when every member is fainted (the game's whiteout handles that). Placed right after the Party line.
- **"Resting at home" is MOM.** pokeemerald `data/scripts/players_house.inc` `PlayersHouse_1F_EventScript_MomHealsParty` ("You look a little tired. I think you should rest a bit.") calls `Common_EventScript_OutOfCenterPartyHeal` once `FLAG_RESCUED_BIRCH` is set; the bed does nothing. Copy says "talking to MOM at home" so the model is not sent to the bed. Nurse: `data/scripts/pkmn_center_nurse.inc` `special HealPlayerParty`.
- **Menu layout grounded:** `src/battle_controller_player.c` `HandleInputChooseAction`: cursor 0 FIGHT, 1 BAG, 2 POKéMON, 3 RUN ("Bottom right"); RIGHT/LEFT toggles bit 0, DOWN/UP bit 1, so FIGHT → RIGHT → BAG → DOWN → RUN. Flags `include/constants/battle.h`: TRAINER 1<<3, FIRST_BATTLE 1<<4; the showcase run's wild battles were 4 (IS_MASTER), the rescue 20. pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.
- **Threshold:** strictly below half, `2*hp < max_hp`, in `battle_triage.below_half` (Python, the one owner of the lines and their copy); the prompt states the same rule in words ("below half its maximum HP"). The state-only decision prompt (`stateOnlyPrompt`) is not changed; the readout lines still reach it.

## Milestones

**M1 — switch, RED, GREEN**
- [ ] Switch registered (guidance, default OFF), presets, DEFAULT_NEXT_RUN, prompt wiring through playSystemPrompt, result wiring through toolSwitches
- [x] RED: OFF prompt and results byte-identical; ON prompt section; battle line only when below half and RUN allowed (not trainer, not the Birch rescue, from battle RAM); overworld line below half; factory tests; wiring-removal check
- [ ] GREEN, gates (test, lint, build, coverage ≥90, verify-vendor)

**M2 — explainer and review**
- [ ] Explainer `docs/explainers/battle-triage-guidance-v1.html`, FEATURE_EXPLAINERS mapping, pending `experiments/battle-triage-guidance.json`
- [ ] Review: Claude CLI, Codex (gpt-5.6-sol), Grok (cursor-grok-4.5-high) until LGTM
- [ ] ASK USER: "merge it"

## Session Log

- 2026-10-16 01:59 AM EDT: worklog drafted, awaiting the operator's OK.
- 2026-10-16 02:10 AM EDT: approved by the parent session; M1 started. RED: `env/tests/env/test_battle_triage.py` (import of `run_verdict` / `battle_triage` fails), `packages/agent/src/battle-triage.test.ts` (6 failing: registry, presets, OFF prompt sha of the showcase run, ON section, copy, preset→prompt/server-env factory path), `packages/viewer/src/next-run.test.ts` (DEFAULT_NEXT_RUN off: 1 failing).
