import struct
from dataclasses import replace

from pokebench_env.interface_guidance import interface_guidance
from pokebench_env.menu_nav import NAV_CALLBACK
from pokebench_env.rerender import read_state
from pokebench_env.ui_state import ActiveUi
from tests.env.test_menu_nav import HANDLER, RESOURCE, nav
from tests.env.test_game_state import MAPS


def test_forced_call_controls_are_native_and_mode_specific() -> None:
    ui = ActiveUi("pokenav_menu", "HOENN MAP", True, "old", details={"pokenav_mode": 1, "input_callback": "0x081C9521", "menu_type": 1})
    assert interface_guidance(ui).controls == "UP/DOWN selects; A opens MATCH CALL only; B cannot exit during this tutorial"
    assert interface_guidance(replace(ui, details={"pokenav_mode": 2, "input_callback": "0x081C9589", "menu_type": 1})).controls == "UP/DOWN selects; A opens MATCH CALL or SWITCH OFF only; B exits"
    for other in [None, replace(ui, ready=False), replace(ui, diagnostic="unknown"), replace(ui, details={"pokenav_mode": 0}), replace(ui, phase="unknown"), replace(ui, details={"pokenav_mode": 1, "input_callback": "0x081C943D", "menu_type": 1})]:
        assert interface_guidance(other) is other


def test_match_call_list_and_options_have_different_cancel_meanings() -> None:
    ui = ActiveUi("pokenav_match_call", "MR. STONE", True, "old", details={"pokenav_mode": 1, "input_callback": "0x081CAB45"})
    assert "B cannot exit" in interface_guidance(ui).controls
    options = replace(ui, selected="CALL", details={"pokenav_mode": 1, "input_callback": "0x081CAC05"})
    assert "B returns to the contact list" in interface_guidance(options).controls
    assert interface_guidance(replace(ui, phase="pokenav_match_call_call")) .controls == "old"


def test_production_reader_switch_reaches_typed_ui_and_off_is_unchanged() -> None:
    memory = nav()
    memory.put(0x030022C4, struct.pack("<I", NAV_CALLBACK))
    memory.put(RESOURCE + 8, struct.pack("<H", 1))
    memory.put(HANDLER, struct.pack("<HhHHII", 1, 0, 0, 0, 100000, 0x081C9521))
    off = read_state(memory.read, MAPS, active_ui=True, off=frozenset({"interface-guidance-v1"}))
    on = read_state(memory.read, MAPS, active_ui=True, off=frozenset())
    assert off.active_ui.controls == "UP/DOWN selects; A accepts; B returns"
    assert on.active_ui.controls == "UP/DOWN selects; A opens MATCH CALL only; B cannot exit during this tutorial"
    assert replace(on, active_ui=off.active_ui) == off
