"""Current rotating-gate edges, never a push or route prediction.

pokeemerald 731ad5bf rotating_gate.c owns the map-qualified config, byte-packed
VAR_TEMP_0 orientations, sprite animation and edge collision. US ROM signatures
qualify the config arrays and instruction literals independently; see the source
receipt. A pivot is a junction between tiles, so arms are edges, not occupied cells.
"""

import struct
from collections.abc import Iterable

from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import FullMap, LocalMap
from pokebench_env.map_observation_types import MapElement
from pokebench_env.world_context import SAVE_VARIABLES

FORTREE = (
    (6, 7, 5, 1),
    (9, 15, 5, 2),
    (3, 19, 5, 1),
    (2, 6, 4, 1),
    (9, 12, 4, 0),
    (6, 23, 4, 0),
    (12, 22, 4, 0),
    (6, 3, 3, 2),
)
TRICK = (
    (14, 5, 4, 1),
    (10, 6, 1, 2),
    (6, 6, 3, 1),
    (14, 8, 4, 1),
    (3, 10, 2, 3),
    (9, 14, 0, 1),
    (3, 15, 6, 0),
    (2, 17, 1, 2),
    (12, 18, 6, 3),
    (5, 18, 3, 1),
    (10, 19, 2, 2),
)
ARM_LAYOUTS = (
    (1, 0, 1, 0, 0, 0, 0, 0),
    (1, 1, 1, 0, 0, 0, 0, 0),
    (1, 0, 1, 1, 0, 0, 0, 0),
    (1, 1, 1, 1, 0, 0, 0, 0),
    (1, 0, 1, 0, 1, 0, 0, 0),
    (1, 1, 1, 0, 1, 0, 0, 0),
    (1, 0, 1, 1, 1, 0, 0, 0),
    (1, 0, 1, 0, 1, 1, 0, 0),
    (1, 1, 1, 1, 1, 0, 0, 0),
    (1, 1, 1, 0, 1, 1, 0, 0),
    (1, 0, 1, 1, 1, 1, 0, 0),
    (1, 1, 1, 1, 1, 1, 0, 0),
)
PUZZLES = {(12, 1): (0x0858E8B0, FORTREE), (29, 8): (0x0858E8F0, TRICK)}
SAVE_POINTER = 0x03005D8C
CONFIG_POINTER = 0x0203A044
CONFIG_COUNT = 0x0203A048
SPRITE_IDS = 0x0203A038
SPRITES = 0x02020630
SPRITE_SIZE = 0x44
SPRITE_CALLBACK = 0x080FBAE5
DIRECTIONS = ("north", "east", "south", "west")
POSITIONS_SWITCH = "rotating-gate-positions-v1"
RULES_SWITCH = "rotating-gate-rules-v1"
# Rules, never a push: rotating_gate.c CheckForRotatingGatePuzzleCollision (a turned gate lets the
# step through), sRotatingGate_RotationInfo* (the arm moves the way you walk) and
# RotatingGate_CanRotate (any arm's swept tile being a wall stops the gate and the step).
GATE_RULES = (
    "Gates on this map: a gate is movable. Its arms lie on the lines between tiles, and its pivot "
    "is a corner where four tiles meet, not a tile you can stand on. Walking into an arm pushes it "
    "around in the direction you walk: the whole gate turns 90 degrees around its pivot and you "
    "step through. It will not turn if an arm would sweep into a wall, and then you do not move."
)


def _config_bytes(entries: Iterable[tuple[int, int, int, int]]) -> bytes:
    return b"".join(struct.pack("<hhBBxx", *entry) for entry in entries)


ROM_SIGNATURES = (
    (0x080FB854, bytes.fromhex("10b5041c2406240e8020c001a1f7f2fe0019007810bc02bc0847")),
    (0x0809D67C, bytes.fromhex("03485100034a89180068401802bc08478c5d00039c93ffff")),
    (0x080FB8EC, bytes.fromhex("44a00302b0e8580848a00302")),
    (0x080FB918, bytes.fromhex("44a00302f0e8580848a0030238a00302")),
    (0x080FBAE4, bytes.fromhex("f0b5061c308e0006050e708e0006040e271c301c00f034f8012d14d1")),
    (0x0858E8B0, _config_bytes(FORTREE)),
    (0x0858E8F0, _config_bytes(TRICK)),
    (0x08592078, bytes(v for row in ARM_LAYOUTS for v in row)),
)


def _read(read: ReadMemory, address: int, size: int) -> bytes:
    data = read(address, size)
    if len(data) != size:
        raise ValueError("short rotating gate memory read")
    return data


def _sprite_state(read: ReadMemory, sprite_id: int, gate_id: int) -> str:
    # MAX_SPRITES is the native sentinel for an off-screen, unloaded gate sprite.
    if sprite_id == 64:
        return "current"
    if sprite_id > 64:
        return "unavailable"
    sprite = _read(read, SPRITES + sprite_id * SPRITE_SIZE, SPRITE_SIZE)
    if (
        not sprite[0x3E] & 1
        or int.from_bytes(sprite[0x1C:0x20], "little") != SPRITE_CALLBACK
        or int.from_bytes(sprite[0x2E:0x30], "little") != gate_id
    ):
        return "unavailable"
    pending = int.from_bytes(sprite[0x30:0x32], "little")
    if pending > 2:
        return "unavailable"
    if pending or not sprite[0x3F] & 0x20 or sprite[0x3F] & 8:
        return "transitioning"
    return "current"


def _arm_edge(x: int, y: int, direction: int, length: int) -> tuple[int, int, int, int]:
    if direction == 0:
        return x - 1, y - 1 - length, x, y - 1 - length
    if direction == 1:
        return x + length, y - 1, x + length, y
    if direction == 2:
        return x - 1, y + length, x, y + length
    return x - 1 - length, y - 1, x - 1 - length, y


def read_rotating_elements(
    read: ReadMemory,
    map_id: tuple[int, int] | None,
    shown: LocalMap | FullMap,
    *,
    every_gate: bool = False,
) -> tuple[tuple[MapElement, ...], tuple[str, ...]]:
    """every_gate is rotating-gate-positions-v1: each gate at its orientation byte, seen or not.

    The game's collision reads that byte and a push changes it at once, so sprite state says nothing
    about where an arm is. A loaded gate that has never turned keeps 0x3F=0x50 and data[1]=0 for as
    long as it is on screen; reading affineAnimEnded there hid every unpushed gate in run 274b.
    """
    puzzle = None if map_id is None else PUZZLES.get(map_id)
    if puzzle is None:
        return (), ()
    address, config = puzzle
    visible = {(tile.x, tile.y) for tile in shown.tiles}
    relevant = [
        (gate_id, entry)
        for gate_id, entry in enumerate(config)
        if every_gate
        or any(
            (x, y) in visible
            for x in range(entry[0] - 2, entry[0] + 2)
            for y in range(entry[1] - 2, entry[1] + 2)
        )
    ]
    if not relevant:
        return (), ()
    try:
        if any(_read(read, at, len(expected)) != expected for at, expected in ROM_SIGNATURES):
            return (), ("rotating gate source identity unavailable",)
        save = int.from_bytes(_read(read, SAVE_POINTER, 4), "little")
        if (
            save % 4
            or not 0x02000000 <= save <= 0x02040000 - SAVE_VARIABLES - len(config)
            or _read(read, save + 4, 2) != bytes(map_id or ())
            or int.from_bytes(_read(read, CONFIG_POINTER, 4), "little") != address
            or _read(read, CONFIG_COUNT, 1) != bytes([len(config)])
        ):
            return (), ("rotating gate live owner unavailable",)
        orientations = _read(read, save + SAVE_VARIABLES, len(config))
        sprite_ids = bytes(len(config)) if every_gate else _read(read, SPRITE_IDS, len(config))
        elements: list[MapElement] = []
        unavailable: list[str] = []
        for gate_id, (x, y, shape, _default) in relevant:
            group = f"gate:{gate_id}"
            orientation = orientations[gate_id]
            sprite_state = (
                "current" if every_gate else _sprite_state(read, sprite_ids[gate_id], gate_id)
            )
            if orientation > 3 or sprite_state == "unavailable":
                unavailable.append(f"{group} rotating gate state unavailable")
                continue
            if sprite_state == "transitioning":
                anchor = next(
                    p
                    for p in sorted(visible, key=lambda p: (p[1], p[0]))
                    if x - 2 <= p[0] < x + 2 and y - 2 <= p[1] < y + 2
                )
                elements.append(
                    MapElement("rotating_gate", *anchor, state="transitioning", group=group)
                )
                continue
            if every_gate or (x, y) in visible:
                elements.append(
                    MapElement(
                        "rotating_gate", x, y, state="pivot", group=group, orientation=orientation
                    )
                )
            for arm, present in enumerate(ARM_LAYOUTS[shape]):
                if not present:
                    continue
                direction = (arm // 2 + orientation) % 4
                edge = _arm_edge(x, y, direction, arm % 2)
                endpoints = ((edge[0], edge[1]), (edge[2], edge[3]))
                edge_anchor = next(
                    (p for p in endpoints if p in visible), endpoints[0] if every_gate else None
                )
                if edge_anchor is not None:
                    elements.append(
                        MapElement(
                            "rotating_gate",
                            *edge_anchor,
                            state="arm",
                            direction=DIRECTIONS[direction],
                            group=group,
                            orientation=orientation,
                            edge=edge,
                        )
                    )
        return tuple(elements), tuple(unavailable)
    except (IndexError, OSError, ValueError, struct.error):
        return (), ("rotating gate memory unavailable",)
