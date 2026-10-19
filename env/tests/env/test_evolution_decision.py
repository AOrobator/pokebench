from contextlib import nullcontext
import struct

import pytest
from fastapi import FastAPI
from test_human import request
from test_view import get
from tests.env.test_menu_pokemon_lifecycle import evo
from tests.env.test_menus import put_task

from pokebench_env.evolution_decision import EvolutionGate, decision_ui, install_evolution_decision
from pokebench_env.game_screen import GMAIN
from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu


def native(state=8):
    m = evo(state)
    m.put(GMAIN + 4, struct.pack('<I', 0x0813E3A5))
    return m


def test_observation_preserves_off_and_removes_invented_cursor_on():
    m = native()
    old = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    assert old.selected == 'CANCEL'
    fixed = decision_ui(old)
    assert fixed.selected is None
    assert fixed.phase == 'evolution_decision'
    assert 'choose_evolution' in fixed.controls
    assert 'B declines' not in fixed.controls
    assert old.selected == 'CANCEL'  # no mutation of legacy result
    for state in [0, 5, 7, 9, 17, 19]:
        ui = decision_ui(read_pokemon_lifecycle_menu(native(state).read, 0x0813E3A5))
        assert ui.selected is None and 'directions select' not in ui.controls
    ui = read_pokemon_lifecycle_menu(evo(22, False, 4).read, 0x0813E3A5)
    assert decision_ui(ui) == ui  # actual move choice belongs to its own owner


@pytest.mark.parametrize('choice,expected', [('evolve', []), ('cancel', ['B'])])
def test_freezes_indefinitely_and_only_explicit_choice_advances(choice, expected):
    m = native()
    gate = EvolutionGate(m.read)
    assert gate.before_frame(['B']) is None
    token = gate.pending()['token']
    for _ in range(80):
        assert gate.before_frame(['A', 'B']) is None
    gate.choose(token, choice)
    assert gate.before_frame(['B', 'A']) == expected
    assert gate.before_frame(['B']) == []  # queued input cannot leak after decision
    with pytest.raises(ValueError, match='pending'):
        gate.choose(token, choice)


def test_pre_window_batch_is_neutralized_and_transition_stops_on_first_window():
    m = native(7)
    gate = EvolutionGate(m.read)
    assert gate.before_frame(['B']) == []
    put_task(m, 0, 0x0813E571, [8, 280, 281, 1, 0, 0, 0, 0, 0, 0, 0])
    assert gate.before_frame(['B']) is None
    first = gate.pending()['token']
    with pytest.raises(ValueError, match='pending'):
        gate.choose(first + 1, 'cancel')
    m.put(GMAIN + 4, struct.pack('<I', 0x08085E51))
    assert gate.before_frame(['A']) == ['A']
    with pytest.raises(ValueError, match='pending'):
        gate.choose(first, 'cancel')
    m.put(GMAIN + 4, struct.pack('<I', 0x0813E3A5))
    assert gate.before_frame(['B']) is None
    assert gate.pending()['token'] > first


def test_trade_uncancellable_and_move_learning_do_not_get_decisions():
    for trade, state, flags in [(True, 8, 1), (False, 8, 0), (False, 22, 1)]:
        m = native(state)
        put_task(m, 0, 0x0813F1B9 if trade else 0x0813E571,
                 [state, 280, 281, flags, 0, 0, 0, 0, 0, 0, 0])
        gate = EvolutionGate(m.read)
        assert gate.before_frame(['A']) == ['A']
        assert gate.pending() is None


def test_endpoint_native_frame_hook_and_stale_duplicate_validation():
    m = native()
    applied = []
    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)
    api = FastAPI()
    install_evolution_decision(api, Emulator, m.read, nullcontext())
    emu = Emulator()
    emu.run_frame_with_buttons(['B'])
    assert applied == []
    status, _, body = get(api, '/pokebench/evolution')
    import json
    token = json.loads(body)['pending']['token']
    assert status == 200
    assert request(api, '/pokebench/evolution', {'token': token, 'decision': 'maybe'})[0] == 422
    assert request(api, '/pokebench/evolution', {'token': token + 1, 'decision': 'cancel'})[0] == 409
    assert request(api, '/pokebench/evolution', {'token': token, 'decision': 'cancel'})[0] == 200
    assert request(api, '/pokebench/evolution', {'token': token, 'decision': 'cancel'})[0] == 409
    emu.run_frame_with_buttons(['A'])
    assert applied == [['B']]
