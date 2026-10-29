import struct

from test_live_map import loaded

from pokebench_env.game_state import MapNames
from pokebench_env.topology import read_topology


def test_live_bounds_named_north_connection_and_signed_offset():
    m = loaded()
    m.put(0x02037324, struct.pack("<I", 0x0200A000))
    m.put(0x0200A000, struct.pack("<iI", 1, 0x0200B000))
    m.put(0x0200B000, struct.pack("<B3xiBB2x", 2, -3, 0, 16))
    result = read_topology(m.read, MapNames({(0, 16): "ROUTE 101"}))
    assert result is not None
    assert (result.width, result.height) == (5, 5)
    assert result.connections[0].direction == "NORTH"
    assert result.connections[0].offset == -3
    assert result.connections[0].destination_name == "ROUTE 101"
    assert "NORTH -> ROUTE 101" in result.text()
    assert "X=0..4, Y=0..4" in result.text()


def test_no_connections_is_distinct_from_unavailable_table():
    m = loaded()
    result = read_topology(m.read, MapNames({}))
    assert result is not None and result.connections == ()
    m.put(0x02037324, struct.pack("<I", 3))
    assert read_topology(m.read, MapNames({})) is None


def test_invalid_connection_count_and_direction_do_not_invent_exits():
    m = loaded()
    m.put(0x02037324, struct.pack("<I", 0x0200A000))
    for count in [-1, 17]:
        m.put(0x0200A000, struct.pack("<iI", count, 0x0200B000))
        assert read_topology(m.read, MapNames({})) is None
    m.put(0x0200A000, struct.pack("<iI", 1, 0x0200B000))
    m.put(0x0200B000, struct.pack("<B3xiBB2x", 99, 0, 0, 16))
    assert read_topology(m.read, MapNames({})) is None


def test_observation_delivers_named_topology_only_when_enabled(monkeypatch):
    import json
    from dataclasses import replace

    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_readout import IN_GAME
    from test_view import get

    from pokebench_env.observation import install_observation
    from pokebench_env.world import InteractionTarget

    m = loaded()
    topology = read_topology(m.read, MapNames({}))
    field = replace(
        IN_GAME,
        topology=topology,
        destination_names=((0, 16, "ROUTE 101"),),
        interaction_targets=(
            InteractionTarget("warp", 5, 1, 0, "movement", destination=(0, 16, 0)),
        ),
    )
    monkeypatch.setattr("pokebench_env.rerender.read_game_state", lambda *args, **kwargs: field)

    class Shot(BaseModel):
        screenshot_base64: str = "aA=="

    for off, expected in [("world-destinations-v1", False), ("", True)]:
        monkeypatch.setenv(
            "POKEBENCH_FEATURES_OFF",
            ",".join(filter(None, (off, "player-map-visibility-v2"))),
        )
        app = FastAPI()
        install_observation(app, Shot, m.read, MapNames({}))
        status, _, raw = get(app, "/pokebench/observation")
        assert status == 200
        body = json.loads(raw)
        assert ("Current map bounds: X=0..4, Y=0..4" in body["state_text"]) is expected
        assert ("Warp destination at (5,1): map 0/16" in body["state_text"]) is expected
        assert body["state"]["topology"]["width"] == 5


def test_real_reader_propagates_topology_and_withholds_it_while_loading():
    from test_game_state import MAPS, OVERWORLD, game

    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout, state_json

    m = game(OVERWORLD)
    m.cells.update(loaded().cells)
    field = read_game_state(m.read, MAPS)
    assert field.topology is not None
    assert state_json(field)["topology"]["width"] == 5
    assert "Current map bounds" in format_readout(field, world_destinations=True)
    m.put(0x030022C0, struct.pack("<II", 0, 0x08085FFD))
    transition = read_game_state(m.read, MAPS)
    assert transition.topology is None
    assert "Current map bounds" not in format_readout(transition, world_destinations=True)


def test_bounds_and_connection_alignment_fail_closed():
    m = loaded()
    m.put(0x02001000, struct.pack("<II", 0, 5))
    assert read_topology(m.read, MapNames({})) is None
    m = loaded()
    m.put(0x02037324, struct.pack("<I", 0x0200A001))
    assert read_topology(m.read, MapNames({})) is None
    m.put(0x02037324, struct.pack("<I", 0x0200A000))
    m.put(0x0200A000, struct.pack("<iI", 1, 0x0200B001))
    m.put(0x0200B001, struct.pack("<B3xiBB2x", 2, 0, 0, 16))
    assert read_topology(m.read, MapNames({})) is None


def test_navigation_geometry_is_passive_and_map_id_text_is_independent():
    from test_game_state import MAPS, OVERWORLD, game

    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout, state_json

    m = game(OVERWORLD)
    m.cells.update(loaded().cells)
    m.put(0x0203735B, b"\x33")
    state = read_game_state(m.read, MAPS)
    geometry = state_json(state)["navigation_grid"]
    assert geometry["elevation"] == 3
    assert len(geometry["tiles"]) == 25
    assert "Navigation map_id: [0,9]" in format_readout(state, bounded_navigation=True)
    assert "Navigation map_id:" not in format_readout(state)
    assert "Current map bounds:" not in format_readout(state, bounded_navigation=True)
    m.put(0x030022C0, struct.pack("<II", 0, 0x08085FFD))
    assert state_json(read_game_state(m.read, MAPS))["navigation_grid"] is None


def test_connection_spans_cannot_cross_memory_regions():
    m = loaded()
    m.put(0x02037324, struct.pack("<I", 0x09FFFFFC))

    def guarded(address, length):
        assert address != 0x09FFFFFC, "Invalid descriptor dereferenced"
        return m.read(address, length)

    assert read_topology(guarded, MapNames({})) is None


def test_descriptor_lower_bound_and_count_ceiling_prevent_reads():
    m = loaded()
    m.put(0x02037324, struct.pack("<I", 4))

    def low_guard(address, length):
        assert address != 4, "Unmapped descriptor dereferenced"
        return m.read(address, length)

    assert read_topology(low_guard, MapNames({})) is None
    m.put(0x02037324, struct.pack("<I", 0x0200A000))
    m.put(0x0200A000, struct.pack("<iI", 17, 0x0200B000))

    def count_guard(address, length):
        assert address != 0x0200B000, "Over-bound connection array read"
        return m.read(address, length)

    assert read_topology(count_guard, MapNames({})) is None
