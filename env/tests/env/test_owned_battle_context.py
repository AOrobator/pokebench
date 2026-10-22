"""d951 seq17459 native evolution owner despite lingering gMain.inBattle."""
import json
from pathlib import Path

from test_move_learn import _rom

from pokebench_env.game_state import MapNames
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.rerender import read_state

FIXTURES = Path(__file__).parent / "fixtures"


def test_d951_owner_is_evolution_after_declined_move():
    provenance = json.loads((FIXTURES / "owned-battle-d951.provenance.json").read_text())
    read = load_raw_ram(
        FIXTURES / "owned-battle-d951.json.gz",
        provenance["raw_ram"]["sha256"],
        rom=_rom(),
    )
    state = read_state(read, MapNames({}), active_ui=True, off=frozenset())
    assert state.screen == "evolution"
    assert state.in_battle is True  # stale native bit, not the current screen owner
    assert state.active_ui is not None
    assert state.active_ui.phase == "evolution_result"
    assert state.active_ui.diagnostic is None
    assert state.active_ui.details["callback2"] == "0x0813E3A5"
    assert state.active_ui.details["owner_task"] == 0
