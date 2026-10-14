"""Native owner fixtures must survive public routing into recording/model facts.

Different interfaces deliberately share callback/field task lifetimes; these
checks prevent a generic fallback masking a valid owner or dropping its facts.
"""

import json
import struct

import pytest

from pokebench_env.game_screen import GMAIN, read_screen
from pokebench_env.menu_pc import PC_ITEM_ACTION_TASK
from pokebench_env.ui_state import read_active_ui
from tests.env.test_menu_apprentice import fixture as apprentice
from tests.env.test_menu_aux import rtc
from tests.env.test_menu_cable import state as cable
from tests.env.test_menu_corner import roulette, slots
from tests.env.test_menu_dex import dex
from tests.env.test_menu_ereader import state as ereader
from tests.env.test_menu_field_widgets import scroll
from tests.env.test_menu_frontier import fixture as dome
from tests.env.test_menu_learning import learning
from tests.env.test_menu_legacy import fixture as legacy
from tests.env.test_menu_nav import nav
from tests.env.test_menu_pc import setup
from tests.env.test_menu_pokemon_lifecycle import evo
from tests.env.test_menu_save import saving
from tests.env.test_menu_title import title
from tests.env.test_menu_views import berry, card, region
from tests.env.test_menu_wireless import lobby
from tests.env.test_menus_misc import decor

CASES = [
    ("title", title, 0x080AAB2D, "title_launch"),
    ("rtc", rtc, 0x0809F091, "reset_rtc_edit"),
    ("dex", lambda: dex(0x080BB7D5), 0x080BB775, "pokedex_list"),
    ("learning", learning, 0x0816082D, "move_relearner"),
    ("nav", nav, 0x081C7401, "pokenav_menu"),
    ("card", card, 0x080C2711, "trainer_card"),
    ("berry", berry, 0x08177C55, "berry_tag"),
    ("townmap", lambda: region(0x08170275), 0x08170275, "town_map"),
    ("fly", lambda: region(0x081248D5), 0x081248D5, "fly_map"),
    ("wireless", lobby, 0x08085E5D, "wireless_choose_group"),
    ("pc", lambda: setup(PC_ITEM_ACTION_TASK, count=4), 0x08085E5D, "pc_item_storage_menu"),
    ("save", saving, 0x08085E5D, "save_confirmation"),
    ("cable", lambda: cable(0x080B275D), 0x08085E5D, "link_player_readiness"),
    ("scroll", scroll, 0x08085E5D, "field_scrollable_multichoice"),
    ("slots", slots, 0x0812A671, "slots"),
    ("roulette", roulette, 0x08140239, "roulette"),
    ("ereader", lambda: ereader(0, 1), 0x08018439, "ereader_welcome"),
    ("apprentice", apprentice, 0x08085E5D, "apprentice"),
    ("legacy", legacy, 0x08178FDD, "save_recovery"),
    ("dome", dome, 0x08194B55, "frontier_dome"),
    ("decor", decor, 0x08085E5D, "decoration"),
    ("evolution", evo, 0x0813D9B1, "evolution"),
]


@pytest.mark.parametrize("name,factory,callback,phase", CASES, ids=[c[0] for c in CASES])
def test_native_interface_contents_survive_routing_and_serialization(
    name, factory, callback, phase
):
    m = factory()
    m.put(GMAIN, struct.pack("<II", 0, callback))
    ui = read_active_ui(m.read, read_screen(m.read))
    assert ui is not None and ui.diagnostic is None
    assert ui.phase.startswith(phase)
    record = json.loads(json.dumps(ui.json()))
    assert record["phase"] == ui.phase and record["ready"] == ui.ready
    assert record["details"] == ui.details
    if ui.selected:
        assert ui.selected in ui.text()
    assert "unsupported" not in ui.text()
