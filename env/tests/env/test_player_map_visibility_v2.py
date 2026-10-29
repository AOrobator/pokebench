from dataclasses import replace

import pytest
from test_player_map_visibility import field, state

from pokebench_env.player_map_visibility import MapMemory
from pokebench_env.readout import state_json


def test_v2_reveals_whole_fully_lit_current_map_beyond_camera():
    old = MapMemory().project(field(0).read, state())
    new = MapMemory().project(field(0).read, state(), whole_lit=True)
    assert len(old.full_map.tiles) < 625
    assert len(new.full_map.tiles) == 625
    assert len(new.map_visibility.visible) == 625
    assert new.full_map.rows[0][0] == "."
    assert len(new.nearby.tiles) == 625


@pytest.mark.parametrize("level", range(1, 8))
def test_v2_keeps_exact_v1_darkness_projection(level):
    old = MapMemory().project(field(level).read, state())
    new = MapMemory().project(field(level).read, state(), whole_lit=True)
    assert state_json(old) == state_json(new)
    assert len(new.full_map.tiles) < 625


def test_v2_remembers_but_does_not_refresh_hidden_terrain_when_darkness_returns():
    memory = MapMemory()
    first = memory.project(field(0).read, state(), whole_lit=True)
    assert len(first.full_map.tiles) == 625
    base = state()
    changed = replace(
        base,
        full_map=replace(
            base.full_map,
            tiles=tuple(
                replace(t, collision=1) if (t.x, t.y) == (0, 0) else t for t in base.full_map.tiles
            ),
        ),
    )
    hidden = memory.project(field(7).read, changed, whole_lit=True)
    assert next(t for t in hidden.full_map.tiles if (t.x, t.y) == (0, 0)).collision == 0
    assert (0, 0) in hidden.map_visibility.known
    assert (0, 0) not in hidden.map_visibility.visible


@pytest.mark.parametrize("invalid", ["menu", "locked", "hidden_player", "bad_light"])
def test_v2_never_assumes_daylight_when_state_is_unverified(invalid):
    m, current = field(0), state()
    if invalid == "menu":
        current = replace(current, screen="party")
    elif invalid == "locked":
        current = replace(current, field_controls_locked=True)
    elif invalid == "hidden_player":
        m.put(0x02020630 + 0x3E, b"\x05")
    else:
        m.put(0x02010030, b"\xff")
    result = MapMemory().project(m.read, current, whole_lit=True)
    assert not result.full_map.tiles


def test_v2_whole_lit_map_exposes_static_exit_but_not_hidden_actor():
    from pokebench_env.topology import Connection, Topology
    from pokebench_env.world import InteractionTarget
    from pokebench_env.world_context import LiveObject, WorldContext

    base = state()
    # Remote static geometry is visible in a lit map; live actors still require screen/light proof.
    current = replace(
        base,
        world_context=WorldContext((LiveObject(9, (24, 46), 1, "PERSON", 0, 0),), (), None),
        interaction_targets=(
            InteractionTarget("warp", 0, 0, 3, "UP"),
            InteractionTarget("object", 0, 0, 3, "A", local_id=9),
        ),
        topology=Topology(25, 25, (Connection("north", 0, (0, 1), "NEXT", ((0, 0),)),)),
    )
    result = MapMemory().project(field(0).read, current, whole_lit=True)
    assert result.world_context.objects == ()
    assert [t.kind for t in result.interaction_targets] == ["warp"]
    assert result.topology.connections[0].edges == ((0, 0),)
    dark = MapMemory().project(field(7).read, current, whole_lit=True)
    assert not dark.interaction_targets
    assert not dark.topology.connections


def test_v2_production_factory_independent_switch_and_v1_off_identity(monkeypatch):
    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames

    current = state()
    monkeypatch.setattr(rerender, "read_game_state", lambda *a, **kw: current)

    def read(off):
        return rerender.read_state(
            field(0).read, MapNames({}), active_ui=True, off=frozenset(off), visibility=MapMemory()
        )

    assert read({"player-map-visibility-v1", "player-map-visibility-v2"}) is current
    v1 = read({"player-map-visibility-v2"})
    assert len(v1.full_map.tiles) < 625
    assert len(read({"player-map-visibility-v1"}).full_map.tiles) == 625
    assert state_json(read(set())) == state_json(read({"player-map-visibility-v1"}))


def test_installed_observation_delivers_v2_whole_lit_map_with_v1_off(monkeypatch):
    from fastapi import FastAPI
    from test_feature_switches import _Shot
    from test_view import get

    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation
    from pokebench_env.readout import SERVER_FEATURES

    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        ",".join(s for s in SERVER_FEATURES if s != "player-map-visibility-v2"),
    )
    monkeypatch.setattr(rerender, "read_game_state", lambda *a, **kw: state())
    app = FastAPI()
    install_observation(app, lambda: _Shot(), field(0).read, MapNames({}))
    code, _, body = get(app, "/pokebench/observation")
    assert code == 200, body
    import json

    data = json.loads(body)
    assert len(data["state"]["map_visibility"]["visible"]) == 625
    assert len(data["state"]["navigation_grid"]["tiles"]) == 625


def test_v2_requests_full_native_geometry_even_without_other_full_map_features(monkeypatch):
    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES

    seen = []

    def native(*args, **kwargs):
        seen.append(kwargs["full_map_enabled"])
        return state()

    monkeypatch.setattr(rerender, "read_game_state", native)
    for v2 in (False, True):
        off = frozenset(s for s in SERVER_FEATURES if not (v2 and s == "player-map-visibility-v2"))
        rerender.read_state(
            field(0).read, MapNames({}), active_ui=True, off=off, visibility=MapMemory()
        )
    assert seen == [False, True]


def test_standalone_python_defaults_leave_v2_off_without_ts_normalization(monkeypatch):
    from fastapi import FastAPI
    from test_feature_switches import _Shot
    from test_view import get

    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation
    from pokebench_env.readout import features_off_from_env

    monkeypatch.delenv("POKEBENCH_FEATURES_OFF", raising=False)
    assert "player-map-visibility-v2" in features_off_from_env({})
    monkeypatch.setattr(rerender, "read_game_state", lambda *a, **kw: state())
    app = FastAPI()
    install_observation(app, lambda: _Shot(), field(0).read, MapNames({}))
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200, body
    import json

    assert "map_visibility" not in json.loads(body)["state"]
