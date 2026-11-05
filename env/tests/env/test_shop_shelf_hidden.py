"""shop-shelf-hidden-v1: scriptless decoration and shop shelves leave the interaction list."""

import struct

from test_game_state import MAPS, OVERWORLD, SB1, game
from test_live_map import tile
from test_world import events

from pokebench_env.readout import (
    SERVER_FEATURES,
    features_off_from_env,
    format_readout,
    state_json,
)
from pokebench_env.rerender import read_state
from pokebench_env.world import SHOP_SHELF_SWITCH, read_targets

SHELF, TRASH_CAN = 0xE5, 0xE4


def shop():
    """A shelf at (4,4), a trash can at (4,3), a sign, a hidden item and a scriptless sign."""
    m = events()
    m.put(0x02007004, struct.pack("<H", SHELF))
    m.put(0x02007006, struct.pack("<H", TRASH_CAN))
    tile(m, 4, 4, 2)
    tile(m, 4, 3, 3)
    m.put(0x02002000, bytes([1, 1, 1, 4]))
    m.put(
        0x08003000,
        struct.pack("<HHBB2xI", 3, 1, 0, 1, 0x08006000)
        + struct.pack("<HHBB2xI", 4, 1, 0, 7, 0x00100001)
        + struct.pack("<HHBB2xI", 9, 58, 0, 0, 0)
        + struct.pack("<HHBB2xI", 5, 1, 0, 7, 0),
    )
    return m


def kinds(targets):
    return [(t.kind, t.x, t.y) for t in targets]


def test_off_keeps_every_target_in_order():
    assert kinds(read_targets(shop().read, (1, 0))) == [
        ("warp", 0, 1),
        ("coordinate_trigger", 4, 4),
        ("background", 3, 1),
        ("hidden_item", 4, 1),
        ("background", 9, 58),
        ("hidden_item", 5, 1),
        ("metatile_trash_can", 4, 3),
        ("metatile_shop_shelf", 4, 4),
    ]


def test_on_drops_only_the_shelf_and_the_scriptless_sign():
    assert kinds(read_targets(shop().read, (1, 0), hide_decoration=True)) == [
        ("warp", 0, 1),
        ("coordinate_trigger", 4, 4),
        ("background", 3, 1),
        ("hidden_item", 4, 1),
        ("hidden_item", 5, 1),
        ("metatile_trash_can", 4, 3),
    ]


def test_unavailable_terrain_still_withholds_the_inventory():
    m = shop()
    m.put(0x0203731C, bytes(4))
    assert read_targets(m.read, (1, 0), hide_decoration=True) is None


def memory():
    m = game(OVERWORLD)
    m.cells.update(shop().cells)
    m.put(SB1 + 4, bytes([1, 0]))
    return m


def views(off):
    state = read_state(memory().read, MAPS, active_ui=False, off=off)
    return format_readout(state, off, named_interactions=True), state_json(state)


def test_production_path_honors_the_switch_in_text_and_json():
    off = features_off_from_env({})
    hidden_text, hidden_json = views(off - {SHOP_SHELF_SWITCH})
    shown_text, shown_json = views(off)
    assert "shop shelf at (4,4)" in shown_text
    assert "(9,58)" in shown_text
    assert "metatile_shop_shelf" in [t["kind"] for t in shown_json["interaction_targets"]]
    assert "shop shelf" not in hidden_text
    assert "(9,58)" not in hidden_text
    assert "trash can at (4,3)" in hidden_text
    assert "metatile_shop_shelf" not in [t["kind"] for t in hidden_json["interaction_targets"]]


def test_the_map_data_does_not_change():
    off = features_off_from_env({})
    _, hidden = views(off - {SHOP_SHELF_SWITCH})
    _, shown = views(off)
    assert {k: v for k, v in hidden.items() if k != "interaction_targets"} == {
        k: v for k, v in shown.items() if k != "interaction_targets"
    }


def test_switch_is_a_default_off_server_switch():
    assert SERVER_FEATURES[-1] == SHOP_SHELF_SWITCH == "shop-shelf-hidden-v1"
    assert SHOP_SHELF_SWITCH in features_off_from_env({})
