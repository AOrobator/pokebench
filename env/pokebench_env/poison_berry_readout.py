"""Independent poison/berry text, grounded in pret/pokeemerald 731ad5bf.

PetalburgCity_Mart_Text_TakeSomeAntidotesWithYou supplies the warning sentence;
GetAilmentFromStatus supplies PSN. SetBerryTreeGraphics uses the loaded object's
trainerRange_berryTreeId (+0x1D, already verified by resources.py) and stage.
BerryTree_EventScript_Berries / BerryTree_Text_WantToPick own the harvest choice.
Item descriptions below are sCheriBerryDesc through sSitrusBerryDesc.
"""

import struct

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.resources import Resources
from pokebench_env.status_names import POISON as POISON_BIT
from pokebench_env.status_names import TOXIC

POISON = "poison-readout-v1"
BERRY = "berry-readout-v1"
POISON_WARNING = (
    'Poison (PSN): "If you walk around with a poisoned POKéMON, it will lose HP until it faints."'
)
BERRY_DESCRIPTIONS = {
    133: "A hold item that heals paralysis in battle.",
    134: "A hold item that awakens POKéMON in battle.",
    135: "A hold item that heals poisoning in battle.",
    136: "A hold item that heals a burn in battle.",
    137: "A hold item that defrosts POKéMON in battle.",
    138: "A hold item that restores 10 PP in battle.",
    139: "A hold item that restores 10 HP in battle.",
    140: "A hold item that heals confusion in battle.",
    141: "A hold item that heals any status problem in battle.",
    142: "A hold item that restores 30 HP in battle.",
}


def poisoned(status: int | None) -> bool:
    return status is not None and bool(status & (POISON_BIT | TOXIC))


def visible_berry_lines(
    read: ReadMemory,
    resources: Resources,
    map_id: tuple[int, int],
    position: tuple[int, int],
) -> tuple[str, ...]:
    """Only loaded visible trees within the same 7-tile window as Field objects.

    ObjectEvent.invisible/offScreen are byte +1 bits 0x20/0x40;
    UpdateObjectEventSpriteVisibility hides either (event_object_movement.c).
    No type, quantity, timer or off-screen tree information is exposed. Missing
    resource data is unavailable, never interpreted as a ripe or empty tree.
    """
    raw = read(OBJECT_EVENTS, 16 * 0x24)
    if len(raw) != 16 * 0x24:
        return ("Berry trees: unavailable (short object snapshot).",)
    trees = {t.tree_id: t for t in resources.berry_trees or ()}
    lines = []
    for offset in range(0, len(raw), 0x24):
        obj = raw[offset : offset + 0x24]
        if (
            not obj[0] & 1
            or obj[1] & 0x60
            or obj[2] & 1
            or (obj[10], obj[9]) != map_id
            or obj[5] not in (60, 61, 62)
        ):
            continue
        x, y = struct.unpack_from("<hh", obj, 0x10)
        x, y = x - MAP_OFFSET, y - MAP_OFFSET
        if abs(x - position[0]) > 7 or abs(y - position[1]) > 7:
            continue
        tree = trees.get(obj[0x1D])
        if tree is None:
            lines.append(f"Berry tree at ({x},{y}): growth state unavailable.")
        elif tree.stage == 5:
            lines.append(
                f"Berry tree at ({x},{y}): berries ready to pick; "
                "face the tree and press A to examine. "
                "The game asks whether to pick them; choose YES or NO."
            )
        elif tree.stage != 0:
            lines.append(f"Berry tree at ({x},{y}): growing; no ripe berries.")
    return tuple(lines)


def bag_berry_lines(resources: Resources | None) -> list[str]:
    return [
        f'BAG berry: {item.name} ×{item.quantity} — "{BERRY_DESCRIPTIONS[item.item_id]}"'
        for item in (() if resources is None else resources.bag or ())
        if item.pocket == "berries"
        and item.name
        and item.quantity > 0
        and item.item_id in BERRY_DESCRIPTIONS
    ]
