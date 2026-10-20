"""semantic-navigation-v2: listed targets carry the navigate_to_target argument the tool takes."""

import json
from dataclasses import replace

from pokebench_env.character_presence import StoryCharacters
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.semantic_targets import (
    SWITCH,
    connection_argument,
    interaction_argument,
    interaction_suffix,
    listed_objects,
)
from pokebench_env.topology import Connection, Topology
from pokebench_env.world import InteractionTarget

MAY = InteractionTarget("object", 10, 3, 3, "A", local_id=2, name="RIVAL_MAY_NORMAL")
DOOR = InteractionTarget("warp", 5, 8, 0, "movement", destination=(1, 2, 0))
SIGN = InteractionTarget("background", 7, 4, 3, "A", facing="up", name="Town sign")
NAMELESS = InteractionTarget("object", 1, 1, 3, "A")
SOUTH = Connection("SOUTH", 0, (0, 16), "ROUTE101", edges=((4, 19), (5, 19)))
UNWALKABLE = Connection("NORTH", 0, (0, 17), "ROUTE103", edges=())
DIVE = Connection("DIVE", 0, (0, 18), "SEAFLOOR")


def test_arguments_are_the_tool_schema_exactly():
    assert json.loads(interaction_argument(MAY) or "") == {"kind": "object", "local_id": 2}
    assert json.loads(interaction_argument(DOOR) or "") == {"kind": "warp", "x": 5, "y": 8}
    assert json.loads(interaction_argument(SIGN) or "") == {
        "kind": "interaction",
        "interaction_kind": "background",
        "x": 7,
        "y": 4,
    }
    assert interaction_argument(NAMELESS) is None
    assert interaction_suffix(NAMELESS) == ""
    assert interaction_suffix(MAY) == '; navigate_to_target target {"kind":"object","local_id":2}'
    assert connection_argument("SOUTH") == '{"kind":"connection","direction":"SOUTH"}'
    assert connection_argument("DIVE") is None
    assert listed_objects((MAY, DOOR, NAMELESS, SIGN)) == frozenset({2})
    assert listed_objects(None) == frozenset()


def test_connection_lines_carry_a_target_only_where_they_can_be_walked_off():
    assert SOUTH.line() == SOUTH.line(target=False)
    assert "navigate_to_target" not in SOUTH.line()
    assert SOUTH.line(target=True) == (
        SOUTH.line() + '; navigate_to_target target {"kind":"connection","direction":"SOUTH"}'
    )
    for unusable in (UNWALKABLE, DIVE, Connection("WEST", 0, (0, 1), "X")):
        assert unusable.line(target=True) == unusable.line()
    assert SOUTH.line("blocked note", target=True) == SOUTH.line("blocked note")
    topology = Topology(20, 20, (SOUTH, DIVE))
    assert topology.text() == topology.text(targets=False)
    assert topology.text(targets=True).splitlines()[2].endswith('"direction":"SOUTH"}')


def test_story_characters_get_a_target_only_when_the_readout_lists_them():
    here = StoryCharacters(
        here=("MAY at 10,3", "PROF. BIRCH (out of view)"),
        absent=("MOM",),
        out_of_view=(("PROF. BIRCH", 1),),
        ids=(("MAY", 2), ("PROF. BIRCH", 1)),
    )
    assert here.text(None, None) == here.text()
    on = here.text(None, frozenset({2}))
    assert 'MAY at 10,3 (navigate_to_target target {"kind":"object","local_id":2})' in on
    assert "PROF. BIRCH (out of view), " not in on and "PROF. BIRCH (out of view)." in on
    legacy = StoryCharacters(here=("MAY at 10,3",), absent=())
    assert legacy.text(None, frozenset({2})) == legacy.text()


def test_readout_off_is_unchanged_and_on_states_each_target():
    from test_game_state import MAPS, OVERWORLD, game

    from pokebench_env.game_state import read_game_state

    state = replace(
        read_game_state(game(OVERWORLD).read, MAPS),
        interaction_targets=(MAY, DOOR, SIGN),
        topology=Topology(20, 20, (SOUTH,)),
        story_characters=StoryCharacters(here=("MAY at 10,3",), absent=(), ids=(("MAY", 2),)),
    )
    off = frozenset({SWITCH})
    plain = format_readout(state, off, world_destinations=True, named_interactions=True)
    assert "navigate_to_target" not in plain
    on = format_readout(state, world_destinations=True, named_interactions=True)
    added = [line for line in on.splitlines() if line not in plain.splitlines()]
    assert len(added) == 5
    assert all("navigate_to_target target {" in line for line in added)
    assert any('"local_id":2}' in line and line.startswith("RIVAL_MAY_NORMAL") for line in added)
    assert any(line.startswith("Story characters here") for line in added)
    world_off = format_readout(state, frozenset({"world-targets-v1"}), world_destinations=True)
    assert 'navigate_to_target target {"kind":"object"' not in world_off


def test_switch_is_a_default_off_server_observation_switch():
    assert SERVER_FEATURES[-1] == SWITCH
    assert SWITCH in features_off_from_env({})
