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
from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE
from tests.env.test_exit_labels import operator_rom
from tests.env.test_menu_nav import CALL, LIST, nav
from tests.env.test_ui_state import text

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


def test_switch_is_server_owned_and_default_off() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": "map-observability-v1"})


GFX = 0x0202A000
PRINTERS = 0x020201B0


def calling(window: int, current: int):  # type: ignore[no-untyped-def]
    memory = short(0, 1, 0, 8)
    memory.put(CALL + 24, struct.pack("<I", 0x081CACF9))
    memory.put(0x02010000 + 16 + 6 * 4, struct.pack("<I", GFX))
    memory.put(GFX + 20, struct.pack("<H", window))
    memory.put(STRING_VAR4, text("HELLO") + b"\xff")
    memory.put(PRINTERS + window * 0x24, struct.pack("<I", current))
    return memory


def test_call_message_follows_the_message_box_printer() -> None:
    printing = read_nav_ui(calling(1, STRING_VAR4 + 3).read, NAV_CALLBACK, short_list=True)
    dots = read_nav_ui(calling(1, 0x08622806).read, NAV_CALLBACK, short_list=True)
    past = read_nav_ui(
        calling(1, STRING_VAR4 + STRING_VAR4_SIZE).read, NAV_CALLBACK, short_list=True
    )
    assert printing is not None and printing.details is not None
    assert printing.details["message"] == "HELLO"
    for ui in (dots, past):
        assert ui is not None and ui.diagnostic is None and ui.details is not None
        assert "message" not in ui.details


def test_out_of_range_message_window_is_a_diagnostic() -> None:
    ui = read_nav_ui(calling(32, STRING_VAR4).read, NAV_CALLBACK, short_list=True)
    assert ui is not None and ui.diagnostic == "invalid Match Call message window"


def test_condition_search_short_list_reads_on_and_errors_off() -> None:
    memory = nav(8)
    memory.put(LIST + 0x888, struct.pack("<5H2xII", 0, 1, 0, 0, 8, 4, 0x02025000))
    off = read_nav_ui(memory.read, NAV_CALLBACK)
    on = read_nav_ui(memory.read, NAV_CALLBACK, short_list=True)
    assert off is not None and off.diagnostic == ERROR
    assert (
        on is not None and on.diagnostic is None and on.phase == "pokenav_condition_search_results"
    )
    assert on.details is not None and on.details["list_count"] == 1
