"""status-names-v1: the Party line names a Pokémon's status the way the game's screens show it.

pret/pokeemerald 731ad5bf: GetAilmentFromStatus (src/party_menu.c:1909-1922) maps the STATUS1
bits (include/constants/battle.h:114-125) to one ailment, in this order: poison or bad poison
(STATUS1_PSN_ANY) -> AILMENT_PSN, paralysis -> AILMENT_PRZ, sleep turns -> AILMENT_SLP,
freeze -> AILMENT_FRZ, burn -> AILMENT_BRN (include/constants/party_menu.h). The party and
summary screens draw that ailment's icon (graphics/interface/status_icons.png); its labels are
the game's own strings gText_Psn "PSN", gText_Par "PAR", gText_Slp "SLP", gText_Frz "FRZ" and
gText_Brn "BRN" (src/strings.c:627-631). The game shows nothing else (no sleep turns, no
bad-poison mark), so neither does the readout. A status with no ailment keeps its raw number.
"""

SWITCH = "status-names-v1"

SLEEP = 0x7
POISON = 1 << 3
BURN = 1 << 4
FREEZE = 1 << 5
PARALYSIS = 1 << 6
TOXIC = 1 << 7


def status_text(status: int) -> str | None:
    if status & (POISON | TOXIC):
        return "PSN"
    if status & PARALYSIS:
        return "PAR"
    if status & SLEEP:
        return "SLP"
    if status & FREEZE:
        return "FRZ"
    if status & BURN:
        return "BRN"
    return None
