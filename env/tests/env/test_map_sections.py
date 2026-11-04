"""Versioned section labels: geometry facts, not a selected story route."""

from dataclasses import replace

from pokebench_env.exit_labels import RomMap
from pokebench_env.map_sections import build_sections


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
    assert s.landing((1, 0)) is None
    assert s.section((-1, 0)) is None


def test_elevation_and_directional_edges_are_respected():
    rom = layout([[0, 0]])
    rom = replace(rom, blocks=(rom.blocks[0], (0, 0, 5, 0)))
    assert not build_sections(rom).reaches((0, 0), (1, 0))


def test_large_floor_is_iterative():
    s = build_sections(layout([[0] * 80 for _ in range(80)]))
    assert s.section((0, 0)) == s.section((79, 79))


def test_warp_tiles_do_not_silently_join_rooms():
    rom = replace(layout([[0, 0, 0]]), warps=((1, 0, 0, 1, 1),))
    s = build_sections(rom)
    assert not s.reaches((0, 0), (2, 0))
    assert s.landing((1, 0)) is None  # both sides are possible; do not guess


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


def test_existing_field_gate_walls_and_forced_steps_remain_directed():
    from pokebench_env.field_moves import FloodRules

    rom = layout([[0, 0, 0]])
    wall = build_sections(rom, FloodRules(frozenset({(1, 0)}), {}))
    assert not wall.reaches((0, 0), (2, 0))
    forced = build_sections(rom, FloodRules(frozenset(), {(1, 0): (1, 0)}))
    assert forced.reaches((0, 0), (2, 0))
    assert not forced.reaches((2, 0), (0, 0))


def test_warp_landing_does_not_cross_barred_edges_or_height_or_gate():
    from pokebench_env.field_moves import FloodRules

    # The only floor neighbor is not proof that emergence onto it is possible.
    warp = ((1, 0, 0, 0, 0),)
    for blocks in (
        ((0, 0, 3, 0x30), (0, 0, 3, 0)),  # neighbor blocks entering from east
        ((0, 0, 3, 0), (0, 0, 3, 0x31)),  # warp blocks leaving west
        ((0, 0, 3, 0), (0, 0, 5, 0)),  # incompatible height
    ):
        assert build_sections(RomMap(2, 1, blocks, warp, ())).landing((1, 0)) is None
    rom = RomMap(2, 1, ((0, 0, 3, 0), (0, 0, 3, 0)), warp, ())
    assert build_sections(rom, FloodRules(frozenset({(1, 0)}), {})).landing((1, 0)) is None
    assert build_sections(rom, FloodRules(frozenset(), {(1, 0): (1, 0)})).landing((1, 0)) is None
    assert build_sections(rom).landing((1, 0)) == (0, 0)
