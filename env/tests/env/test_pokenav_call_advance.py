"""Native Match Call printer ownership: text.h/TextPrinter, text.c/RenderText,
pokenav_match_call_gfx.c/DoMatchCallMessage, pokeemerald 731ad5bf.
"""

import pytest

from pokebench_env.menu_nav import NAV_CALLBACK, read_nav_ui
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_pokenav_short_list import PRINTERS, calling

ID = "pokenav-call-auto-advance-v1"


@pytest.mark.parametrize("phase", [1, 2, 3])
def test_native_printer_waits_accept_a_even_while_root_task_busy(phase: int) -> None:
    memory = calling(1, STRING_VAR4 + 3)
    memory.put(PRINTERS + 0x24 + 0x1B, bytes([1, phase]))
    ui = read_nav_ui(memory.read, NAV_CALLBACK, short_list=True, call_advance=True)
    assert ui is not None and ui.details is not None
    assert ui.details["call_text_state"] == "waiting"
    assert ui.ready is True
    assert ui.controls == "A advances call text; A/B closes the finished call"


@pytest.mark.parametrize("active,phase", [(1, 0), (1, 4), (1, 5), (1, 6)])
def test_printing_is_not_a_prompt(active: int, phase: int) -> None:
    memory = calling(1, STRING_VAR4 + 3)
    memory.put(PRINTERS + 0x24 + 0x1B, bytes([active, phase]))
    ui = read_nav_ui(memory.read, NAV_CALLBACK, short_list=True, call_advance=True)
    assert ui is not None and ui.details is not None
    assert ui.details["call_text_state"] == "printing"


def test_unknown_buffer_does_not_claim_an_input_prompt() -> None:
    memory = calling(1, 0x08620000)
    memory.put(PRINTERS + 0x24 + 0x1B, bytes([1, 2]))
    ui = read_nav_ui(memory.read, NAV_CALLBACK, short_list=True, call_advance=True)
    assert ui is not None and ui.details is not None
    assert ui.details["call_text_state"] == "unavailable"


@pytest.mark.parametrize("active,phase", [(2, 0), (1, 7)])
def test_invalid_printer_is_a_diagnostic(active: int, phase: int) -> None:
    memory = calling(1, STRING_VAR4)
    memory.put(PRINTERS + 0x24 + 0x1B, bytes([active, phase]))
    ui = read_nav_ui(memory.read, NAV_CALLBACK, short_list=True, call_advance=True)
    assert ui is not None and ui.diagnostic == "invalid Match Call text printer"


def test_switch_is_server_owned_and_default_off() -> None:
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})
