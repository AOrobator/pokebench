"""Production map-observation propagation; no emulator inputs or planner changes."""

import struct

import pytest
from test_game_state import OVERWORLD, SB1, game
from test_live_map import loaded
from test_map_rotating_elements import GateMemory

from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES, state_json
from pokebench_env.rerender import read_state, render

SWITCH = "map-observability-v1"
MAPS = MapNames({(14, 0): "MOSSDEEP CITY GYM", (26, 26): "BATTLE PYRAMID FLOOR"})
ENABLED = frozenset(
    {
        "ram-state-v1",
        "live-map-v1",
        "full-map-navigation-v1",
        "live-player-position-v1",
        "world-coordinate-grid-v1",
        "world-targets-v1",
        "named-interactions-v1",
        "adjacent-tiles-v1",
        "field-control-lock",
        SWITCH,
    }
)


def off_set(*, observable=True, full=True):
    enabled = ENABLED if observable else ENABLED - {SWITCH}
    if not full:
        enabled = enabled - {"full-map-navigation-v1"} | {"window-escape-route-v1"}
    return frozenset(SERVER_FEATURES) - enabled


def map_memory():
    memory = game(OVERWORLD)
    memory.cells.update(loaded().cells)
    memory.put(SB1 + 4, bytes([14, 0]))
    memory.put(0x02037350 + 9, bytes([0, 14]))
    memory.put(0x02037350 + 0x24, bytes(0x24))
    memory.put(0x02001000, struct.pack("<IIIIII", 24, 5, 0, 0, 0x02003000, 0x02004000))
    memory.put(0x03005DC0, struct.pack("<III", 39, 19, 0x02005000))
    memory.put(0x02007000, bytes(1024))
    memory.put(0x02008000, bytes(1024))
    memory.put(0x02005000, bytes(39 * 19 * 2))
    memory.put(0x02002000, bytes([0, 0, 2, 0]) + struct.pack("<4I", 0, 0, 0x02009000, 0))
    for index, x in enumerate((2, 20)):
        memory.put(0x02005000 + 2 * (8 * 39 + x + 7), struct.pack("<H", 0x254))
        memory.put(
            0x02009000 + index * 16, struct.pack("<hhBxHH2xI", x, 1, 3, 0x4000, 0, 0x08001000)
        )
    return memory


def test_server_reader_json_map_adjacent_and_target_use_the_same_element():
    memory = map_memory()
    state = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    observation = state.map_observation
    assert observation is not None
    assert observation.map_id == (14, 0)
    assert (observation.origin, observation.width, observation.height) == ((0, 0), 24, 5)
    switch = next(e for e in observation.elements if (e.x, e.y) == (2, 1))
    assert (switch.kind, switch.color) == ("switch", "yellow")
    assert state_json(state)["map_observation"] == observation.json()
    target = next(t for t in state.interaction_targets or () if (t.x, t.y) == (2, 1))
    assert target.name == "yellow switch"
    text = render(state, off_set())
    assert "S:Y = yellow switch" in text
    assert "right (2,1) yellow switch" in text
    assert "yellow switch at (2,1)" in text
    assert "Now yellow switch: (2,1), (20,1)" in text


def test_new_flag_off_omits_the_field_and_restores_old_labels_without_mutating_geometry():
    memory = map_memory()
    on = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    off = read_state(memory.read, MAPS, active_ui=False, off=off_set(observable=False))
    assert off.map_observation is None
    assert "map_observation" not in state_json(off)
    assert state_json(on)["navigation_grid"] == state_json(off)["navigation_grid"]
    assert state_json(on)["map_grid"] == state_json(off)["map_grid"]
    assert on.full_map == off.full_map and on.nearby == off.nearby
    assert [(t.kind, t.x, t.y, t.activation) for t in on.interaction_targets or ()] == [
        (t.kind, t.x, t.y, t.activation) for t in off.interaction_targets or ()
    ]
    assert all(t.name is None for t in off.interaction_targets or ())
    old_text = render(off, off_set(observable=False))
    assert "observed elements" not in old_text and "yellow switch" not in old_text
    before = state_json(on)
    assert render(on, off_set()) == render(on, off_set())
    assert state_json(on) == before


def test_local_annotation_window_never_labels_a_full_grid_only_target():
    memory = map_memory()
    state = read_state(memory.read, MAPS, active_ui=False, off=off_set(full=False))
    observation = state.map_observation
    assert observation is not None and state.full_map is not None
    assert (observation.origin, observation.width, observation.height) == ((-6, -6), 15, 15)
    assert [(e.x, e.y) for e in observation.elements] == [(2, 1)]
    targets = {(t.x, t.y): t for t in state.interaction_targets or ()}
    assert targets[(2, 1)].name == "yellow switch"
    assert targets[(20, 1)].name is None
    text = render(state, off_set(full=False))
    assert "Now yellow switch: (2,1)" in text
    assert "Now yellow switch: (2,1), (20,1)" not in text


def test_live_switch_graphic_changes_refresh_every_annotation_consumer():
    memory = map_memory()
    first = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    memory.put(0x02005000 + 2 * (8 * 39 + 2 + 7), struct.pack("<H", 0x25C))
    second = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    assert (
        next(t.name for t in first.interaction_targets or () if (t.x, t.y) == (2, 1))
        == "yellow switch"
    )
    assert (
        next(t.name for t in second.interaction_targets or () if (t.x, t.y) == (2, 1))
        == "blue switch"
    )
    text = render(second, off_set())
    assert "right (2,1) blue switch" in text
    assert "Now blue switch: (2,1)" in text
    assert "Now yellow switch: (20,1)" in text


@pytest.mark.parametrize("callback,in_battle", [(0x08038421, True), (0x08085FFD, False)])
def test_battle_and_transition_screens_do_not_gain_map_annotations(callback, in_battle):
    memory = map_memory()
    memory.put(0x030022C4, struct.pack("<I", callback))
    memory.put(0x030026F9, bytes([int(in_battle)]))
    state = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    assert state.map_observation is None
    assert "map_observation" not in state_json(state)
    assert "observed elements" not in render(state, off_set())


def test_disabling_live_map_also_disables_the_annotation_reader():
    memory = map_memory()
    off = off_set() | {"live-map-v1"}
    state = read_state(memory.read, MAPS, active_ui=False, off=off)
    assert state.map_observation is None
    assert "map_observation" not in state_json(state)
    assert "observed elements" not in render(state, off)


def test_generated_pyramid_dimensions_reach_both_map_and_topology_only_when_enabled():
    memory = map_memory()
    memory.put(SB1 + 4, bytes([26, 26]))
    memory.put(0x02001000, struct.pack("<IIIIII", 8, 8, 0, 0, 0x02003000, 0x02004000))
    memory.put(0x0203732A, struct.pack("<H", 361))
    memory.put(0x03005DC0, struct.pack("<III", 47, 46, 0x02005000))
    memory.put(0x02005000, bytes(47 * 46 * 2))
    on = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    off = read_state(memory.read, MAPS, active_ui=False, off=off_set(observable=False))
    assert on.full_map is not None and on.topology is not None
    assert (on.full_map.width, on.full_map.height) == (32, 32)
    assert (on.topology.width, on.topology.height) == (32, 32)
    assert on.map_observation is not None
    assert (on.map_observation.width, on.map_observation.height) == (32, 32)
    assert on.interaction_targets is None
    assert "interaction target coverage unavailable" in on.map_observation.unavailable
    assert "Map detail unavailable: interaction target coverage unavailable" in render(
        on, off_set()
    )
    assert off.nearby is None and off.full_map is None and off.topology is None


def test_rotating_edge_is_consistent_in_map_and_the_direction_crossing_it():
    memory = map_memory()
    memory.cells.update(GateMemory().bytes)
    memory.put(0x02037350 + 9, bytes([1, 12]))
    memory.put(0x02037350 + 0x10, struct.pack("<hh", 12, 14))
    memory.put(0x02001000, struct.pack("<IIIIII", 20, 25, 0, 0, 0x02003000, 0x02004000))
    memory.put(0x03005DC0, struct.pack("<III", 35, 39, 0x02005000))
    memory.put(0x02005000, bytes(35 * 39 * 2))
    memory.put(0x02002000, bytes(20))
    maps = MapNames({(12, 1): "FORTREE CITY GYM"})
    state = read_state(memory.read, maps, active_ui=False, off=off_set())
    assert state.position == (5, 7)
    observation = state.map_observation
    assert observation is not None and observation.unavailable == (
        "current layout identity not verified",
    )
    assert any(e.edge == (5, 6, 5, 7) for e in observation.elements)
    text = render(state, off_set())
    assert "edge (5,6)-(5,7)" in text
    neighbours = next(line for line in text.splitlines() if line.startswith("Next tiles:"))
    north = neighbours.split("; down", 1)[0]
    assert "up (5,6)" in north and "rotating gate arm across this edge" in north
    assert "cannot be entered" not in north


def test_new_map_target_labels_do_not_depend_on_the_legacy_named_interactions_switch():
    memory = map_memory()
    off = off_set() | {"named-interactions-v1"}
    state = read_state(memory.read, MAPS, active_ui=False, off=off)
    target = next(t for t in state.interaction_targets or () if (t.x, t.y) == (2, 1))
    assert target.name == "yellow switch"
    text = render(state, off)
    assert "right (2,1) yellow switch" in text
    assert "Now yellow switch: (2,1), (20,1)" in text
    assert "yellow switch at (2,1)" in text


def elevation_memory(*, player=3, tile=4, collision=0, surfing=False, locked=False):
    memory = map_memory()
    # Real layout pointers are in ROM; alias the synthetic fixture there so the independent
    # native avatar reader can validate ownership instead of manufacturing RunningPermission.
    memory.put(0x08010000, memory.read(0x02001000, 24))
    memory.put(0x02037318, struct.pack("<I", 0x08010000))
    memory.put(0x02037350 + 0x0B, bytes([player]))
    memory.put(0x02037590, bytes([8 if surfing else 1]) + bytes(7))
    memory.put(0x03000F2C, bytes([int(locked)]))
    for x in (2, 20):
        block = 0x254 | (collision << 10) | (tile << 12)
        memory.put(0x02005000 + 2 * (8 * 39 + x + 7), struct.pack("<H", block))
    return memory


def test_shared_other_level_labels_survive_legacy_elevation_switch_off_and_refresh():
    memory = elevation_memory()
    off = off_set() | {"elevation-aware-map-v1"}
    first = read_state(memory.read, MAPS, active_ui=False, off=off)
    assert first.running is not None and first.running.avatar_flags == 1
    assert first.map_observation is not None
    assert [
        (e.x, e.y, e.state) for e in first.map_observation.elements if e.kind == "other_level"
    ] == [(2, 1, "4"), (20, 1, "4")]
    text = render(first, off)
    assert "Lv:4 = other level (4)" in text
    assert "Now other level (4): (2,1), (20,1)" in text
    next_tiles = next(line for line in text.splitlines() if line.startswith("Next tiles:"))
    assert "right (2,1) yellow switch; other level (4)" in next_tiles
    baseline = read_state(memory.read, MAPS, active_ui=False, off=off | {SWITCH})
    assert state_json(first)["navigation_grid"] == state_json(baseline)["navigation_grid"]
    assert state_json(first)["map_grid"] == state_json(baseline)["map_grid"]
    # Changing native player height refreshes the common annotation, not just its legend.
    memory.put(0x02037350 + 0x0B, bytes([4]))
    second = read_state(memory.read, MAPS, active_ui=False, off=off)
    assert second.map_observation is not None
    assert not any(e.kind == "other_level" for e in second.map_observation.elements)
    assert "other level (4)" not in render(second, off)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"tile": 0},
        {"tile": 15},
        {"tile": 3},
        {"player": 0},
        {"collision": 1},
        {"surfing": True},
        {"locked": True},
    ],
)
def test_shared_other_level_requires_a_known_walkable_mismatched_ground_tile(kwargs):
    memory = elevation_memory(**kwargs)
    state = read_state(memory.read, MAPS, active_ui=False, off=off_set())
    assert state.map_observation is not None
    assert not any(e.kind == "other_level" for e in state.map_observation.elements)
    assert "other level" not in render(state, off_set())


def test_shared_other_level_annotation_is_bound_to_the_local_view():
    memory = elevation_memory()
    state = read_state(memory.read, MAPS, active_ui=False, off=off_set(full=False))
    assert state.map_observation is not None and state.full_map is not None
    assert [(e.x, e.y) for e in state.map_observation.elements if e.kind == "other_level"] == [
        (2, 1)
    ]
    assert any(t.x == 20 and t.y == 1 and t.elevation == 4 for t in state.full_map.tiles)


def test_new_map_generator_target_labels_survive_legacy_names_off():
    memory = map_memory()
    memory.put(SB1 + 4, bytes([24, 53]))
    memory.put(0x02037350 + 9, bytes([53, 24]))
    memory.put(0x02001000, struct.pack("<IIIIII", 40, 5, 0, 0, 0x02003000, 0x02004000))
    memory.put(0x03005DC0, struct.pack("<III", 55, 19, 0x02005000))
    memory.put(0x02005000, bytes(55 * 19 * 2))
    memory.put(0x02005000 + 2 * (9 * 55 + 39), struct.pack("<H", 0x2D8))
    memory.put(0x02002000, bytes([0, 0, 0, 1]) + struct.pack("<4I", 0, 0, 0, 0x02009000))
    memory.put(0x02009000, struct.pack("<HHBB2xI", 32, 2, 0, 0, 0))
    off = off_set() | {"named-interactions-v1"}
    state = read_state(memory.read, MapNames({(24, 53): "NEW MAUVILLE"}), active_ui=False, off=off)
    target = next(t for t in state.interaction_targets or () if (t.x, t.y) == (32, 2))
    assert target.name == "background; generator (on)"
    text = render(state, off)
    assert "Now generator (on): (32,2)" in text
    assert "background; generator (on) at (32,2)" in text
