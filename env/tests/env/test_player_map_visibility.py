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
    first = memory.project(field(0).read, state())
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
    assert all(c == "?" for row in other.full_map.rows for c in row)


@pytest.mark.parametrize("level", range(1, 8))
def test_game_flash_levels_expand_visibility_without_revealing_whole_map(level):
    narrow = MapMemory().project(field(level).read, state())
    wide = MapMemory().project(field(level - 1).read, state())
    assert len(narrow.full_map.tiles) <= len(wide.full_map.tiles)
    assert len(wide.full_map.tiles) < 25 * 25


def test_unverified_layout_or_hidden_player_never_defaults_to_full_visibility():
    m = field(0)
    m.put(0x02020630 + 0x3E, b"\x05")
    result = MapMemory().project(m.read, state())
    assert not result.full_map.tiles
    assert result.map_visibility.diagnostic
    m = field(0)
    m.put(0x02010030, b"\xff")
    assert illumination(m.read, (24, 46)) is None


def test_no_fresh_geometry_is_learned_under_menus_or_locked_field():
    for current in (replace(state(), screen="party"), replace(state(), field_controls_locked=True)):
        result = MapMemory().project(field(0).read, current)
        assert not result.full_map.tiles


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
        field().read, MapNames({}), active_ui=True, off=frozenset({"player-map-visibility-v1"})
    )
    assert off is current
    memory = MapMemory()
    on = rerender.read_state(
        field().read, MapNames({}), active_ui=True, off=frozenset(), visibility=memory
    )
    assert on.full_map.rows[3][4] == "?"
    assert (10, 10) in on.map_visibility.visible
    assert (11, 10) in on.map_visibility.visible
    assert "unseen" in rerender.render(on, frozenset())
    assert "unseen" not in rerender.render(off, frozenset({"player-map-visibility-v1"}))


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
    hidden = sight_report(m.read, MAP, [(4, 4)], visible_ids=frozenset())
    assert hidden["trainers"] == [] and hidden["sightings"] == []


def test_hidden_sight_blockers_do_not_supply_privileged_occlusion_facts():
    from test_trainer_sight import MAP, loaded, sight_report, template, world

    m = world()
    template(m, 0, 3, 5, 2)
    loaded(m, 0, 7, 3, 2, trainer_type=0)
    assert not sight_report(m.read, MAP, [(2, 2)])["sightings"]
    assert sight_report(m.read, MAP, [(2, 2)], visible_ids=frozenset({3}))["sightings"]


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
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "" if enabled else "player-map-visibility-v1")
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
            {"POKEBENCH_FEATURES_OFF": "" if enabled else "player-map-visibility-v1"},
        )
        assert replay == [found]
        assert found["name"] == "CAVE"
        assert found["warps"] == ([] if enabled else place.json()["warps"])
        assert found["connections"] == ([] if enabled else place.json()["connections"])
