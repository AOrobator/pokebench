"""Source-qualified tile facts, not predictions of puzzle effects.

pret/pokeemerald 731ad5bf: rotating_tile_puzzle.c; map scripts for the named maps;
metatile_labels.h. Synthetic tiles exercise decoding; they are not native proof.
"""

import pytest

from pokebench_env.live_map import MapTile
from pokebench_env.map_observation_types import MapElement
from pokebench_env.map_tile_elements import tile_elements


def tile(metatile, *, x=0, y=0, collision=0, behavior=0):
    return MapTile(x, y, metatile, collision, behavior, 3)


@pytest.mark.parametrize(
    "map_id,base,colors",
    [
        ((14, 0), 0x250, ("yellow", "blue", "green", "purple", "red")),
        ((29, 9), 0x298, ("yellow", "blue", "green", "purple")),
    ],
)
def test_emerald_arrows_preserve_color_and_direction(map_id, base, colors):
    for row, color in enumerate(colors):
        for offset, direction in enumerate(("east", "south", "west", "north")):
            result = tile_elements(map_id, tile(base + row * 8 + offset, x=2, y=3))
            assert result == (MapElement("arrow", 2, 3, direction=direction, color=color),)
        assert tile_elements(map_id, tile(base + row * 8 + 4)) == (
            MapElement("switch", 0, 0, color=color),
        )


@pytest.mark.parametrize("map_id,blank", [((14, 0), 0x255), ((14, 0), 0x25D), ((29, 9), 0x29D)])
def test_duplicate_script_trigger_on_blank_tile_does_not_invent_visible_switch(map_id, blank):
    assert tile_elements(map_id, tile(blank)) == ()


@pytest.mark.parametrize("map_id", [(29, 4), (29, 5)])
def test_trick_house_buttons_use_current_metatile_not_script_condition(map_id):
    assert tile_elements(map_id, tile(0x258)) == (MapElement("switch", 0, 0, state="raised"),)
    assert tile_elements(map_id, tile(0x259)) == (MapElement("switch", 0, 0, state="pressed"),)


def test_trick_house_shutters_change_without_retained_history():
    blocked = tile_elements((29, 4), tile(0x269, x=1, y=13, collision=1))
    opened = tile_elements((29, 4), tile(0x26A, x=1, y=13))
    assert blocked[0].kind == opened[0].kind == "barrier"
    assert blocked[0].state == "blocked" and opened[0].state == "open"
    assert blocked[0].group == opened[0].group
    assert tile_elements((29, 4), tile(0x26A, x=0, y=0)) == ()


@pytest.mark.parametrize(
    "closed,opened,color",
    [
        (0x240, 0x250, "red"),
        (0x241, 0x251, "red"),
        (0x243, 0x253, "blue"),
        (0x244, 0x254, "blue"),
    ],
)
def test_colored_trick_house_door_footprints(closed, opened, color):
    shut = tile_elements((29, 5), tile(closed, collision=1))[0]
    clear = tile_elements((29, 5), tile(opened))[0]
    assert (shut.kind, shut.state, shut.color) == ("barrier", "blocked", color)
    assert (clear.kind, clear.state, clear.color) == ("barrier", "open", color)


@pytest.mark.parametrize(
    "x,y,closed,opened,color",
    [
        (3, 8, 0x245, 0x255, "blue"),
        (3, 14, 0x245, 0x255, "blue"),
        (6, 5, 0x245, 0x255, "blue"),
        (9, 17, 0x245, 0x255, "blue"),
        (12, 8, 0x245, 0x255, "blue"),
        (3, 17, 0x242, 0x252, "red"),
        (9, 5, 0x242, 0x252, "red"),
    ],
)
def test_vertical_trick_doors_qualify_ordinary_open_floor_by_footprint(x, y, closed, opened, color):
    shut = tile_elements((29, 5), tile(closed, x=x, y=y, collision=1))[0]
    clear = tile_elements((29, 5), tile(opened, x=x, y=y))[0]
    assert (shut.kind, shut.state, shut.color) == ("barrier", "blocked", color)
    assert (clear.kind, clear.state, clear.color) == ("barrier", "open", None)
    assert tile_elements((29, 5), tile(opened, x=0, y=0)) == ()


def test_new_mauville_buttons_and_generator_switch_are_visually_distinct():
    for metatile, color in [(0x236, "blue"), (0x22E, "green"), (0x23E, "red")]:
        assert tile_elements((24, 53), tile(metatile)) == (
            MapElement("switch", 0, 0, state="raised", color=color),
        )
    assert tile_elements((24, 53), tile(0x24F, behavior=0x0B)) == (
        MapElement("switch", 0, 0, state="pressed"),
    )


def test_generator_state_comes_from_changed_current_graphics_only():
    for row in range(2):
        for column in range(4):
            x, y = 32 + column, 2 + row
            on = tile(0x2D8 + row * 8 + column, x=x, y=y, collision=1)
            off = tile(0x2F0 + row * 4 + column, x=x, y=y, collision=1)
            assert tile_elements((24, 53), on) == (
                MapElement("generator", x, y, state="on", group="generator"),
            )
            assert tile_elements((24, 53), off) == (
                MapElement("generator", x, y, state="off", group="generator"),
            )
    assert tile_elements((24, 53), tile(0x2E8, x=32, y=4, collision=1)) == ()
    assert tile_elements((24, 53), tile(0x2F0, x=0, y=0, collision=1)) == ()


@pytest.mark.parametrize(
    "x,y,closed,opened,color",
    [
        (23, 36, 0x2C7, 0x26D, "blue"),
        (23, 37, 0x2CF, 0x281, "blue"),
        (10, 18, 0x2C7, 0x26D, "blue"),
        (10, 19, 0x2CF, 0x281, "blue"),
        (10, 2, 0x2C7, 0x26D, "blue"),
        (10, 3, 0x2CF, 0x281, "blue"),
        (37, 35, 0x2C6, 0x26D, "green"),
        (37, 36, 0x2CE, 0x281, "green"),
        (28, 24, 0x2C6, 0x26D, "green"),
        (28, 25, 0x2CE, 0x281, "green"),
        (10, 26, 0x2C6, 0x26D, "green"),
        (10, 27, 0x2CE, 0x281, "green"),
        (21, 4, 0x2C6, 0x26D, "green"),
        (21, 5, 0x2CE, 0x281, "green"),
    ],
)
def test_new_mauville_barrier_walkway_footprints(x, y, closed, opened, color):
    shut = tile_elements((24, 53), tile(closed, x=x, y=y, collision=1))[0]
    clear = tile_elements((24, 53), tile(opened, x=x, y=y))[0]
    assert (shut.kind, shut.state, shut.color) == ("barrier", "blocked", color)
    assert (clear.kind, clear.state, clear.color) == ("barrier", "open", None)
    assert shut.group == clear.group
    assert tile_elements((24, 53), tile(opened, x=0, y=0)) == ()


def test_barrier_upper_graphics_are_not_walkway_footprints():
    assert tile_elements((24, 53), tile(0x269, x=23, y=34, collision=1)) == ()
    assert tile_elements((29, 5), tile(0x238)) == ()
    assert tile_elements((29, 5), tile(0x23D, x=3, y=7, collision=1)) == ()


@pytest.mark.parametrize(
    "metatile,state",
    [
        (0x220, "locked"),
        (0x221, "transitioning"),
        (0x222, "transitioning"),
        (0x223, "transitioning"),
        (0x224, "unlocked"),
    ],
)
def test_petalburg_unlock_is_not_inferred_from_collision(metatile, state):
    door = tile_elements((8, 1), tile(metatile, x=1, y=105, collision=1))[0]
    assert (door.kind, door.state) == ("door", state)
    assert tile_elements((8, 1), tile(metatile, x=0, y=0, collision=1)) == ()


@pytest.mark.parametrize(
    "map_id,x,y,metatile,state",
    [
        ((24, 57), 11, 4, 0x233, "locked"),
        ((24, 57), 11, 4, 0x22B, "unlocked"),
        ((24, 65), 3, 8, 0x233, "locked"),
        ((24, 65), 6, 8, 0x22B, "unlocked"),
        ((24, 65), 3, 3, 0x234, "locked"),
        ((24, 65), 9, 3, 0x21A, "unlocked"),
    ],
)
def test_ship_door_graphics_own_lock_state(map_id, x, y, metatile, state):
    door = tile_elements(map_id, tile(metatile, x=x, y=y, collision=1))[0]
    assert (door.kind, door.state) == ("door", state)


@pytest.mark.parametrize("map_id", [None, (0, 0), (14, 1), (29, 8), (24, 54)])
def test_other_map_tilesets_never_borrow_puzzle_meanings(map_id):
    for metatile in (0x250, 0x254, 0x258, 0x269, 0x236, 0x220, 0x233):
        assert tile_elements(map_id, tile(metatile)) == ()
