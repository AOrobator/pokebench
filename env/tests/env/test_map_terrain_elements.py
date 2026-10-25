"""Source: pokeemerald731ad5b metatile_behaviors.h and metatile_behavior.c."""

from dataclasses import replace

import pytest

from pokebench_env.live_map import MapTile
from pokebench_env.map_terrain_elements import terrain_elements


def tile(behavior: int) -> MapTile:
    return MapTile(4, 7, 0x220, 0, behavior, 3)


@pytest.mark.parametrize(
    "behavior,kind,state",
    [
        (0x20, "ice", None),
        (0x26, "ice", "thin"),
        (0x27, "ice", "cracked"),
        (0x48, "slippery_floor", None),
        (0xBB, "jump_mat", None),
        (0xBC, "spin_mat", None),
        (0xD0, "muddy_slope", None),
        (0xD1, "bumpy_slope", None),
        (0xD2, "cracked_floor", None),
        (0x0F, "hole", "floor_drop"),
        (0x66, "hole", "cracked_floor"),
        (0xC2, "hole", "decoration"),
        (0x11, "water", "deep"),
        (0x12, "water", "deep"),
        (0x14, "water", "deep"),
        (0x19, "water", "no_surfacing"),
        (0x2A, "water", "seaweed_no_surfacing"),
        (0x70, "bridge", "over_ocean"),
        (0x78, "bridge", "wooden"),
        (0x7F, "bridge", "over_barrier"),
        (0x8B, "closed_door", None),
        (0x8C, "puzzle_door", None),
        (0x8D, "room_door", None),
        (0xEA, "closed_door", None),
        (0x0D, "pyramid_exit", None),
    ],
)
def test_current_terrain_identity_is_not_collapsed_to_plain_floor(behavior, kind, state):
    elements = terrain_elements(tile(behavior))
    assert len(elements) == 1
    element = elements[0]
    assert (element.kind, element.state, element.x, element.y) == (kind, state, 4, 7)
    assert element.color is None
    assert element.orientation is None


@pytest.mark.parametrize(
    "start,kind",
    [(0x40, "forced_walk"), (0x44, "forced_slide"), (0x50, "current")],
)
def test_forced_movement_preserves_kind_and_each_current_direction(start, kind):
    elements = [terrain_elements(tile(start + i))[0] for i in range(4)]
    assert [e.kind for e in elements] == [kind] * 4
    assert [e.direction for e in elements] == ["east", "west", "north", "south"]
    assert len({(e.kind, e.direction) for e in elements}) == 4


def test_slipping_is_not_spinning_and_rails_keep_axis_and_isolation():
    assert terrain_elements(tile(0x48))[0].kind != terrain_elements(tile(0xBC))[0].kind
    rails = [terrain_elements(tile(b))[0] for b in range(0xD3, 0xD7)]
    assert [(e.kind, e.state) for e in rails] == [
        ("rail", "isolated_vertical"),
        ("rail", "isolated_horizontal"),
        ("rail", "vertical"),
        ("rail", "horizontal"),
    ]


def test_secret_base_open_and_closed_are_live_behavior_not_predicted_unlocks():
    for behavior in range(0x90, 0x9E, 2):
        closed = terrain_elements(tile(behavior))[0]
        opened = terrain_elements(tile(behavior + 1))[0]
        assert closed.kind == opened.kind == "secret_base_entrance"
        assert closed.state == "closed"
        assert opened.state == "open"
        assert closed.group == opened.group


def test_water_door_does_not_inherit_bugfix_only_no_surfacing_behavior():
    door = terrain_elements(tile(0x6C))[0]
    assert (door.kind, door.state) == ("warp", "water_door")
    assert door.direction is None


def test_provider_never_mutates_geometry_or_infers_door_lock_from_collision():
    original = tile(0x8C)
    for collision in range(4):
        changed = replace(original, collision=collision)
        element = terrain_elements(changed)[0]
        assert element.state is None
        assert changed == replace(original, collision=collision)
    assert original == tile(0x8C)
    assert terrain_elements(tile(0)) == ()
    assert terrain_elements(tile(0xFF)) == ()

