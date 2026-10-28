"""pokenav-short-list-v1: PokéNav lists shorter than their window.

Source: pokeemerald 731ad5bf pokenav_list.c CopyPokenavListTemplate sets
entriesOnscreen = maxShowed (8 for Match Call) without clamping it to listLength;
pokenav_match_call_gfx.c DoMatchCallMessage prints sText_CallingDots before
PrintMatchCallMessage buffers the call into gStringVar4.
Native case: a702 (Qwen3.6 bundle, 2026-10-27) turns 641-661, the Match Call
tutorial with one contact (MR. STONE): top 0, length 1, row 0, shown 8.
"""

import json
import struct
from pathlib import Path

import pytest

from pokebench_env.menu_nav import NAV_CALLBACK, read_nav_ui
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import read_state, render
from tests.env.test_exit_labels import maps, operator_rom
from tests.env.test_menu_nav import LIST, nav

SWITCH = "pokenav-short-list-v1"
FIXTURE = Path(__file__).parent / "fixtures/pokenav-short-list-a702"
MANIFEST = json.loads((FIXTURE / "manifest.json").read_text())
ERROR = "invalid PokeNav list length/cursor/item size"


def native(name: str):  # type: ignore[no-untyped-def]
    case = MANIFEST["cases"][name]
    return load_raw_ram(FIXTURE / case["raw_ram"], case["sha256"], rom=operator_rom())


def a702_off(switch: bool) -> frozenset[str]:
    on = set(MANIFEST["harness_server_features"]) | ({SWITCH} if switch else set())
    return frozenset(f for f in SERVER_FEATURES if f not in on)


def short(top: int, length: int, row: int, shown: int):  # type: ignore[no-untyped-def]
    memory = nav(11)
    memory.put(LIST + 0x888, struct.pack("<5H2xII", top, length, 0, row, shown, 4, 0x02025000))
    return memory


def test_synthetic_one_entry_window_off_is_the_old_error_on_reads_the_contact() -> None:
    memory = short(0, 1, 0, 8)
    off = read_nav_ui(memory.read, NAV_CALLBACK)
    on = read_nav_ui(memory.read, NAV_CALLBACK, short_list=True)
    assert off is not None and off.diagnostic == ERROR
    assert on is not None and on.diagnostic is None
    assert on.phase == "pokenav_match_call"
    assert on.selected == "ROXANNE"
    assert on.details is not None and on.details["list_count"] == 1


@pytest.mark.parametrize(
    ("top", "length", "row", "shown"),
    [(0, 0, 0, 8), (0, 1, 1, 8), (1, 1, 0, 8), (0, 2, 0, 0), (0, 427, 0, 8)],
)
def test_on_still_rejects_cursor_outside_the_list(
    top: int, length: int, row: int, shown: int
) -> None:
    ui = read_nav_ui(short(top, length, row, shown).read, NAV_CALLBACK, short_list=True)
    assert ui is not None and ui.diagnostic == ERROR


def test_full_window_lists_read_the_same_either_way() -> None:
    for index in (8, 11):
        memory = nav(index)
        assert read_nav_ui(memory.read, NAV_CALLBACK) == read_nav_ui(
            memory.read, NAV_CALLBACK, short_list=True
        )


@pytest.mark.parametrize("name", ["list", "list_before_call", "list_after_call"])
def test_a702_match_call_list_off_is_the_recorded_error_on_names_mr_stone(name: str) -> None:
    read = native(name)
    off = read_nav_ui(read, NAV_CALLBACK)
    on = read_nav_ui(read, NAV_CALLBACK, short_list=True)
    assert off is not None and off.diagnostic == ERROR
    assert on is not None and on.diagnostic is None and on.ready is True
    assert on.selected == "MR. STONE"
    assert on.details is not None
    assert on.details["trainer_description"] == "DEVON PRES"
    assert on.details["visible_trainer_names"] == ["MR. STONE"]


def test_a702_calling_dots_report_no_stale_message() -> None:
    # Turn 654 state: the screen shows the calling dots; gStringVar4 still holds the
    # Scientist's "Please select the POKéNAV." from turn 636.
    ui = read_nav_ui(native("call"), NAV_CALLBACK, short_list=True)
    assert ui is not None and ui.phase == "pokenav_match_call_call" and ui.diagnostic is None
    assert ui.details is not None and "message" not in ui.details


def test_a702_readout_off_keeps_the_recorded_text_on_shows_controls() -> None:
    for name in ("list", "list_before_call"):
        read = native(name)
        before = render(
            read_state(read, maps(), active_ui=True, off=a702_off(False)), a702_off(False)
        )
        after = render(read_state(read, maps(), active_ui=True, off=a702_off(True)), a702_off(True))
        assert (
            "Interface: pokenav_match_call; input unavailable; PokeNav observation unavailable; "
            f"STATE COVERAGE ERROR: {ERROR}"
        ) in before
        assert (
            "Interface: pokenav_match_call; input ready; selected MR. STONE; UP/DOWN selects a "
            "contact; A opens its options; B cannot exit during this tutorial"
        ) in after
        assert "Please select the POKéNAV." not in after


def test_switch_is_server_owned_and_default_off() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": "map-observability-v1"})
