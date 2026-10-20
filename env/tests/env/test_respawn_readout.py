"""respawn-readout-v1: where a blackout sends the player, and the centers that would move it.

pret/pokeemerald 731ad5b. SaveBlock1.lastHealLocation (+0x1C, struct WarpData: s8 mapGroup, s8
mapNum, s8 warpId, pad, s16 x, s16 y; include/global.h) is set by setrespawn, which every
*_PokemonCenter_1F OnTransition runs (data/maps/RustboroCity_PokemonCenter_1F/scripts.inc:
setrespawn HEAL_LOCATION_RUSTBORO_CITY). The heal location is the town tile below the center door
(src/data/heal_locations.json: MAP_RUSTBORO_CITY 16,39) or the bedroom (house 2F, 4,2).
DoWhiteOut (src/overworld.c) keeps money / 2, heals the party and warps there.

The b300 layout: RED (male) in RUSTBORO CITY (0/3) with lastHealLocation BRENDANS HOUSE 2F (1/1,
4,2), the center door at (16,38) leading to RUSTBORO CITY POKEMON CENTER 1F (11/5).
"""

import struct

import pytest

from pokebench_env.game_state import GameState, MapNames, read_game_state
from pokebench_env.places import Links
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json
from pokebench_env.rerender import read_state, render
from pokebench_env.respawn import (
    CENTERS,
    HEAL_POINTS,
    SWITCH,
    CenterExit,
    LinkCache,
    Respawn,
    RespawnMemory,
    map_changes,
    read_respawn,
    respawn_line,
)
from tests.env.test_game_state import OVERWORLD, SB1, game

LITTLEROOT, HOUSE_1F, HOUSE_2F = (0, 9), (1, 0), (1, 1)
ROUTE101, OLDALE, ROUTE103 = (0, 16), (0, 10), (0, 18)
RUSTBORO, GYM, CENTER, MART = (0, 3), (11, 3), (11, 5), (11, 7)
OLDALE_CENTER = (2, 2)
MAPS = MapNames(
    {
        LITTLEROOT: "LITTLEROOT TOWN",
        HOUSE_1F: "LITTLEROOT TOWN BRENDANS HOUSE 1F",
        HOUSE_2F: "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        ROUTE101: "ROUTE101",
        OLDALE: "OLDALE TOWN",
        OLDALE_CENTER: "OLDALE TOWN POKEMON CENTER 1F",
        ROUTE103: "ROUTE103",
        RUSTBORO: "RUSTBORO CITY",
        GYM: "RUSTBORO CITY GYM",
        CENTER: "RUSTBORO CITY POKEMON CENTER 1F",
        MART: "RUSTBORO CITY MART",
    }
)
# A small map table: house 2F - 1F - LITTLEROOT - ROUTE101 - OLDALE (+ center) - ROUTE103 -
# RUSTBORO (+ gym, center, mart). Each link is listed one way only: map changes count both.
LINKS = {
    HOUSE_2F: Links(((7, 1, HOUSE_1F),), ()),
    HOUSE_1F: Links(((8, 8, LITTLEROOT),), ()),
    LITTLEROOT: Links((), (("NORTH", ROUTE101),)),
    ROUTE101: Links((), (("NORTH", OLDALE),)),
    OLDALE: Links(((6, 16, OLDALE_CENTER),), ()),
    OLDALE_CENTER: Links((), ()),
    ROUTE103: Links((), (("SOUTH", OLDALE), ("NORTH", RUSTBORO))),
    RUSTBORO: Links(
        ((27, 19, GYM), (16, 45, MART), (16, 38, CENTER), (17, 38, CENTER)),
        (),
    ),
    GYM: Links(((5, 19, RUSTBORO), (6, 19, RUSTBORO)), ()),
    CENTER: Links(((7, 8, RUSTBORO),), ()),
    MART: Links(((3, 7, RUSTBORO),), ()),
}
HOME = Respawn(HOUSE_2F, "LITTLEROOT TOWN BRENDANS HOUSE 2F", 4, 2, 8, ())


def at(memory_map: tuple[int, int], xy: tuple[int, int], heal: tuple[int, int, int, int]) -> object:
    m = game(OVERWORLD)
    m.put(SB1, struct.pack("<hhbb", xy[0], xy[1], *memory_map))
    m.put(SB1 + 0x1C, struct.pack("<bbbxhh", heal[0], heal[1], -1, heal[2], heal[3]))
    return m


# --- game data -----------------------------------------------------------------------------------


def test_heal_points_are_the_game_heal_locations_setrespawn_stores() -> None:
    # heal_locations.json entries that a setrespawn in data/maps/*/scripts.inc names.
    assert HEAL_POINTS[("LITTLEROOT TOWN BRENDANS HOUSE 2F", 4, 2)].kind == "home"
    assert HEAL_POINTS[("LITTLEROOT TOWN MAYS HOUSE 2F", 4, 2)].town == "LITTLEROOT TOWN"
    assert HEAL_POINTS[("RUSTBORO CITY", 16, 39)].center == "RUSTBORO CITY POKEMON CENTER 1F"
    assert HEAL_POINTS[("OLDALE TOWN", 6, 17)].center == "OLDALE TOWN POKEMON CENTER 1F"
    assert HEAL_POINTS[("EVER GRANDE CITY", 18, 6)].center == "EVER GRANDE CITY POKEMON LEAGUE 1F"
    assert HEAL_POINTS[("EVER GRANDE CITY", 27, 49)].center == "EVER GRANDE CITY POKEMON CENTER 1F"
    assert HEAL_POINTS[("BATTLE FRONTIER OUTSIDE EAST", 3, 52)].town == "BATTLE FRONTIER"
    assert ("LITTLEROOT TOWN", 5, 9) not in HEAL_POINTS  # fly only; no setrespawn names it
    assert len([p for p in HEAL_POINTS.values() if p.kind != "home"]) == 17
    assert CENTERS["RUSTBORO CITY POKEMON CENTER 1F"] == ("RUSTBORO CITY", 16, 39)
    assert len(CENTERS) == 17


def test_map_changes_count_fewest_changes_both_ways_like_hops_from() -> None:
    assert map_changes(LINKS, RUSTBORO, RUSTBORO) == 0
    assert map_changes(LINKS, RUSTBORO, HOUSE_2F) == 6
    assert map_changes(LINKS, GYM, HOUSE_2F) == 7
    assert map_changes(LINKS, HOUSE_2F, GYM) == 7
    assert map_changes(LINKS, GYM, (5, 5)) is None


# --- reading -------------------------------------------------------------------------------------


def test_reads_the_saved_heal_location_and_the_centers_this_map_leads_to() -> None:
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    respawn = read_respawn(m.read, SB1, RUSTBORO, MAPS, LINKS)
    assert respawn == Respawn(
        HOUSE_2F,
        "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        4,
        2,
        6,
        (CenterExit(CENTER, "RUSTBORO CITY POKEMON CENTER 1F", 16, 38),),
    )


def test_a_center_that_set_the_heal_location_is_not_listed() -> None:
    m = at(RUSTBORO, (15, 59), (0, 3, 16, 39))
    respawn = read_respawn(m.read, SB1, RUSTBORO, MAPS, LINKS)
    assert respawn is not None and respawn.centers == () and respawn.hops == 0


def test_standing_in_a_center_that_is_not_the_heal_location_lists_it_without_a_door() -> None:
    m = at(CENTER, (7, 7), (1, 1, 4, 2))
    respawn = read_respawn(m.read, SB1, CENTER, MAPS, LINKS)
    assert respawn is not None
    assert respawn.centers == (CenterExit(CENTER, "RUSTBORO CITY POKEMON CENTER 1F", None, None),)


@pytest.mark.parametrize("heal", [(-1, -1, 0, 0), (1, -1, 0, 0), (40, 40, 0, 0)])
def test_an_unset_or_unknown_heal_location_gives_nothing(heal: tuple[int, int, int, int]) -> None:
    m = at(RUSTBORO, (15, 59), heal)
    assert read_respawn(m.read, SB1, RUSTBORO, MAPS, LINKS) is None


def test_a_short_read_gives_nothing() -> None:
    assert read_respawn(lambda _a, _n: b"", SB1, RUSTBORO, MAPS, LINKS) is None


def test_link_cache_reads_the_map_table_once() -> None:
    calls: list[int] = []
    cache = LinkCache()

    def read(address: int, length: int) -> bytes:
        calls.append(address)
        return bytes(length)

    assert cache.get(read, MAPS) == {}
    first = len(calls)
    assert cache.get(read, MAPS) == {}
    assert len(calls) == first
    assert LinkCache(LINKS).get(read, MAPS) is LINKS


# --- the line ------------------------------------------------------------------------------------


def test_home_line_in_operators_words_with_the_game_money_rule() -> None:
    assert respawn_line(HOME, 6444, None, {}) == (
        "If your party faints, you wake up at your house in LITTLEROOT TOWN "
        "(8 map changes from here) and lose half your money (₽3222 of ₽6444)."
    )


@pytest.mark.parametrize(("money", "loss"), [(6445, 3223), (1, 1), (0, 0), (999999, 500000)])
def test_the_loss_is_what_money_div_2_leaves(money: int, loss: int) -> None:
    assert f"(₽{loss} of ₽{money})" in respawn_line(HOME, money, None, {})


def test_unknown_money_and_distance_are_left_out_and_zero_is_on_this_map() -> None:
    far = Respawn(HOUSE_2F, "LITTLEROOT TOWN BRENDANS HOUSE 2F", 4, 2, None, ())
    assert respawn_line(far, None, None, {}) == (
        "If your party faints, you wake up at your house in LITTLEROOT TOWN "
        "and lose half your money."
    )
    here = Respawn(HOUSE_2F, "LITTLEROOT TOWN BRENDANS HOUSE 2F", 4, 2, 0, ())
    assert "(on this map)" in respawn_line(here, 10, None, {})
    one = Respawn(HOUSE_2F, "LITTLEROOT TOWN BRENDANS HOUSE 2F", 4, 2, 1, ())
    assert "(1 map change from here)" in respawn_line(one, 10, None, {})


def test_center_league_and_other_heal_locations_are_named_as_the_game_places_them() -> None:
    center = Respawn(RUSTBORO, "RUSTBORO CITY", 16, 39, 2, ())
    assert respawn_line(center, 100, None, {}).startswith(
        "If your party faints, you wake up outside the POKéMON CENTER in RUSTBORO CITY "
        "(2 map changes from here)"
    )
    league = Respawn((0, 11), "EVER GRANDE CITY", 18, 6, 1, ())
    assert "outside the POKéMON LEAGUE in EVER GRANDE CITY" in respawn_line(league, 100, None, {})
    frontier = Respawn((26, 0), "BATTLE FRONTIER OUTSIDE EAST", 3, 52, 1, ())
    assert "outside the POKéMON CENTER in BATTLE FRONTIER" in respawn_line(frontier, 100, None, {})
    other = Respawn(LITTLEROOT, "LITTLEROOT TOWN", 5, 9, 3, ())
    assert "you wake up at LITTLEROOT TOWN (5,9) (3 map changes" in respawn_line(
        other, 100, None, {}
    )


def test_a_center_not_entered_in_a_complete_history_reads_as_operator_wrote_it() -> None:
    memory = RespawnMemory()
    memory.note(started_state(False))
    respawn = Respawn(
        HOUSE_2F,
        "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        4,
        2,
        8,
        (CenterExit(CENTER, "RUSTBORO CITY POKEMON CENTER 1F", 16, 38),),
    )
    line = respawn_line(respawn, 6444, memory, {}, here="RUSTBORO CITY")
    assert line == (
        "If your party faints, you wake up at your house in LITTLEROOT TOWN "
        "(8 map changes from here) and lose half your money (₽3222 of ₽6444). "
        "This town has a POKéMON CENTER you have not entered: RUSTBORO CITY POKEMON CENTER 1F "
        "at (16,38). Entering a POKéMON CENTER makes it the place you wake up if your party faints."
    )


def test_a_center_entered_before_reads_as_no_longer_where_you_wake_up() -> None:
    memory = RespawnMemory()
    memory.note(started_state(False))
    memory.note(started_state(True, location="RUSTBORO CITY POKEMON CENTER 1F"))
    respawn = Respawn(
        OLDALE,
        "OLDALE TOWN",
        6,
        17,
        3,
        (CenterExit(CENTER, "RUSTBORO CITY POKEMON CENTER 1F", 16, 38),),
    )
    line = respawn_line(respawn, 100, memory, {}, here="RUSTBORO CITY")
    assert line.endswith(
        "This town has a POKéMON CENTER you entered before, but it is no longer where you wake "
        "up: RUSTBORO CITY POKEMON CENTER 1F at (16,38). Entering a POKéMON CENTER makes it the "
        "place you wake up if your party faints."
    )


def test_without_a_complete_history_it_claims_nothing_about_entering() -> None:
    respawn = Respawn(
        HOUSE_2F,
        "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        4,
        2,
        8,
        (CenterExit(CENTER, "RUSTBORO CITY POKEMON CENTER 1F", 16, 38),),
    )
    checkpoint = RespawnMemory()
    checkpoint.note(started_state(True, location="RUSTBORO CITY"))
    for memory in (None, checkpoint):
        line = respawn_line(respawn, 100, memory, {CENTER: "POKéMON CENTER"}, here="ROUTE104")
        assert line.endswith(
            "An exit here leads to a POKéMON CENTER that is not where you wake up: POKéMON CENTER "
            "at (16,38). Entering a POKéMON CENTER makes it the place you wake up if your party "
            "faints."
        )
        assert "not entered" not in line and "entered before" not in line


def test_standing_in_such_a_center_says_so() -> None:
    respawn = Respawn(
        HOUSE_2F,
        "LITTLEROOT TOWN BRENDANS HOUSE 2F",
        4,
        2,
        9,
        (CenterExit(CENTER, "RUSTBORO CITY POKEMON CENTER 1F", None, None),),
    )
    assert respawn_line(respawn, 100, None, {}, here="RUSTBORO CITY POKEMON CENTER 1F").endswith(
        "You are in RUSTBORO CITY POKEMON CENTER 1F, and it is not yet where you wake up. "
        "Entering a POKéMON CENTER makes it the place you wake up if your party faints."
    )


# --- memory --------------------------------------------------------------------------------------


def started_state(
    started: bool, location: str | None = None, respawn: Respawn | None = None
) -> GameState:
    return GameState(
        screen="overworld" if started else "title",
        started=started,
        name=None,
        location=location,
        map_id=None,
        position=None,
        facing=None,
        in_battle=False,
        party=None,
        money=None,
        badges=None,
        play_time=None,
        respawn=respawn,
    )


def test_memory_is_complete_only_from_before_the_save_existed_and_learns_from_heal_locations() -> (
    None
):
    memory = RespawnMemory()
    assert memory.complete is None
    memory.note(started_state(False))
    memory.note(started_state(True, location="RUSTBORO CITY"))
    assert memory.complete is True and memory.entered == set()
    memory.note(
        started_state(
            True,
            location="RUSTBORO CITY",
            respawn=Respawn(OLDALE, "OLDALE TOWN", 6, 17, 3, ()),
        )
    )
    memory.note(started_state(True, respawn=HOME))
    assert memory.entered == {"OLDALE TOWN POKEMON CENTER 1F"}
    late = RespawnMemory()
    late.note(started_state(True))
    late.note(started_state(False))
    assert late.complete is False


# --- wiring --------------------------------------------------------------------------------------


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH == "respawn-readout-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_read_game_state_reads_it_only_with_links_and_on_the_field() -> None:
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    assert read_game_state(m.read, MAPS).respawn is None
    state = read_game_state(m.read, MAPS, respawn_links=LinkCache(LINKS))
    assert state.respawn is not None and state.respawn.hops == 6


def test_readout_places_the_line_after_money_and_off_is_byte_for_byte() -> None:
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    default = features_off_from_env({})
    on = default - {SWITCH}
    before = render(read_state(m.read, MAPS, active_ui=True, off=default), default)
    unwired = render(
        read_state(m.read, MAPS, active_ui=True, off=default, links=LinkCache(LINKS)), default
    )
    assert unwired == before
    state = read_state(m.read, MAPS, active_ui=True, off=on, links=LinkCache(LINKS))
    after = render(state, on)
    lines = after.splitlines()
    money = lines.index("Money: ₽3000")
    assert lines[money + 1] == (
        "If your party faints, you wake up at your house in LITTLEROOT TOWN (6 map changes from "
        "here) and lose half your money (₽1500 of ₽3000). This town has a POKéMON CENTER that is "
        "not where you wake up: RUSTBORO CITY POKEMON CENTER 1F at (16,38). Entering a "
        "POKéMON CENTER makes it the place you wake up if your party faints."
    )
    assert [line for line in lines if not line.startswith("If your party faints")] == (
        render(read_state(m.read, MAPS, active_ui=True, off=on), on).splitlines()
    )
    # The state JSON is unchanged: the facts reach the model only as this line.
    assert state_json(state) == state_json(read_state(m.read, MAPS, active_ui=True, off=default))


def test_readout_uses_the_memory_and_the_town_wording() -> None:
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    on = features_off_from_env({}) - {SWITCH}
    memory = RespawnMemory()
    memory.note(started_state(False))
    state = read_state(m.read, MAPS, active_ui=True, off=on, links=LinkCache(LINKS))
    memory.note(state)
    text = format_readout(state, on, respawn_memory=memory)
    assert "This town has a POKéMON CENTER you have not entered: RUSTBORO CITY" in text


def test_no_line_in_battle_or_off_the_field() -> None:
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    m.put(0x030022C0, struct.pack("<II", 0x0, 0x080E4F59))
    on = features_off_from_env({}) - {SWITCH}
    state = read_state(m.read, MAPS, active_ui=True, off=on, links=LinkCache(LINKS))
    assert state.respawn is None
    assert "If your party faints" not in render(state, on)


def test_no_line_in_battle() -> None:
    from pokebench_env.game_state import IN_BATTLE

    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    m.put(IN_BATTLE, bytes([0x02]))
    on = features_off_from_env({}) - {SWITCH}
    assert read_state(m.read, MAPS, active_ui=True, off=on, links=LinkCache(LINKS)).respawn is None


def test_the_observation_endpoint_learns_from_every_read_and_renders_with_its_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import json

    from fastapi import FastAPI

    from pokebench_env import observation as observation_module
    from pokebench_env.observation import install_observation
    from tests.env.test_feature_switches import _Shot
    from tests.env.test_game_state import NAMING
    from tests.env.test_view import get

    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    monkeypatch.setattr(observation_module, "LinkCache", lambda: LinkCache(LINKS))
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    m.put(0x030022C0, struct.pack("<II", *NAMING))
    app = FastAPI()
    install_observation(app, lambda: _Shot(), m.read, MAPS)
    assert get(app, "/pokebench/state")[0] == 200  # before the save existed: a complete history
    m.put(0x030022C0, struct.pack("<II", *OVERWORLD))
    status, _, body = get(app, "/pokebench/observation")
    text = json.loads(body)["state_text"]
    assert status == 200
    assert "This town has a POKéMON CENTER you have not entered: RUSTBORO CITY" in text
    assert "respawn" not in json.loads(body)["state"]


def test_the_observation_endpoint_without_the_switch_reads_no_map_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import json

    from fastapi import FastAPI

    from pokebench_env import observation as observation_module
    from pokebench_env.observation import install_observation
    from tests.env.test_feature_switches import _Shot
    from tests.env.test_view import get

    def refuse() -> LinkCache:
        raise AssertionError("map table read with the switch off")

    monkeypatch.delenv("POKEBENCH_FEATURES_OFF", raising=False)
    monkeypatch.setattr(observation_module, "LinkCache", refuse)
    m = at(RUSTBORO, (15, 59), (1, 1, 4, 2))
    app = FastAPI()
    install_observation(app, lambda: _Shot(), m.read, MAPS)
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200 and "If your party faints" not in json.loads(body)["state_text"]
