"""Native Match Call printer ownership: text.h/TextPrinter, text.c/RenderText,
pokenav_match_call_gfx.c/DoMatchCallMessage, pokeemerald 731ad5bf.
"""

import pytest

from pokebench_env.menu_nav import NAV_CALLBACK, read_nav_ui
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rerender import read_state, render
from pokebench_env.ui_state import STRING_VAR4
from tests.env.test_pokenav_short_list import PRINTERS, a702_off, calling, maps, native

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


def test_native_a702_call_printing_and_off_invariance() -> None:
    read = native("call_text")
    old = read_nav_ui(read, NAV_CALLBACK, short_list=True)
    off = read_nav_ui(read, NAV_CALLBACK, short_list=True, call_advance=False)
    on = read_nav_ui(read, NAV_CALLBACK, short_list=True, call_advance=True)
    assert old == off
    assert on is not None and on.details is not None
    assert on.details["call_text_state"] in ("printing", "waiting")
    assert on.details["message"].startswith("MR. STONE: Oh? AAAAAA!")
    disabled = a702_off(True) | {ID}
    enabled = disabled - {ID}
    before = render(read_state(read, maps(), active_ui=True, off=disabled), disabled)
    after = render(read_state(read, maps(), active_ui=True, off=enabled), enabled)
    assert "A advances call text; A/B closes the finished call" not in before
    assert "A advances call text; A/B closes the finished call" in after
    assert "call text state:" in after


def test_switch_is_server_owned_and_default_off() -> None:
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


def test_native_calling_dots_wait_is_owned_and_not_stale_dialogue() -> None:
    read = native("call")
    # Exact US ROM sText_CallingDots, including its final clear-page prompt and EOS.
    assert read(0x086227F4, 19) == bytes.fromhex("affc0804affc0804affc0804affc0804affbff")
    ui = read_nav_ui(read, NAV_CALLBACK, short_list=True, call_advance=True)
    assert ui is not None and ui.details is not None and ui.ready
    assert ui.details["call_text_state"] == "waiting"
    assert "message" not in ui.details


@pytest.mark.parametrize("name", ["call", "call_text", "list_after_call"])
def test_typescript_fixture_is_the_exact_native_production_json(name: str) -> None:
    import gzip
    import json
    from pathlib import Path

    from pokebench_env.readout import state_json
    from tests.env.test_pokenav_short_list import MANIFEST

    path = Path(__file__).parents[3] / "packages/agent/src/fixtures/pokenav-call-native.json.gz"
    fixture = json.loads(gzip.decompress(path.read_bytes()))
    actual = state_json(read_state(native(name), maps(), active_ui=True, off=a702_off(True) - {ID}))
    # JSON transport owns tuple/list normalization, exactly as on the HTTP seam.
    assert fixture["cases"][name]["state"] == json.loads(json.dumps(actual))
    assert fixture["cases"][name]["raw"] == MANIFEST["cases"][name]
    if name != "list_after_call":
        assert actual["active_ui"]["details"]["pokenav_task_state"] == 2
        assert actual["active_ui"]["details"]["call_text_state"] == "waiting"
