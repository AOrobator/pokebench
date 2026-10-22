"""B6: native 97a0 move-learning boxes own input, not battle action controllers."""

from dataclasses import asdict

import pytest
from test_move_learn import archived, maps

from pokebench_env.rerender import read_state, render

ID = "battle-move-learn-input-v1"


@pytest.mark.parametrize(
    "name,kind", [("battle-delete-box", "learn_move"), ("battle-stop-box", "stop_learning_move")]
)
def test_native_boxes_reach_production_state_and_model_observation(name, kind):
    read = archived(name)
    base = frozenset({"post-battle-readout-v1"})
    off = read_state(read, maps(), active_ui=True, off=base | {ID})
    on = read_state(read, maps(), active_ui=True, off=base)
    assert off.active_ui.phase == "battle_resolving"
    assert off.active_ui.ready is False
    assert on.active_ui.phase == "battle_yes_no"
    assert on.active_ui.ready is True
    assert on.active_ui.selected in {"YES", "NO"}
    assert on.active_ui.details["prompt_kind"] == kind
    assert "Interface: battle_yes_no; input ready; selected " in render(on, base)
    assert "battle_yes_no" not in render(off, base | {ID})

    left, right = asdict(on), asdict(off)
    left.pop("active_ui")
    right.pop("active_ui")
    assert left == right


@pytest.mark.parametrize("name", ["battle-delete-box", "battle-stop-box"])
@pytest.mark.parametrize("cursor", [0, 1])
def test_script_cursor_and_transition_keep_ownership_bounded(name, cursor):
    from pokebench_env.battle_text import COMMUNICATION, LEARN_MOVE_STATE, MAIN_FUNC

    read = archived(name)
    overrides = {COMMUNICATION + 1: bytes([cursor])}

    def patched(address, size):
        raw = bytearray(read(address, size))
        for start, value in overrides.items():
            for index, byte in enumerate(value):
                if address <= start + index < address + size:
                    raw[start + index - address] = byte
        return bytes(raw)

    for state in [0, 1, 2]:
        overrides[LEARN_MOVE_STATE] = bytes([state])
        on = read_state(patched, maps(), active_ui=True, off=frozenset())
        off = read_state(patched, maps(), active_ui=True, off=frozenset({ID}))
        if state == 1:
            assert on.active_ui.selected == ("YES", "NO")[cursor]
            assert on.active_ui.ready is True
        else:
            assert on == off
    overrides[MAIN_FUNC] = bytes(4)
    assert read_state(patched, maps(), active_ui=True, off=frozenset()) == read_state(
        patched, maps(), active_ui=True, off=frozenset({ID})
    )


def test_action_history_uses_same_ready_owner_without_selecting_an_answer():
    from pokebench_env.action_history import read_action_frame

    read = archived("battle-delete-box")
    on = read_action_frame(read, include_storage=False, battle_move_learn_input=True)
    off = read_action_frame(read, include_storage=False)
    assert on.ui.phase == "battle_yes_no" and on.ui.ready is True
    assert off.ui.phase == "battle_resolving" and off.ui.ready is False


def test_report_d548_archive_and_api_payload_agree_with_native_owner():
    import json
    from pathlib import Path

    from test_move_learn import _rom

    from pokebench_env.raw_ram import load_raw_ram
    from pokebench_env.readout import state_json

    fixtures = Path(__file__).parent / "fixtures"
    provenance = json.loads((fixtures / "battle-learn-d548.provenance.json").read_text())
    read = load_raw_ram(fixtures / "battle-learn-d548.json.gz", provenance["sha256"], rom=_rom())
    state = read_state(read, maps(), active_ui=True, off=frozenset())
    assert state.active_ui.phase == "battle_yes_no" and state.active_ui.ready is True
    assert state.active_ui.details["prompt_kind"] == "learn_move"
    payload = state_json(state)
    assert payload["active_ui"]["phase"] == "battle_yes_no"
