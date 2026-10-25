import re
from dataclasses import replace

import pytest
from test_readout import IN_GAME

from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.mauville_puzzle import SWITCH, puzzle_view, switch_name
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json
from pokebench_env.world import InteractionTarget


def room():
    return LocalMap(
        (0, 0),
        ("..#..@NW",),
        tuple(
            MapTile(x, 0, m, c, 0, 3)
            for x, (m, c) in enumerate(
                [
                    (0x205, 0),
                    (0x206, 0),
                    (0x228, 3),
                    (0x238, 0),
                    (0, 0),
                    (0x205, 0),
                    (0x205, 0),
                    (0x205, 0),
                ]
            )
        ),
        (),
        (),
    )


def test_switches_and_door_footprints_are_distinct_without_changing_navigation():
    original = room()
    view, note = puzzle_view(original, (10, 0))
    assert view.rows == ("SsEe.@NW",)
    assert view.tiles == original.tiles
    assert original.rows == ("..#..@NW",)
    assert "S raised floor switch; s pressed floor switch" in note
    assert "E electric door blocked now; e electric door open now" in note
    assert "(0,0) raised" in note and "(1,0) pressed" in note
    assert "blocked (2,0)" in note and "open (3,0)" in note


@pytest.mark.parametrize("map_id", [None, (0, 2), (10, 1)])
def test_metatile_ids_are_never_interpreted_in_another_tileset(map_id):
    assert puzzle_view(room(), map_id) == (room(), "")
    assert switch_name(room(), map_id, 0, 0) is None


def test_vertical_openings_are_read_from_live_tiles_not_predicted():
    for m, collision, glyph in [(0x248, 3, "E"), (0x21A, 0, "e")]:
        shown = LocalMap(
            (6, 9), ("#" if collision else ".",), (MapTile(6, 9, m, collision, 0),), (), ()
        )
        view, note = puzzle_view(shown, (10, 0))
        assert view.rows == (glyph,)
        assert "(6,9)" in note
    # The same floor ID outside an observed door footprint remains ordinary floor.
    assert (
        puzzle_view(LocalMap((0, 0), (".",), (MapTile(0, 0, 0x21A, 0, 0),), (), ()), (10, 0))[1]
        == ""
    )


def test_switch_target_label_uses_only_the_current_map_tile():
    assert switch_name(room(), (10, 0), 0, 0) == "floor switch (raised)"
    assert switch_name(room(), (10, 0), 1, 0) == "floor switch (pressed)"
    assert switch_name(room(), (10, 0), 2, 0) is None
    assert switch_name(room(), (10, 0), 99, 99) is None


def test_production_readout_on_off_labels_targets_and_keeps_off_bytes():
    local = room()
    trigger = InteractionTarget("coordinate_trigger", 0, 0, 3, "step", "conditional")
    s = replace(
        IN_GAME,
        map_id=(10, 0),
        position=(5, 0),
        nearby=local,
        local_map="legacy",
        interaction_targets=(trigger,),
    )
    off = frozenset({SWITCH, "full-map-navigation-v1"})
    before = state_json(s)
    old = format_readout(s, off)
    new = format_readout(s, off - {SWITCH})
    assert re.search(r"0\s+S\s+s\s+E\s+e\s+\.\s+@\s+N\s+W", new)
    assert "floor switch (raised) at (0,0)" in new
    assert "coordinate_trigger at (0,0)" in old
    assert "Mauville puzzle" not in old and "Electric door tiles now" not in old
    assert state_json(s) == before
    assert format_readout(s, off) == old
    assert SWITCH in SERVER_FEATURES
    assert SWITCH not in features_off_from_env({})
    assert SWITCH in features_off_from_env({"POKEBENCH_FEATURES_OFF": SWITCH})
    # Same factory handles the full-map presentation.
    full = FullMap(8, 1, local.rows, local.tiles, (), ())
    assert "SsEe.@NW" in format_readout(replace(s, full_map=full), frozenset())
    # No stale field puzzle on battle/menu screens or when map observations are disabled.
    for blocked in [replace(s, screen="battle", in_battle=True), replace(s, screen="bag")]:
        assert "Mauville puzzle" not in format_readout(blocked)
    assert "Mauville puzzle" not in format_readout(s, frozenset({"live-map-v1"}))


def test_adjacent_readout_uses_the_puzzle_glyphs_and_current_collision():
    from pokebench_env.adjacent_tiles import next_tiles

    for x, word in [
        (1, "electric door (E), blocked now"),
        (2, "electric door (e), open now"),
        (1, "floor switch (raised, S)"),
        (0, "floor switch (pressed, s)"),
    ]:
        view, _ = puzzle_view(room(), (10, 0))
        text = next_tiles(
            view,
            (x, 0),
            coordinates=True,
            ledges=True,
            edge_walls=True,
            counters=True,
            warp_guidance=True,
            topology=None,
            on_foot=True,
        )
        assert word in text
    assert switch_name(None, (10, 0), 0, 0) is None


@pytest.mark.parametrize(
    "x,y,closed,opened",
    [
        (6, 9, 0x248, 0x21A),
        (6, 10, 0x250, 0x251),
        (3, 12, 0x249, 0x21A),
        (3, 13, 0x250, 0x251),
    ],
)
def test_all_vertical_door_footprints_have_both_live_states(x, y, closed, opened):
    for metatile, collision, glyph in [(closed, 3, "E"), (opened, 0, "e")]:
        m = LocalMap(
            (x, y), ("#" if collision else ".",), (MapTile(x, y, metatile, collision, 0),), (), ()
        )
        assert puzzle_view(m, (10, 0))[0].rows == (glyph,)


def test_non_door_graphics_and_fixed_poles_are_not_claimed_as_openings():
    for metatile in (0x220, 0x230, 0x240, 0x241, 0x242, 0x243):
        m = LocalMap((0, 0), ("#",), (MapTile(0, 0, metatile, 1, 0),), (), ())
        assert puzzle_view(m, (10, 0)) == (m, "")
