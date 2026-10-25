"""Current puzzle graphics, qualified by their map rather than global tile IDs.

pret/pokeemerald 731ad5bf: rotating_tile_puzzle.c defines colored arrow rows;
the named map scripts and metatile_labels.h define buttons and door footprints.
Collision describes barrier passages; door lock graphics have their own state.
"""

from pokebench_env.live_map import MapTile
from pokebench_env.map_observation_types import MapElement

COLORS = ("yellow", "blue", "green", "purple", "red")
DIRECTIONS = ("east", "south", "west", "north")
TRICK_SHUTTERS = frozenset({(1, 13), (5, 6), (7, 15), (14, 12)})
TRICK_HORIZONTAL = {
    **dict.fromkeys((0x240, 0x241, 0x250, 0x251), "red"),
    **dict.fromkeys((0x243, 0x244, 0x253, 0x254), "blue"),
}
TRICK_VERTICAL = {
    **dict.fromkeys(((3, 8), (3, 14), (6, 5), (9, 17), (12, 8)), (0x245, 0x255, "blue")),
    **dict.fromkeys(((3, 17), (9, 5)), (0x242, 0x252, "red")),
}
NEW_BARRIERS = {
    **{
        (x, y + offset): (0x2C7 + offset * 8, 0x26D if offset == 0 else 0x281, "blue")
        for x, y in ((23, 36), (10, 18), (10, 2))
        for offset in (0, 1)
    },
    **{
        (x, y + offset): (0x2C6 + offset * 8, 0x26D if offset == 0 else 0x281, "green")
        for x, y in ((37, 35), (28, 24), (10, 26), (21, 4))
        for offset in (0, 1)
    },
}
PETALBURG_DOORS = frozenset(
    {
        (1, 105),
        (7, 105),
        (1, 79),
        (7, 79),
        (1, 92),
        (7, 92),
        (7, 40),
        (1, 53),
        (7, 53),
        (1, 66),
        (7, 14),
        (1, 27),
    }
)
PETALBURG_STATES = {
    0x220: "locked",
    0x221: "transitioning",
    0x222: "transitioning",
    0x223: "transitioning",
    0x224: "unlocked",
}
SHIP_DOORS = {
    (24, 57): {(11, 4): (0x233, 0x22B)},
    (24, 65): {
        (3, 8): (0x233, 0x22B),
        (6, 8): (0x233, 0x22B),
        (3, 3): (0x234, 0x21A),
        (9, 3): (0x234, 0x21A),
    },
}


def _colored(tile: MapTile, base: int, count: int) -> tuple[MapElement, ...]:
    delta = tile.metatile - base
    if not 0 <= delta < count * 8:
        return ()
    row, offset = divmod(delta, 8)
    if offset < 4:
        return (
            MapElement("arrow", tile.x, tile.y, direction=DIRECTIONS[offset], color=COLORS[row]),
        )
    if offset == 4:
        return (MapElement("switch", tile.x, tile.y, color=COLORS[row]),)
    # Duplicate coordinate triggers on blank offset-5 tiles do not make a visible switch.
    return ()


def _barrier(tile: MapTile, color: str | None) -> tuple[MapElement, ...]:
    return (
        MapElement(
            "barrier",
            tile.x,
            tile.y,
            state="blocked" if tile.collision else "open",
            color=color,
            group=f"barrier-{tile.x}-{tile.y}",
        ),
    )


def _footprint(tile: MapTile, expected: tuple[int, int, str] | None) -> tuple[MapElement, ...]:
    if expected is None or tile.metatile not in expected[:2]:
        return ()
    closed, _, color = expected
    return _barrier(tile, color if tile.metatile == closed else None)


def _new_mauville(tile: MapTile) -> tuple[MapElement, ...]:
    color = {0x236: "blue", 0x22E: "green", 0x23E: "red"}.get(tile.metatile)
    if color is not None or tile.metatile == 0x24F:
        return (
            MapElement(
                "switch",
                tile.x,
                tile.y,
                state="pressed" if tile.metatile == 0x24F else "raised",
                color=color,
            ),
        )
    if 32 <= tile.x <= 35 and 2 <= tile.y <= 3:
        column, row = tile.x - 32, tile.y - 2
        on = 0x2D8 + row * 8 + column
        off = 0x2F0 + row * 4 + column
        if tile.metatile in (on, off):
            return (
                MapElement(
                    "generator",
                    tile.x,
                    tile.y,
                    state="on" if tile.metatile == on else "off",
                    group="generator",
                ),
            )
    return _footprint(tile, NEW_BARRIERS.get((tile.x, tile.y)))


def tile_elements(map_id: tuple[int, int] | None, tile: MapTile) -> tuple[MapElement, ...]:
    if map_id == (14, 0):
        return _colored(tile, 0x250, 5)
    if map_id == (29, 9):
        return _colored(tile, 0x298, 4)
    if map_id in ((29, 4), (29, 5)):
        if tile.metatile in (0x258, 0x259):
            return (
                MapElement(
                    "switch",
                    tile.x,
                    tile.y,
                    state="raised" if tile.metatile == 0x258 else "pressed",
                ),
            )
        if map_id == (29, 4):
            if (tile.x, tile.y) in TRICK_SHUTTERS and tile.metatile in (0x269, 0x26A):
                return _barrier(tile, None)
            return ()
        if tile.metatile in TRICK_HORIZONTAL:
            return _barrier(tile, TRICK_HORIZONTAL[tile.metatile])
        return _footprint(tile, TRICK_VERTICAL.get((tile.x, tile.y)))
    if map_id == (24, 53):
        return _new_mauville(tile)
    if map_id == (8, 1) and (tile.x, tile.y) in PETALBURG_DOORS:
        state = PETALBURG_STATES.get(tile.metatile)
        return () if state is None else (MapElement("door", tile.x, tile.y, state=state),)
    expected = SHIP_DOORS.get(map_id, {}).get((tile.x, tile.y)) if map_id is not None else None
    if expected is not None and tile.metatile in expected:
        return (
            MapElement(
                "door",
                tile.x,
                tile.y,
                state="locked" if tile.metatile == expected[0] else "unlocked",
            ),
        )
    return ()
