"""warp-areas-v1: pads grouped by landing area. Facts per pad, never a route."""

from dataclasses import replace

import pokebench_env.map_sections as owner
from pokebench_env.exit_labels import RomMap
from pokebench_env.game_state import GameState
from pokebench_env.map_sections import ExitSections, SectionExit
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.warp_areas import (
    SWITCH,
    AreaFacts,
    AreaVisits,
    LandingFacts,
    warp_area_lines,
)
from pokebench_env.world import InteractionTarget

FLOOR, WALL = (0, 0, 3, 0), (1, 1, 3, 0)
HERE, THERE = (0, 0), (0, 1)
BLANK = GameState("overworld", True, "MAY", "HERE", (0, 0), (2, 0), "up", False, (), 0, (), None)


def rom(rows, warps=(), objects=()):
    blocks = tuple(WALL if v else FLOOR for row in rows for v in row)
    return RomMap(len(rows[0]), len(rows), blocks, tuple(warps), (), tuple(objects))


# Two pads land west of the wall on THERE, one lands east of it.
HERE_MAP = rom([[0, 0, 0, 0]], [(0, 0, 0, 0, 1), (1, 0, 1, 0, 1), (3, 0, 2, 0, 1)])
THERE_MAP = rom(
    [[0, 0, 0, 1, 0], [0, 0, 0, 1, 0]],
    [(0, 0, 0, 0, 0), (1, 0, 1, 0, 0), (4, 0, 2, 0, 0)],
    [(1, 7, 2, 0, 0), (3, 9, 4, 1, 55)],
)


def sections(monkeypatch, areas):
    maps = {HERE: HERE_MAP, THERE: THERE_MAP}
    monkeypatch.setattr(owner, "read_rom_map", lambda _read, mid: maps.get(mid))
    result = owner.read_exit_sections(
        lambda _a, _n: b"", HERE, (2, 0), lambda _m: "PLACE", areas=areas
    )
    assert result is not None
    return result


def facts(visits, hidden=frozenset()):
    return AreaFacts(visits, lambda flag: flag in hidden, {7: "HIKER", 8: "MAN_5"}.get)


def test_off_leaves_section_exits_and_their_json_untouched(monkeypatch):
    result = sections(monkeypatch, None)
    assert all(w.landing is None for w in result.warps)
    assert set(result.warps[0].json()) == {"x", "y", "label", "detail"}


def test_json_is_the_same_on_and_off(monkeypatch):
    off = sections(monkeypatch, None)
    on = sections(monkeypatch, facts(AreaVisits()))
    assert on.json() == off.json()


def test_area_visited_from_any_tile_of_its_section(monkeypatch):
    visits = AreaVisits()
    visits.note(THERE, (2, 0))
    west, _, east = sections(monkeypatch, facts(visits)).warps
    assert west.landing is not None and east.landing is not None
    assert west.landing.visited is True
    assert east.landing.visited is False


def test_the_players_own_tile_counts_as_visited(monkeypatch):
    visits = AreaVisits()
    sections(monkeypatch, facts(visits))
    assert visits.tiles(HERE) == frozenset({(2, 0)})


def test_objects_are_listed_only_for_visited_areas_and_hide_flags_apply(monkeypatch):
    visits = AreaVisits()
    west, _, east = sections(monkeypatch, facts(visits)).warps
    assert west.landing is not None and west.landing.objects == ()
    visits.note(THERE, (0, 0))
    visits.note(THERE, (4, 0))
    west, _, east = sections(monkeypatch, facts(visits, frozenset({55}))).warps
    assert west.landing is not None and east.landing is not None
    assert west.landing.objects == ("HIKER at (2,0)",)
    assert east.landing.objects == ()
    east = sections(monkeypatch, facts(visits)).warps[2]
    assert east.landing is not None
    assert east.landing.objects == ("unknown sprite at (4,1)",)


def test_an_object_standing_on_a_warp_tile_belongs_to_the_area_that_tile_opens_on(monkeypatch):
    # LAVARIDGE TOWN GYM 1F trainers stand on the pads themselves, not on floor tiles.
    on_pad = replace(THERE_MAP, objects=((1, 7, 4, 0, 0),))
    maps = {HERE: HERE_MAP, THERE: on_pad}
    monkeypatch.setattr(owner, "read_rom_map", lambda _read, mid: maps.get(mid))
    visits = AreaVisits()
    visits.note(THERE, (4, 1))
    result = owner.read_exit_sections(
        lambda _a, _n: b"", HERE, (2, 0), lambda _m: "PLACE", areas=facts(visits)
    )
    assert result is not None
    east = result.warps[2].landing
    assert east is not None and east.objects == ("HIKER at (4,0)",)


def test_flag_zero_never_hides_and_unnamed_sprite_is_marked(monkeypatch):
    visits = AreaVisits()
    visits.note(THERE, (0, 0))
    area = AreaFacts(visits, lambda _flag: True, lambda _graphics: None)
    west = sections(monkeypatch, area).warps[0]
    assert west.landing is not None
    assert west.landing.objects == ("unknown sprite at (2,0)",)


def test_dynamic_and_unreadable_landings_stay_unestablished(monkeypatch):
    here = replace(HERE_MAP, warps=((0, 0, 0, 127, 127), (3, 0, 9, 1, 2)))
    monkeypatch.setattr(owner, "read_rom_map", lambda _r, m: here if m == HERE else None)
    result = owner.read_exit_sections(
        lambda _a, _n: b"", HERE, (2, 0), lambda _m: None, areas=facts(AreaVisits())
    )
    assert result is not None
    for warp in result.warps:
        assert warp.landing == LandingFacts(None, "Landing is not established.", "", None, ())


def pad(x, y, label, landing):
    return SectionExit(x, y, label, "unused", landing)


def test_lines_group_pads_by_area_in_first_seen_order():
    west = LandingFacts(
        (1, 2),
        "Terrain exits after arrival: none established.",
        "May block.",
        True,
        ("HIKER at (2,0)",),
    )
    east = LandingFacts((9, 9), "Terrain exits after arrival: exit (9,9).", "", False, ())
    other = LandingFacts((1, 3), west.exits, "", True, ("HIKER at (2,0)",))
    lines = warp_area_lines(
        [
            (pad(0, 0, "WEST", west), True),
            (pad(5, 5, "EAST", east), False),
            (pad(1, 0, "WEST", other), False),
        ]
    )
    assert lines == [
        "Warps by landing area (pad → landing tile; facts about each pad, not a route): May block.",
        "- WEST. Been there this run: yes. Objects there: HIKER at (2,0). "
        "Pads you can reach: (0,0) → (1,2). Pads you can't reach: (1,0) → (1,3). "
        "Terrain exits after arrival: none established.",
        "- EAST. Been there this run: no. Pads you can reach: none. "
        "Pads you can't reach: (5,5) → (9,9). Terrain exits after arrival: exit (9,9).",
    ]


def test_same_label_with_different_exits_stays_two_areas():
    unknown = "PLACE — terrain section unknown"
    lines = warp_area_lines(
        [
            (pad(0, 0, unknown, LandingFacts((1, 1), "A.", "", None, ())), True),
            (pad(1, 0, unknown, LandingFacts((2, 2), "B.", "", None, ())), True),
        ]
    )
    assert len(lines) == 3


def test_unknown_visit_and_no_landing_say_nothing_they_do_not_know():
    lines = warp_area_lines(
        [
            (
                pad(
                    0, 0, "dynamic", LandingFacts(None, "Landing is not established.", "", None, ())
                ),
                True,
            )
        ]
    )
    assert lines[1] == ("- dynamic. Pads you can reach: (0,0). Landing is not established.")


def test_no_pads_means_no_block():
    assert warp_area_lines([]) == []


def readout_state():
    landing = LandingFacts((1, 2), "Terrain exits after arrival: none established.", "", True, ())
    section = SectionExit(0, 1, "WEST", "Arrives at (1,2). The long detail.", landing)
    target = InteractionTarget("warp", 0, 1, 0, "movement", destination=(0, 9, 0))
    return replace(
        BLANK, interaction_targets=(target,), exit_sections=ExitSections("HERE", (section,), ())
    )


def destination_lines(off):
    text = format_readout(readout_state(), off, named_warps=True, world_destinations=True)
    return [
        line
        for line in text.split("\n")
        if line.startswith(("Warp destination", "Warps by", "- WEST"))
    ]


def test_readout_off_keeps_the_per_warp_detail_line_byte_for_byte():
    assert destination_lines(frozenset({SWITCH})) == [
        "Warp destination at (0,1): WEST. Arrives at (1,2). The long detail."
    ]


def test_readout_on_keeps_a_short_warp_line_and_adds_the_area_line():
    assert destination_lines(frozenset()) == [
        "Warp destination at (0,1): WEST.",
        "Warps by landing area (pad → landing tile; facts about each pad, not a route):",
        "- WEST. Been there this run: yes. Pads you can reach: (0,1) → (1,2). "
        "Terrain exits after arrival: none established.",
    ]


def test_switch_is_a_default_off_server_feature():
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
    assert SWITCH not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})


def test_read_state_passes_visits_only_when_the_switch_is_on(monkeypatch):
    import pokebench_env.rerender as rerender

    seen = []

    def fake(_read, _maps, **kwargs):
        seen.append(kwargs["area_visits"])
        return BLANK

    monkeypatch.setattr(rerender, "read_game_state", fake)
    visits = AreaVisits()
    off = features_off_from_env({})
    rerender.read_state(lambda _a, _n: b"", None, active_ui=False, off=off, area_visits=visits)
    on = off - {SWITCH}
    rerender.read_state(lambda _a, _n: b"", None, active_ui=False, off=on, area_visits=visits)
    rerender.read_state(lambda _a, _n: b"", None, active_ui=False, off=on)
    assert seen[0] is None
    assert seen[1] is visits
    assert isinstance(seen[2], AreaVisits)
