"""battle-triage-guidance-v1: one readout line when the player's own Pokémon is below half HP.

In a wild battle with the battle menu open, the line says RUN is allowed, using battle-details-v2's
`run_verdict` (the one RUN rule). On the field, it says where the party is healed: the POKéMON
CENTER nurse (data/scripts/pkmn_center_nurse.inc, special HealPlayerParty) and MOM at home
(data/scripts/players_house.inc PlayersHouse_1F_EventScript_MomHealsParty). pokeemerald 731ad5bf.
Thresholds and copy live here only; the system prompt states the same rule in words.
"""

from pokebench_env.battle_details import (
    LINK,
    RECORDED,
    SAFARI,
    TRAINER,
    WALLY_TUTORIAL,
    BattleDetails,
    run_verdict,
)
from pokebench_env.battle_state import BattleState
from pokebench_env.pokemon import PartyMon

SWITCH = "battle-triage-guidance-v1"
# The battle menu is open (action) or one B away (move select).
MENU_PHASES = ("action", "move")
NOT_WILD = TRAINER | LINK | RECORDED | SAFARI | WALLY_TUTORIAL


def below_half(hp: int, max_hp: int) -> bool:
    return 0 < hp and 2 * hp < max_hp


def battle_triage_lines(battle: BattleState, details: BattleDetails | None) -> list[str]:
    if details is None or details.diagnostic is not None:
        return []
    if (battle.battle_type or 0) & NOT_WILD:
        return []
    ready = {i.battler for i in battle.player_inputs or () if i.ready and i.phase in MENU_PHASES}
    held = {h.battler: h for h in details.held}
    return [
        f"Your {actor.species} has {actor.hp}/{actor.max_hp} HP (below half). "
        "This is a wild battle: RUN is allowed (bottom-right of the battle menu)."
        for actor in battle.battlers or ()
        if not actor.position & 1
        and not actor.absent
        and actor.battler in ready
        and below_half(actor.hp, actor.max_hp)
        and run_verdict(battle, actor, held.get(actor.battler)).allowed is True
    ]


def field_triage_line(party: tuple[PartyMon, ...] | None, owner: str) -> str | None:
    if owner != "player":
        return None
    lead = next((m for m in party or () if not m.is_egg and m.hp != 0), None)
    if lead is None or lead.diagnostic is not None or lead.hp is None or lead.max_hp is None:
        return None
    if not below_half(lead.hp, lead.max_hp):
        return None
    return (
        f"Your {lead.species or 'UNKNOWN'} has {lead.hp}/{lead.max_hp} HP (below half). "
        "Talking to the nurse at a POKéMON CENTER heals your whole party; "
        "so does talking to MOM at home."
    )
