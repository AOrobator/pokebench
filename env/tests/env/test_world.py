import struct

import pytest
from test_live_map import loaded, obj

from pokebench_env.world import read_targets


def events():
    m = loaded()
    m.put(
        0x02002000,
        bytes([1, 1, 1, 2]) + struct.pack("<IIII", 0x08001000, 0x02009000, 0x08002000, 0x08003000),
    )
    body = bytearray(24)
    body[0] = 2
    struct.pack_into("<I", body, 16, 0x08004000)
    m.put(0x08001000, body)
    m.put(0x08002000, struct.pack("<hhBxHH2xI", 4, 4, 3, 0x4001, 1, 0x08005000))
    m.put(
        0x08003000,
        struct.pack("<HHBB2xI", 3, 1, 0, 1, 0x08006000)
        + struct.pack("<HHBB2xI", 4, 1, 0, 7, 0x00100001),
    )
    return m


def test_all_events_use_world_coordinates_and_live_object_positions():
    m = events()
    obj(m, 1, 4, 3)
    targets = read_targets(m.read, (1, 0))
    assert targets is not None
    assert [(t.kind, t.x, t.y) for t in targets] == [
        ("object", 4, 3),
        ("warp", 0, 1),
        ("coordinate_trigger", 4, 4),
        ("background", 3, 1),
        ("hidden_item", 4, 1),
    ]
    assert targets[3].facing == "up"
    assert targets[0].availability == "conditional"
    assert targets[2].activation == "step"
    assert targets[4].availability == "conditional"


def test_null_script_decoration_is_a_live_object_not_an_interaction_target():
    m = events()
    m.put(0x08001010, bytes(4))
    assert all(t.kind != "object" for t in read_targets(m.read, (1, 0)))


@pytest.mark.parametrize("address", [0x0203731C, 0x02002004, 0x02002008, 0x0200200C, 0x02002010])
def test_invalid_event_pointer_returns_unavailable_not_empty(address):
    m = events()
    m.put(address, bytes(4))
    assert read_targets(m.read, (1, 0)) is None


def test_background_unknown_kind_is_not_assumed_to_be_sign():
    m = events()
    m.put(0x08003005, b"\x09")
    assert read_targets(m.read, (1, 0))[3].kind == "background_unknown"


def test_behavior_targets_scan_entire_live_map_and_ignore_ordinary_decorations():
    from test_live_map import tile

    m = events()
    # Three known script behaviors in both tilesets, and an ordinary decoration.
    m.put(0x02007004, struct.pack("<H", 0x83))  # PC
    m.put(0x02007006, struct.pack("<H", 0x86))  # TV
    m.put(0x02008010, struct.pack("<H", 0xE4))  # trash can
    tile(m, 4, 4, 2 | (3 << 12))
    tile(m, 4, 3, 3)
    tile(m, 4, 2, 520)
    targets = read_targets(m.read, (1, 0))
    terrain = [t for t in targets if t.kind.startswith("metatile_")]
    assert [(t.kind, t.x, t.y) for t in terrain] == [
        ("metatile_trash_can", 2, 1),
        ("metatile_trash_can", 4, 2),
        ("metatile_television", 4, 3),
        ("metatile_pc", 4, 4),
    ]
    assert terrain[2].facing == "up"
    assert terrain[3].elevation == 3


def test_no_event_definitions_means_empty_not_phantom_targets():
    m = loaded()
    m.put(0x02002000, bytes(20))
    assert read_targets(m.read, (1, 0)) == ()


def test_null_coordinate_script_and_inactive_objects_are_not_targets():
    m = events()
    m.put(0x0800200C, bytes(4))
    m.put(0x02037350 + 0x24, b"\0")
    targets = read_targets(m.read, (1, 0))
    assert all(t.kind not in ("object", "coordinate_trigger") for t in targets)


def test_secret_base_kind_has_facing_and_conditional_availability():
    m = events()
    m.put(0x08003005, b"\x08")
    target = read_targets(m.read, (1, 0))[3]
    assert target.kind == "secret_base" and target.facing == "up"
    assert "conditional" in target.text() and "face up" in target.text()


@pytest.mark.parametrize(
    "address,body",
    [
        (0x03005DC0, bytes(12)),
        (0x03005DC0, struct.pack("<III", 1000, 1000, 0x02005000)),
        (0x02037318, bytes(4)),
        (0x02001010, bytes(8)),
        (0x02003010, bytes(4)),
    ],
)
def test_metatile_layout_unavailable_withholds_complete_target_inventory(address, body):
    m = events()
    m.put(address, body)
    assert read_targets(m.read, (1, 0)) is None


def test_target_json_and_text_propagate_from_production_reader():
    from test_game_state import MAPS, OVERWORLD, SB1, game

    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout, state_json

    m = game(OVERWORLD)
    m.cells.update(events().cells)
    m.put(SB1 + 4, bytes([1, 0]))
    m.put(0x02037350 + 16, struct.pack("<hh", 8, 8))
    state = read_game_state(m.read, MAPS)
    assert state_json(state)["interaction_targets"][3]["facing"] == "up"
    assert "background at (3,1)" in format_readout(state)
    assert "Map interaction candidates" in format_readout(state)


def test_warp_target_text_keeps_destination_and_dynamic_sentinel():
    m = events()
    assert "destination map 0/9 warp 0" in read_targets(m.read, (1, 0))[1].text()
    m.put(0x02009000, struct.pack("<hhBBBB", 0, 1, 0, 2, 127, 127))
    assert "dynamic destination" in read_targets(m.read, (1, 0))[1].text()


def test_object_local_id_survives_motion_and_slot_change_but_is_map_scoped():
    m = events()
    first = [t for t in read_targets(m.read, (1, 0)) if t.kind == "object"][0]
    # A despawn/reload may choose a different live array slot; semantic identity
    # follows the map template's localId, not that volatile slot.
    m.put(0x02037350 + 0x24, bytes(0x24))
    obj(m, 5, 3, 4)
    moved = [t for t in read_targets(m.read, (1, 0)) if t.kind == "object"][0]
    assert first.local_id == moved.local_id == 2
    assert (moved.x, moved.y) == (3, 4)
    assert all(t.kind != "object" for t in read_targets(m.read, (2, 0)))
