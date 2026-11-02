import json
import struct
from dataclasses import replace

import pytest
from test_map_layout import context_memory

from pokebench_env.game_state import GameState
from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.player_map_visibility import MapMemory, illumination
from pokebench_env.readout import state_json


def field(level=7):
    m = context_memory()
    m.put(0x05000000, b"\xff\x7f")
    m.put(0x02010030, bytes([level]))
    body = bytearray(0x24)
    body[0] = 1
    body[2] = 1
    body[4] = 0
    body[8:11] = bytes([255, 46, 24])
    struct.pack_into("<hhhh", body, 0x10, 17, 17, 17, 17)
    m.put(0x02037350, body)
    sprite = bytearray(0x44)
    # 16x32 rendered player, feet in tile centered at (120,80).
    struct.pack_into("<HH", sprite, 0, 0x8000 | 56, 0x8000 | 112)
    sprite[0x3E] = 1
    m.put(0x02020630, sprite)
    return m


def state():
    tiles = tuple(MapTile(x, y, 0, 0, 0, 3) for y in range(25) for x in range(25))
    full = FullMap(25, 25, tuple("." * 25 for _ in range(25)), tiles, (), ())
    return GameState(
        "overworld",
        True,
        "A",
        "CAVE",
        (24, 46),
        (10, 10),
        "up",
        False,
        (),
        0,
        (),
        (0, 0, 0),
        field_controls_locked=False,
        full_map=full,
        nearby=LocalMap((0, 0), full.rows, tiles, (), ()),
    )


def test_darkness_hides_remote_tiles_in_text_and_both_navigation_grids():
    result = MapMemory().project(field().read, state())
    payload = state_json(result)
    assert result.full_map is not None
    assert result.full_map.rows[3][4] == "?"
    assert payload["map_grid"]["rows"][3][16:20] == "ffff"
    assert not any(t["x"] == 4 and t["y"] == 3 for t in payload["navigation_grid"]["tiles"])
    assert payload["map_visibility"]["known"]
    assert result.map_visibility is not None


def test_remembered_terrain_is_not_refreshed_when_hidden_and_maps_do_not_share_memory():
    memory = MapMemory()
    first = memory.project(field(1).read, state())
    assert first.full_map.rows[10][14] == "."
    changed = replace(
        state(),
        full_map=replace(
            state().full_map,
            tiles=tuple(
                replace(t, collision=1) if (t.x, t.y) == (14, 10) else t
                for t in state().full_map.tiles
            ),
        ),
    )
    hidden = memory.project(field(7).read, changed)
    tile = next(t for t in hidden.full_map.tiles if (t.x, t.y) == (14, 10))
    assert tile.collision == 0
    other = memory.project(field(7).read, replace(changed, map_id=(24, 47)))
    assert (14, 10) not in other.map_visibility.known


@pytest.mark.parametrize("level", range(1, 8))
def test_game_flash_levels_expand_visibility_without_revealing_whole_map(level):
    narrow = MapMemory().project(field(level).read, state())
    wide = MapMemory().project(field(level - 1).read, state())
    assert len(narrow.full_map.tiles) <= len(wide.full_map.tiles)
    assert len(wide.full_map.tiles) == 625 if level == 1 else len(wide.full_map.tiles) < 625


def test_unverified_layout_or_hidden_player_never_defaults_to_full_visibility():
    m = field(0)
    m.put(0x02020630 + 0x3E, b"\x05")
    result = MapMemory().project(m.read, state())
    assert not result.full_map.tiles
    assert result.map_visibility.diagnostic
    m = field(0)
    m.put(0x02010030, b"\xff")
    assert illumination(m.read, (24, 46)) is None


def test_no_fresh_geometry_is_learned_under_menus_and_a_lock_only_keeps_what_is_lit():
    menus = MapMemory().project(field(0).read, replace(state(), screen="party"))
    assert not menus.full_map.tiles
    locked_lit = MapMemory().project(field(0).read, replace(state(), field_controls_locked=True))
    assert len(locked_lit.full_map.tiles) == 625
    locked_dark = MapMemory().project(field(7).read, replace(state(), field_controls_locked=True))
    assert locked_dark.map_visibility.visible
    assert len(locked_dark.map_visibility.visible) < 625
    assert locked_dark.full_map.rows[0][0] == "?"


def test_projection_removes_template_reachability_and_offscreen_bypasses():
    from pokebench_env.heal_trainers import HealFacts, MapTrainer
    from pokebench_env.offscreen_objects import MapObject
    from pokebench_env.world_context import LiveObject, WorldContext

    current = state()
    trainer = MapTrainer(1, 4, 3, 126, "BRAWLY", 1, False, False)
    current = replace(
        current,
        heal_trainers=HealFacts((trainer,), (), None, None, False, True),
        world_context=WorldContext((LiveObject(1, (24, 46), 126, "BRAWLY", 4, 3),), (), None),
        offscreen_objects=(MapObject(1, 126, "BRAWLY", 4, 3, False),),
    )
    result = MapMemory().project(field().read, current)
    text = json.dumps(state_json(result))
    assert "BRAWLY" not in text
    assert not result.heal_trainers.trainers
    assert result.offscreen_objects is None


def test_production_read_state_factory_switch_and_off_identity(monkeypatch):
    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames

    current = state()
    monkeypatch.setattr(rerender, "read_game_state", lambda *a, **kw: current)
    off = rerender.read_state(
        field().read,
        MapNames({}),
        active_ui=True,
        off=frozenset({"player-map-visibility-v2"}),
    )
    assert off is current
    memory = MapMemory()
    on = rerender.read_state(
        field().read,
        MapNames({}),
        active_ui=True,
        off=frozenset(),
        visibility=memory,
    )
    assert on.full_map.rows[3][4] == "?"
    assert (10, 10) in on.map_visibility.visible
    assert (11, 10) in on.map_visibility.visible
    assert "unseen" in rerender.render(on, frozenset())
    assert "unseen" not in rerender.render(off, frozenset({"player-map-visibility-v2"}))


@pytest.mark.parametrize("flags", [0x20, 0x40, 0x60])
def test_native_invisible_and_offscreen_flags_cannot_reveal_geometry(flags):
    m = field(0)
    m.put(0x02037351, bytes([flags]))
    assert not MapMemory().project(m.read, state()).full_map.tiles


def test_native_scene_reader_does_not_disclose_actors_through_darkness():
    from pokebench_env.scene_journal import read_scene

    m = field(7)
    m.put(0x030022C4, struct.pack("<I", 0x08085E5D))
    m.put(0x03000F2C, b"\x00")
    # The player sprite itself is partly outside the light circle; no full actor box is exposed.
    assert read_scene(m.read, player_visibility=True).actors == ()
    assert len(read_scene(m.read).actors) == 1


def test_installed_observation_factory_delivers_masked_state_and_readout(monkeypatch):
    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_view import get

    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation

    class Shot(BaseModel):
        screenshot_base64: str = "encoded game frame"

    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    monkeypatch.setattr(rerender, "read_game_state", lambda *a, **kw: state())
    app = FastAPI()
    install_observation(app, Shot, field().read, MapNames({}))
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200
    payload = json.loads(body)
    assert "Map visibility:" in payload["state_text"]
    assert "Whole current map from live memory" in payload["state_text"]
    assert "Next tiles:" in payload["state_text"]
    assert "?" in payload["state_text"].split("Whole current map", 1)[1]
    assert payload["state"]["map_grid"]["rows"][3][16:20] == "ffff"
    assert payload["screenshot_base64"] == "encoded game frame"
    assert payload["state"]["map_visibility"]["known"]


def test_clock_rewind_drops_future_map_knowledge_and_currently_visible_warps_refresh():
    memory = MapMemory()
    m = field(0)
    m.put(0x030022E0, struct.pack("<I", 100))
    full = replace(state().full_map, warps=((14, 10, 1, 1),))
    current = replace(state(), full_map=full)
    assert memory.project(m.read, current).full_map.warps
    m.put(0x02010030, b"\x07")
    m.put(0x030022E0, struct.pack("<I", 101))
    assert memory.project(m.read, state()).full_map.warps  # hidden: remembered, not refreshed
    m.put(0x02010030, b"\x00")
    m.put(0x030022E0, struct.pack("<I", 102))
    assert not memory.project(m.read, state()).full_map.warps  # seen removal
    m.put(0x02010030, b"\x07")
    m.put(0x030022E0, struct.pack("<I", 10))
    result = memory.project(m.read, state())
    assert (14, 10) not in result.map_visibility.known


def test_missing_geometry_and_pregame_never_add_map_knowledge():
    memory = MapMemory()
    current = replace(state(), map_id=None, position=None, full_map=None, nearby=None)
    assert memory.project(field().read, current) is current
    result = memory.project(field().read, replace(state(), full_map=None, nearby=None))
    assert result.map_observation is None
    assert result.map_visibility.diagnostic
    assert not memory.maps


def test_unsupported_sprite_shape_is_unavailable_and_player_bobbing_does_not_move_the_map():
    from pokebench_env.player_map_visibility import sprite_rect

    m = field(0)
    body = m.read(0x02037350, 0x24)
    m.put(0x02020630, struct.pack("<H", 0xC000))
    assert sprite_rect(m.read, body) is None
    m = field(7)
    baseline = MapMemory().project(m.read, state()).map_visibility.visible
    m.put(0x02020630, struct.pack("<H", 0x8000 | 58))
    m.put(0x02020630 + 0x26, struct.pack("<h", 2))
    assert MapMemory().project(m.read, state()).map_visibility.visible == baseline


@pytest.mark.parametrize(
    "address,body",
    [
        (0x02037FDB, b"\x80"),
        (0x04000000, b"\x80\x00"),
        (0x05000000, bytes(0x400)),
    ],
)
def test_fades_forced_blank_and_black_palettes_never_reveal_a_map(address, body):
    m = field(0)
    m.put(address, body)
    result = MapMemory().project(m.read, state())
    assert not result.full_map.tiles
    assert result.map_visibility.diagnostic


def test_trainer_sight_cannot_name_a_hidden_trainer():
    from test_trainer_sight import MAP, SCRIPT, sight_report, template, world

    m = world()
    template(m, 0, 1, 5, 4, script=SCRIPT)
    original = sight_report(m.read, MAP, [(4, 4)])
    assert original["trainers"]
    assert sight_report(m.read, MAP, [(4, 4)], visible_ids=frozenset())["available"] is False
    assert (
        sight_report(m.read, MAP, [(4, 4)], visible_tiles=state().full_map.tiles)["available"]
        is False
    )
    hidden = sight_report(
        m.read, MAP, [(4, 4)], visible_ids=frozenset(), visible_tiles=state().full_map.tiles
    )
    assert hidden["trainers"] == [] and hidden["sightings"] == []


def test_hidden_sight_blockers_do_not_supply_privileged_occlusion_facts():
    from test_trainer_sight import MAP, loaded, sight_report, template, world

    m = world()
    template(m, 0, 3, 5, 2)
    loaded(m, 0, 7, 3, 2, trainer_type=0)
    loaded(m, 1, 3, 5, 2)
    assert not sight_report(m.read, MAP, [(2, 2)])["sightings"]
    assert sight_report(
        m.read, MAP, [(2, 2)], visible_ids=frozenset({3}), visible_tiles=state().full_map.tiles
    )["sightings"]


def test_bright_scripted_scenes_still_capture_currently_visible_people():
    from pokebench_env.scene_journal import read_scene

    m = field(0)
    m.put(0x030022C4, struct.pack("<I", 0x08085E5D))
    m.put(0x03000F2C, b"\x01")
    assert len(read_scene(m.read, player_visibility=True).actors) == 1


def test_respawn_guidance_keeps_visible_centers_without_disclosing_hidden_entrances():
    from pokebench_env.rerender import render
    from pokebench_env.respawn import CenterExit, Respawn

    hidden = CenterExit((3, 1), "DEWFORD TOWN POKEMON CENTER 1F", 4, 3)
    visible = CenterExit((2, 1), "OLDALE TOWN POKEMON CENTER 1F", 11, 10)
    respawn = Respawn((0, 11), "DEWFORD TOWN", 2, 11, 5, (hidden, visible))
    result = MapMemory().project(field().read, replace(state(), respawn=respawn))
    assert result.respawn.centers == (visible,)
    assert result.respawn.hops is None
    text = render(result, frozenset())
    assert "at (4,3)" not in text
    assert "at (11,10)" in text
    assert "5 map changes" not in text


def test_installed_catalog_keeps_place_names_without_leaking_the_global_route_graph(
    monkeypatch, tmp_path
):
    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_view import get

    from pokebench_env.game_state import MapNames
    from pokebench_env.observation import install_observation
    from pokebench_env.places import Links, Place, PlaceDirectory

    class Shot(BaseModel):
        screenshot_base64: str = "game frame"

    place = Place((24, 46), "CAVE", "CAVE", Links(((4, 3, (24, 47)),), (("NORTH", (24, 48)),)))
    monkeypatch.setattr(PlaceDirectory, "places", lambda self, **kw: [place])
    for enabled in (False, True):
        monkeypatch.setenv(
            "POKEBENCH_FEATURES_OFF",
            "" if enabled else "player-map-visibility-v2",
        )
        app = FastAPI()
        install_observation(app, Shot, field().read, MapNames({}))
        status, _, body = get(app, "/pokebench/places")
        assert status == 200
        found = json.loads(body)["places"][0]
        from pokebench_env import rerender

        ref = rerender.RawRef("raw-ram/unused.json.gz", "unused")
        replay = rerender.places(
            tmp_path,
            ref,
            lambda path, sha: field().read,
            MapNames({}),
            {"POKEBENCH_FEATURES_OFF": "" if enabled else "player-map-visibility-v2"},
        )
        assert replay == [found]
        assert found["name"] == "CAVE"
        assert found["warps"] == ([] if enabled else place.json()["warps"])
        assert found["connections"] == ([] if enabled else place.json()["connections"])


def test_readout_does_not_turn_hidden_objects_or_connections_into_nonexistence():
    from pokebench_env.rerender import render
    from pokebench_env.topology import Connection, Topology

    current = replace(
        state(), topology=Topology(25, 25, (Connection("NORTH", 0, (0, 1), "TOWN", ((10, 0),)),))
    )
    result = MapMemory().project(field().read, current)
    text = render(result, frozenset())
    assert "Live objects currently visible: none" in text
    assert "none on this map" not in text
    assert "none defined" not in text
    assert "none currently visible" in text


def test_installed_trainer_check_does_not_refresh_hidden_ray_geometry(monkeypatch):
    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_checkpoint import post
    from test_trainer_sight import MAP, block, loaded, template, world

    from pokebench_env import observation
    from pokebench_env.game_state import MapNames
    from pokebench_env.player_map_visibility import MapVisibility
    from pokebench_env.world_context import LiveObject, WorldContext

    class Shot(BaseModel):
        screenshot_base64: str = "frame"

    m = world()
    template(m, 0, 3, 5, 2, sight=5)
    loaded(m, 0, 3, 5, 2, sight=5)
    current = replace(
        state(),
        map_id=MAP,
        position=(1, 2),
        world_context=WorldContext((LiveObject(3, MAP, 35, "BOY_1", 5, 2),), (), None),
        map_visibility=MapVisibility(
            ((1, 2), (2, 2), (3, 2), (4, 2), (5, 2)), ((2, 2), (5, 2)), None
        ),
    )
    monkeypatch.setattr(observation, "read_state", lambda *a, **kw: current)
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    app = FastAPI()
    observation.install_observation(app, Shot, m.read, MapNames({}))

    def check():
        status, body = post(
            app,
            "/pokebench/trainer-sight",
            json.dumps({"map_id": list(MAP), "tiles": [[2, 2]]}).encode(),
        )
        assert status == 200
        return json.loads(body)

    before = check()
    block(m, 3, 2, collision=1)
    assert check() == before
    assert before["available"] is False

    # A qualified, fully visible ray still works, from the current actor position only.
    current = replace(
        current,
        map_visibility=MapVisibility(
            current.map_visibility.known, tuple((x, 2) for x in range(2, 6)), None
        ),
    )
    qualified = check()
    assert qualified["available"] is True
    assert qualified["sightings"][0]["from"] == [5, 2]


def test_visibility_sight_never_uses_a_loaded_trainers_hypothetical_template_origins():
    from test_trainer_sight import MAP, loaded, sight_report, template, world

    m = world()
    template(m, 0, 3, 1, 2, movement=0x02)
    loaded(m, 0, 3, 5, 2, movement=0x02)
    m.put(0x02037350 + 0x0C, struct.pack("<hh", 8, 9))  # initial native tile1,2; current tile5,2
    legacy = sight_report(m.read, MAP, [(1, 4)])
    assert any(s["from"] != [5, 2] for s in legacy["sightings"])
    safe = sight_report(
        m.read, MAP, [(1, 4)], visible_ids=frozenset({3}), visible_tiles=state().full_map.tiles
    )
    assert safe["available"] is True
    assert safe["sightings"] == []


def test_special_all_direction_trainer_sight_is_unavailable_instead_of_claiming_a_clear_route():
    from test_trainer_sight import MAP, loaded, sight_report, template, world

    m = world()
    template(m, 0, 3, 4, 4, trainer_type=3, movement=0x3F)
    loaded(m, 0, 3, 4, 4, trainer_type=3, movement=0x3F)
    assert sight_report(m.read, MAP, [(4, 2)])["sightings"]
    safe = sight_report(
        m.read, MAP, [(4, 2)], visible_ids=frozenset({3}), visible_tiles=state().full_map.tiles
    )
    assert safe["available"] is False


@pytest.mark.parametrize("enabled", [False, True])
def test_archive_factory_delivers_visibility_and_retains_hidden_terrain(
    monkeypatch, tmp_path, enabled
):
    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames

    original = replace(state(), local_map="native geometry")
    changed = replace(
        original,
        full_map=replace(
            original.full_map,
            rows=tuple(
                row[:14] + "#" + row[15:] if y == 10 else row
                for y, row in enumerate(original.full_map.rows)
            ),
            tiles=tuple(
                replace(t, collision=1) if (t.x, t.y) == (14, 10) else t
                for t in original.full_map.tiles
            ),
        ),
    )
    snapshots = iter((original, changed))
    monkeypatch.setattr(rerender, "read_game_state", lambda *a, **kw: next(snapshots))
    readers = iter((field(0).read, field(7).read))
    refs = [
        rerender.RawRef("raw-ram/first.json.gz", "first"),
        rerender.RawRef("raw-ram/second.json.gz", "second"),
    ]
    outputs = rerender.rerender(
        tmp_path,
        refs,
        lambda path, sha: next(readers),
        MapNames({}),
        {"POKEBENCH_FEATURES_OFF": "" if enabled else "player-map-visibility-v2"},
    )
    assert len(outputs) == 2
    assert ("Map visibility:" in outputs[1]) is enabled, outputs[1]
    assert ("?" in outputs[1]) is enabled, outputs[1]
    assert ("#" in outputs[1]) is not enabled, outputs[1]
    remembered_row = next(line for line in outputs[1].splitlines() if line.startswith("  10 "))
    assert remembered_row[5 + 14] == ("." if enabled else "#"), outputs[1]


@pytest.mark.parametrize("safe_capture", [False, True])
@pytest.mark.parametrize("enabled", [False, True])
def test_installed_scene_history_filters_hidden_actors_in_both_capture_modes(
    monkeypatch, tmp_path, safe_capture, enabled
):
    from fastapi import FastAPI
    from test_scene_journal import actor, raw_sample
    from test_scene_journal import field as scene_field
    from test_view import get

    import pokebench_env.scene_journal as module

    m = scene_field()
    m.put(0x05000000, b"\xff\x7f")
    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        "" if enabled else "player-map-visibility-v2",
    )
    monkeypatch.setattr(module, "main_loop_idle", lambda read: True)
    monkeypatch.setattr(module, "illumination", lambda read, map_id: module.VIEWPORT)

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            actor(m, 1, 9, 10, 10)
            actor(m, 2, 10, 11, 10)
            # The old journal ignores the native offscreen bit; the visible actor owner rejects it.
            m.put(0x02037350 + 2 * 0x24 + 1, b"\x40")

    api = FastAPI()
    module.install_scene_journal(
        api,
        Emulator,
        m.read,
        lambda: "png",
        safe_capture=safe_capture,
        raw_capture=raw_sample if safe_capture else None,
        diagnostics_dir=tmp_path if safe_capture else None,
    )
    Emulator().run_frame_with_buttons([])
    status, _, body = get(api, "/pokebench/scene/events")
    assert status == 200
    entries = json.loads(body)["entries"]
    text = "\n".join(e["text"] for e in entries)
    assert "object 9 " in text, entries
    assert ("object 10 " in text) is not enabled, entries


@pytest.mark.parametrize(("tiles", "route"), [((), ()), ((MapTile(1, 1, 0, 0, 0, 3),), ((4, 4),))])
def test_visibility_forecast_requires_nonempty_terrain_and_every_route_tile(tiles, route):
    from test_trainer_sight import MAP, sight_report, world

    report = sight_report(world().read, MAP, route, visible_ids=frozenset(), visible_tiles=tiles)
    assert report == {
        "available": False,
        "reason": "trainer sight requires currently visible terrain",
    }


def test_installed_visibility_preserves_game_owned_measurement_facts(monkeypatch):
    from fastapi import FastAPI
    from test_feature_switches import MAPS, _Shot, map_memory
    from test_view import get

    from pokebench_env.observation import install_observation

    states = []
    for off in ("player-map-visibility-v2", ""):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        states.append(json.loads(body)["state"])
    facts = (
        "screen",
        "active_ui",
        "story",
        "started",
        "name",
        "location",
        "map_id",
        "position",
        "facing",
        "in_battle",
        "party_ownership",
        "party",
        "game_stats",
        "story_progress",
        "route103_rival",
        "trainer_opponent",
        "battle",
        "running",
        "blackout_active",
        "money",
        "badges",
        "play_time_s",
    )
    assert {key: states[0][key] for key in facts} == {key: states[1][key] for key in facts}
    assert "map_visibility" not in states[0]
    assert "map_visibility" in states[1]
    assert states[0]["navigation_grid"] is not None
    assert states[1]["navigation_grid"] is None
