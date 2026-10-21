"""Versioned section labels: geometry facts, not a selected story route."""
import hashlib
import json
from pathlib import Path
from dataclasses import replace

from pokebench_env.exit_labels import RomMap
from pokebench_env.map_sections import build_sections
from pokebench_env.readout import state_json
from pokebench_env.rerender import read_state, render
from tests.env.test_exit_labels import maps, off, reader, WOODS, ROUTE104


def layout(rows):
    # 0=floor, 1=wall, 2=water, 3=east ledge.
    blocks = {0: (0, 0, 3, 0), 1: (1, 1, 3, 0), 2: (2, 0, 1, 0x10), 3: (3, 1, 3, 0x38)}
    return RomMap(len(rows[0]), len(rows), tuple(blocks[v] for row in rows for v in row), (), ())


def test_separate_areas_and_stable_identity():
    s = build_sections(layout([[0, 0, 1, 0, 0], [0, 0, 1, 0, 0]]))
    assert s.section((0, 0)) == s.section((1, 1))
    assert s.section((0, 0)) != s.section((3, 0))
    assert s.section((0, 0)) == build_sections(layout([[0, 0, 1, 0, 0], [0, 0, 1, 0, 0]])).section((0, 0))
    assert not s.reaches((0, 0), (3, 0))


def test_ledge_is_one_way_not_one_undirected_section():
    s = build_sections(layout([[0, 3, 0, 0]]))
    assert s.reaches((0, 0), (3, 0))
    assert not s.reaches((3, 0), (0, 0))
    assert s.section((0, 0)) != s.section((3, 0))


def test_water_and_unknown_landing_do_not_invent_a_section():
    s = build_sections(layout([[0, 2, 0]]))
    assert not s.reaches((0, 0), (2, 0))
    assert s.section((1, 0)) is None
    assert s.section((-1, 0)) is None


def test_elevation_and_directional_edges_are_respected():
    rom = layout([[0, 0]])
    rom = replace(rom, blocks=(rom.blocks[0], (0, 0, 5, 0)))
    assert not build_sections(rom).reaches((0, 0), (1, 0))


def test_large_floor_is_iterative():
    s = build_sections(layout([[0] * 80 for _ in range(80)]))
    assert s.section((0, 0)) == s.section((79, 79))


def new_state(seq, enabled):
    disabled = set(off(True))
    if not enabled:
        disabled.add('exit-labels-v3')
    else:
        disabled.discard('exit-labels-v3')
    return read_state(reader(seq), maps(), active_ui=True, off=frozenset(disabled)), frozenset(disabled)


def test_off_preserves_existing_v2_readout_and_state():
    for seq in (WOODS, ROUTE104):
        s, disabled = new_state(seq, False)
        old = read_state(reader(seq), maps(), active_ui=True, off=frozenset(off(True) + ['exit-labels-v3']))
        assert render(s, disabled) == render(old, disabled)
        assert state_json(s) == state_json(old)
        assert 'exit_sections' not in state_json(s)
        frozen = json.loads((Path(__file__).parent / 'fixtures/exit-labels-v3-before.json').read_text())[seq]
        assert hashlib.sha256(render(s, disabled).encode()).hexdigest() == frozen['readout']
        assert hashlib.sha256(json.dumps(state_json(s), sort_keys=True).encode()).hexdigest() == frozen['state']


def test_real_route104_distinguishes_return_to_another_section():
    s, disabled = new_state(ROUTE104, True)
    body = state_json(s)
    labels = body['exit_sections']
    assert labels['current']
    woods = next(w for w in labels['warps'] if (w['x'], w['y']) == (10, 38))
    assert 'PETALBURG WOODS' in woods['label']
    assert 'different terrain section' in woods['detail']
    assert '(10,30)' in woods['detail']
    assert 'same terrain section' in next(w for w in labels['warps'] if (w['x'], w['y']) == (17, 50))['detail']
    text = render(s, disabled)
    assert woods['label'] in text
    assert 'Terrain sections' in text
    assert 'temporary objects and scripts' in text
    assert '; from there, on foot:' not in text


def test_real_woods_exits_have_different_destination_sections():
    s, disabled = new_state(WOODS, True)
    labels = state_json(s)['exit_sections']
    north = next(w for w in labels['warps'] if (w['x'], w['y']) == (14, 5))
    south = next(w for w in labels['warps'] if (w['x'], w['y']) == (16, 38))
    assert north['label'] != south['label']
    assert 'RUSTBORO' in north['detail']
    assert 'PETALBURG CITY' in south['detail']
    assert north['label'] in render(s, disabled)
    assert south['label'] in render(s, disabled)
