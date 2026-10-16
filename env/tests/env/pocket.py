"""The Route 101 ledge pocket from the showcase run (turn 457), from its navigation_grid."""

import json
from pathlib import Path

from pokebench_env.game_state import GameState
from pokebench_env.live_map import LocalMap, MapTile, _symbol
from pokebench_env.running import RunningPermission
from pokebench_env.topology import Connection, Topology

FIXTURE = Path(__file__).resolve().parent / "fixtures/route101-ledge-pocket-t457.json"
RECORDED = json.loads(FIXTURE.read_text())


def pocket_map(position: tuple[int, int] = (8, 7), radius: int = 7) -> LocalMap:
    tiles = {(x, y): MapTile(x, y, 0, c, b, e) for x, y, c, b, e in RECORDED["tiles"]}
    objects = tuple((i, x, y) for i, x, y in RECORDED["objects"])
    px, py = position
    origin = (px - radius, py - radius)
    rows = []
    shown = []
    for y in range(py - radius, py + radius + 1):
        row = ""
        for x in range(px - radius, px + radius + 1):
            tile = tiles.get((x, y))
            if tile is None:
                row += "?"
                continue
            shown.append(tile)
            row += _symbol(
                (x, y),
                position,
                {(a, b) for _, a, b in objects},
                set(),
                tile.collision,
                tile.behavior,
            )
        rows.append(row)
    return LocalMap(origin, tuple(rows), tuple(shown), objects, ())


def pocket_topology() -> Topology:
    return Topology(
        RECORDED["topology"]["width"],
        RECORDED["topology"]["height"],
        tuple(
            Connection(c["direction"], c["offset"], tuple(c["destination"]), c["destination_name"])
            for c in RECORDED["topology"]["connections"]
        ),
    )


def pocket_state(position: tuple[int, int] = (8, 7), avatar_flags: int | None = 1) -> GameState:
    nearby = pocket_map(position)
    return GameState(
        screen="overworld",
        started=True,
        name="ASH",
        location="ROUTE101",
        map_id=(0, 16),
        position=position,
        facing="up",
        in_battle=False,
        party=(),
        money=3000,
        badges=(),
        play_time=(0, 28, 20),
        field_controls_locked=False,
        local_map=nearby.text(),
        nearby=nearby,
        topology=pocket_topology(),
        player_elevation=3,
        running=RunningPermission(True, True, "ok", avatar_flags=avatar_flags),
    )
