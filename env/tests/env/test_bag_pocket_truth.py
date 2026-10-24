"""Emerald 731ad5bf item.h enum, and 3b6e t1360 native pocket 4 -> 3."""
import struct

import pytest

from pokebench_env.game_state import MapNames
from pokebench_env.menus import BAG_CALLBACK, BAG_POSITION, read_menu_family
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.game_screen import GMAIN
from tests.env.test_menus import list_task, put_task
from tests.env.test_ui_state import Memory

ID = "bag-pocket-truth-v1"


def bag(pocket):
    m = Memory()
    m.put(GMAIN + 4, struct.pack("<I", BAG_CALLBACK))
    put_task(m, 0, 0x081ABD29, [1])
    list_task(m, 1)
    m.put(BAG_POSITION + 5, bytes([pocket]))
    return m


@pytest.mark.parametrize("pocket,label", enumerate(["ITEMS", "POKE BALLS", "TMS HMS", "BERRIES", "KEY ITEMS"]))
def test_native_pocket_names_through_production_reader(pocket, label):
    m = bag(pocket)
    off = frozenset(SERVER_FEATURES) - {"ram-state-v1", "expanded-menu-battle-information-v1"}
    legacy = read_state(m.read, MapNames({}), active_ui=True, off=off)
    fixed = read_state(m.read, MapNames({}), active_ui=True, off=off - {ID})
    old_label = ["ITEMS", "KEY ITEMS", "POKE BALLS", "TMS HMS", "BERRIES"][pocket]
    assert legacy.active_ui.details["pocket"] == old_label
    assert state_json(fixed)["active_ui"]["details"]["pocket"] == label
    assert render(fixed, off - {ID}) == render(legacy, off).replace(f"pocket: {old_label}", f"pocket: {label}")


def test_default_off_and_invalid_pocket_fail_closed():
    assert ID in SERVER_FEATURES and ID in features_off_from_env({})
    assert ID not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})
    m = bag(5)
    assert read_menu_family(m.read, BAG_CALLBACK, bag_pocket_truth=True).diagnostic
