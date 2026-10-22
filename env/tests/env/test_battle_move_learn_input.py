"""B6: native 97a0 move-learning boxes own input, not battle action controllers."""

import pytest
from test_move_learn import archived, maps

from pokebench_env.rerender import read_state, render

ID = "battle-move-learn-input-v1"


@pytest.mark.parametrize("name,kind", [("battle-delete-box", "learn_move"), ("battle-stop-box", "stop_learning_move")])
def test_native_boxes_reach_production_state_and_model_observation(name, kind):
    read = archived(name)
    off = read_state(read, maps(), active_ui=True, off=frozenset({ID}))
    on = read_state(read, maps(), active_ui=True, off=frozenset())
    assert off.active_ui.phase == "battle_resolving"
    assert off.active_ui.ready is False
    assert on.active_ui.phase == "battle_yes_no"
    assert on.active_ui.ready is True
    assert on.active_ui.selected in {"YES", "NO"}
    assert on.active_ui.details["prompt_kind"] == kind
    assert "Interface: battle_yes_no; input ready; selected " in render(on, frozenset())
    assert "battle_yes_no" not in render(off, frozenset({ID}))
