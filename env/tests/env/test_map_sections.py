"""Versioned section labels: geometry facts, not a selected story route."""

import hashlib
import json
from dataclasses import replace
from pathlib import Path

from pokebench_env.exit_labels import RomMap
from pokebench_env.map_sections import build_sections
from pokebench_env.readout import state_json
from pokebench_env.rerender import read_state, render
from tests.env.test_exit_labels import ROUTE104, WOODS, maps, off, reader


def layout(rows):
    # 0=floor, 1=wall, 2=water, 3=east ledge.
    blocks = {0: (0, 0, 3, 0), 1: (1, 1, 3, 0), 2: (2, 0, 1, 0x10), 3: (3, 1, 3, 0x38)}
    return RomMap(len(rows[0]), len(rows), tuple(blocks[v] for row in rows for v in row), (), ())


def test_separate_areas_and_stable_identity():
    s = build_sections(layout([[0, 0, 1, 0, 0], [0, 0, 1, 0, 0]]))
    assert s.section((0, 0)) == s.section((1, 1))
    assert s.section((0, 0)) != s.section((3, 0))
    assert s.section((0, 0)) == build_sections(layout([[0, 0, 1, 0, 0], [0, 0, 1, 0, 0]])).section(
        (0, 0)
    )
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
        disabled.add("exit-labels-v3")
    else:
        disabled.discard("exit-labels-v3")
    return read_state(reader(seq), maps(), active_ui=True, off=frozenset(disabled)), frozenset(
        disabled
    )


def test_off_preserves_existing_v2_readout_and_state():
    for seq in (WOODS, ROUTE104):
        s, disabled = new_state(seq, False)
        old = read_state(
            reader(seq), maps(), active_ui=True, off=frozenset(off(True) + ["exit-labels-v3"])
        )
        assert render(s, disabled) == render(old, disabled)
        assert state_json(s) == state_json(old)
        assert "exit_sections" not in state_json(s)
        frozen = json.loads(
            (Path(__file__).parent / "fixtures/exit-labels-v3-before.json").read_text()
        )[seq]
        assert hashlib.sha256(render(s, disabled).encode()).hexdigest() == frozen["readout"]
        assert (
            hashlib.sha256(json.dumps(state_json(s), sort_keys=True).encode()).hexdigest()
            == frozen["state"]
        )


def test_real_route104_distinguishes_return_to_another_section():
    s, disabled = new_state(ROUTE104, True)
    body = state_json(s)
    labels = body["exit_sections"]
    assert labels["current"]
    woods = next(w for w in labels["warps"] if (w["x"], w["y"]) == (10, 38))
    assert "PETALBURG WOODS" in woods["label"]
    assert "different terrain section" in woods["detail"]
    assert "(10,30)" in woods["detail"]
    assert (
        "same terrain section"
        in next(w for w in labels["warps"] if (w["x"], w["y"]) == (17, 50))["detail"]
    )
    text = render(s, disabled)
    assert woods["label"] in text
    assert "Terrain sections" in text
    assert "temporary objects and scripts" in text
    assert "; from there, on foot:" not in text


def test_real_woods_exits_have_different_destination_sections():
    s, disabled = new_state(WOODS, True)
    labels = state_json(s)["exit_sections"]
    north = next(w for w in labels["warps"] if (w["x"], w["y"]) == (14, 5))
    south = next(w for w in labels["warps"] if (w["x"], w["y"]) == (16, 38))
    assert north["label"] != south["label"]
    assert "RUSTBORO" in north["detail"]
    assert "PETALBURG CITY" in south["detail"]
    assert north["label"] in render(s, disabled)
    assert south["label"] in render(s, disabled)


def test_warp_tiles_do_not_silently_join_rooms():
    rom = replace(layout([[0, 0, 0]]), warps=((1, 0, 0, 1, 1),))
    s = build_sections(rom)
    assert not s.reaches((0, 0), (2, 0))
    assert s.landing((1, 0)) is None  # both sides are possible; do not guess


def test_real_rom_same_map_gym_rooms_and_one_way_route104():
    from pokebench_env.exit_labels import read_rom_map
    from pokebench_env.map_sections import read_exit_sections

    read = reader(WOODS)
    rom = read_rom_map(read, (0, 19))
    assert rom is not None
    sections = build_sections(rom)
    south = sections.section((39, 62))
    east = sections.landing((32, 42))
    north = sections.landing((10, 30))
    assert south is not None and east is not None and north is not None
    assert not sections.connected(south, east)
    assert sections.connected(east, south)
    assert not sections.connected(south, north)
    gym = read_exit_sections(read, (8, 1), (4, 109), lambda _m: "PETALBURG CITY")
    assert gym is not None
    room_door = next(w for w in gym.warps if (w.x, w.y) == (1, 105))
    assert "(map 8/1)" in room_door.label
    assert "different terrain section" in room_door.detail


def test_unknown_dynamic_unreadable_destinations_and_empty_map(monkeypatch):
    import pokebench_env.map_sections as owner

    here = replace(layout([[0, 0, 0]]), warps=((0, 0, 0, 127, 127), (2, 0, 99, 1, 2)))
    monkeypatch.setattr(owner, "read_rom_map", lambda _read, mid: here if mid == (0, 0) else None)
    result = owner.read_exit_sections(lambda _a, _n: b"", (0, 0), (1, 0), lambda _m: None)
    assert result is not None
    assert result.warps[0].label == "dynamic destination — terrain section unknown"
    assert result.warps[1].detail == "Landing is not established."
    assert "terrain section unknown" in result.warps[1].label
    assert owner.read_exit_sections(lambda _a, _n: b"", (1, 1), (0, 0), lambda _m: None) is None
    assert build_sections(layout([[1]])).section((0, 0)) is None
