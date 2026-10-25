"""Current tile facts from pokeemerald731ad5b metatile_behaviors.h.

The forced-movement table in field_player_avatar.c distinguishes slipping, walking,
sliding, currents, jumping and spinning. These annotations never select an action.
"""

from dataclasses import replace

from pokebench_env.live_map import MapTile
from pokebench_env.map_observation_types import MapElement

_TERRAIN: dict[int, MapElement] = {
    0x02: MapElement("encounter_ground", 0, 0, state="grass"),
    0x03: MapElement("encounter_ground", 0, 0, state="long_grass"),
    0x06: MapElement("encounter_ground", 0, 0, state="deep_sand"),
    0x07: MapElement("ground", 0, 0, state="short_grass"),
    0x08: MapElement("encounter_ground", 0, 0, state="cave"),
    0x09: MapElement("ground", 0, 0, state="long_grass_edge"),
    0x0A: MapElement("ground", 0, 0, state="no_running"),
    0x0B: MapElement("encounter_ground", 0, 0, state="indoor"),
    0x0C: MapElement("ground", 0, 0, state="mountain"),
    0x0D: MapElement("pyramid_exit", 0, 0),
    0x0E: MapElement("warp", 0, 0, state="teleporter"),
    0x0F: MapElement("hole", 0, 0, state="floor_drop"),
    0x10: MapElement("water", 0, 0, state="pond"),
    0x11: MapElement("water", 0, 0, state="deep"),
    0x12: MapElement("water", 0, 0, state="deep"),
    0x13: MapElement("waterfall", 0, 0, direction="south"),
    0x14: MapElement("water", 0, 0, state="deep"),
    0x15: MapElement("water", 0, 0, state="ocean"),
    0x16: MapElement("water", 0, 0, state="puddle"),
    0x17: MapElement("water", 0, 0, state="shallow"),
    0x19: MapElement("water", 0, 0, state="no_surfacing"),
    0x1B: MapElement("warp", 0, 0, state="stairs", direction="north"),
    0x1C: MapElement("warp", 0, 0, state="cave_entrance", direction="south"),
    0x20: MapElement("ice", 0, 0),
    0x21: MapElement("ground", 0, 0, state="sand"),
    0x22: MapElement("water", 0, 0, state="seaweed"),
    0x24: MapElement("encounter_ground", 0, 0, state="ash_grass"),
    0x25: MapElement("encounter_ground", 0, 0, state="footprints"),
    0x26: MapElement("ice", 0, 0, state="thin"),
    0x27: MapElement("ice", 0, 0, state="cracked"),
    0x28: MapElement("water", 0, 0, state="hot_spring"),
    0x29: MapElement("warp", 0, 0, state="floor_up"),
    0x2A: MapElement("water", 0, 0, state="seaweed_no_surfacing"),
    0x2B: MapElement("bridge", 0, 0, state="reflection_below"),
    0x48: MapElement("slippery_floor", 0, 0),
    0x60: MapElement("warp", 0, 0, state="door"),
    0x61: MapElement("warp", 0, 0, state="ladder"),
    0x66: MapElement("hole", 0, 0, state="cracked_floor"),
    0x67: MapElement("warp", 0, 0, state="teleport_pad"),
    0x68: MapElement("warp", 0, 0, state="floor_down"),
    0x69: MapElement("warp", 0, 0, state="animated_door", direction="north"),
    0x6A: MapElement("warp", 0, 0, state="escalator_up"),
    0x6B: MapElement("warp", 0, 0, state="escalator_down"),
    0x6C: MapElement("warp", 0, 0, state="water_door"),
    0x6D: MapElement("warp", 0, 0, state="water_exit", direction="south"),
    0x6E: MapElement("warp", 0, 0, state="deep_water_exit"),
    0x70: MapElement("bridge", 0, 0, state="over_ocean"),
    0x71: MapElement("bridge", 0, 0, state="over_pond_low"),
    0x72: MapElement("bridge", 0, 0, state="over_pond_medium"),
    0x73: MapElement("bridge", 0, 0, state="over_pond_high"),
    0x74: MapElement("log", 0, 0, state="vertical_top"),
    0x75: MapElement("log", 0, 0, state="vertical_bottom"),
    0x76: MapElement("log", 0, 0, state="horizontal_left"),
    0x77: MapElement("log", 0, 0, state="horizontal_right"),
    0x78: MapElement("bridge", 0, 0, state="wooden"),
    0x7A: MapElement("bridge", 0, 0, state="over_pond_medium_edge_1"),
    0x7B: MapElement("bridge", 0, 0, state="over_pond_medium_edge_2"),
    0x7C: MapElement("bridge", 0, 0, state="over_pond_high_edge_1"),
    0x7D: MapElement("bridge", 0, 0, state="over_pond_high_edge_2"),
    0x7E: MapElement("bridge", 0, 0, state="over_water"),
    0x7F: MapElement("bridge", 0, 0, state="over_barrier"),
    0x8B: MapElement("closed_door", 0, 0),
    0x8C: MapElement("puzzle_door", 0, 0),
    0x8D: MapElement("room_door", 0, 0),
    0xB8: MapElement("decoration", 0, 0, state="balloon"),
    0xB9: MapElement("decoration", 0, 0, state="impassable"),
    0xBA: MapElement("decoration", 0, 0, state="glitter_mat"),
    0xBB: MapElement("jump_mat", 0, 0),
    0xBC: MapElement("spin_mat", 0, 0),
    0xBD: MapElement("decoration", 0, 0, state="sound_mat"),
    0xBE: MapElement("decoration", 0, 0, state="breakable_door"),
    0xBF: MapElement("decoration", 0, 0, state="sand_ornament"),
    0xC2: MapElement("hole", 0, 0, state="decoration"),
    0xD0: MapElement("muddy_slope", 0, 0),
    0xD1: MapElement("bumpy_slope", 0, 0),
    0xD2: MapElement("cracked_floor", 0, 0),
    0xD3: MapElement("rail", 0, 0, state="isolated_vertical"),
    0xD4: MapElement("rail", 0, 0, state="isolated_horizontal"),
    0xD5: MapElement("rail", 0, 0, state="vertical"),
    0xD6: MapElement("rail", 0, 0, state="horizontal"),
    0xEA: MapElement("closed_door", 0, 0),
}

for _start, _kind in ((0x40, "forced_walk"), (0x44, "forced_slide"), (0x50, "current")):
    for _offset, _direction in enumerate(("east", "west", "north", "south")):
        _TERRAIN[_start + _offset] = MapElement(_kind, 0, 0, direction=_direction)

for _offset, _direction in enumerate(("east", "west", "north", "south")):
    _TERRAIN[0x62 + _offset] = MapElement("warp", 0, 0, state="arrow", direction=_direction)

for _offset, _group in enumerate(
    ("red_cave", "brown_cave", "yellow_cave", "tree_left", "shrub", "blue_cave", "tree_right")
):
    _TERRAIN[0x90 + 2 * _offset] = MapElement(
        "secret_base_entrance", 0, 0, state=f"{_group}_closed"
    )
    _TERRAIN[0x91 + 2 * _offset] = MapElement("secret_base_entrance", 0, 0, state=f"{_group}_open")

# field_tasks.c animates these metatiles without changing their shared behavior.
_LOGS = {
    (0x76, 0x250): "horizontal_left_floating",
    (0x76, 0x252): "horizontal_left_half_submerged",
    (0x76, 0x254): "horizontal_left_submerged",
    (0x77, 0x251): "horizontal_right_floating",
    (0x77, 0x253): "horizontal_right_half_submerged",
    (0x77, 0x255): "horizontal_right_submerged",
    (0x74, 0x258): "vertical_top_floating",
    (0x74, 0x259): "vertical_top_half_submerged",
    (0x74, 0x25A): "vertical_top_submerged",
    (0x75, 0x260): "vertical_bottom_floating",
    (0x75, 0x261): "vertical_bottom_half_submerged",
    (0x75, 0x262): "vertical_bottom_submerged",
}
_BRIDGES = {
    0x24E: "wooden_raised",
    0x24F: "wooden_lowered",
    0x256: "wooden_raised",
    0x257: "wooden_lowered",
}


def terrain_elements(
    tile: MapTile, map_id: tuple[int, int] | None = None
) -> tuple[MapElement, ...]:
    template = _TERRAIN.get(tile.behavior)
    if map_id == (0, 15) and (state := _LOGS.get((tile.behavior, tile.metatile))) is not None:
        template = MapElement("log", 0, 0, state=state)
    elif map_id == (0, 4) and tile.behavior == 0x78:
        state = _BRIDGES.get(tile.metatile)
        if state is not None:
            template = MapElement("bridge", 0, 0, state=state)
    return () if template is None else (replace(template, x=tile.x, y=tile.y),)
