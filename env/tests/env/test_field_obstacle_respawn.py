"""field-obstacle-respawn-v1: a rock or tree the party can clear that cuts an exit off is named.

Run 6056 (turn 1090): back on ROUTE 111 after a whiteout, the two BREAKABLE_ROCKs at (18,101)
and (19,100) were back (FLAG_TEMP_11 and FLAG_TEMP_12, cleared by ClearTempFieldEventData on
every map load). The party could smash them, so field-move-gates-v1 left them open and the
readout's field obstacles named only the sandstorm, a tree and slopes. The model blamed the sand.
"""

import struct
from dataclasses import replace

from pokebench_env.exit_reach import build_exit_reach
from pokebench_env.field_moves import (
    HEADER,
    RESPAWN_SWITCH,
    Capabilities,
    FieldObstacles,
    Flood,
    MapGates,
    Obstacle,
    clear_instruction,
    survey,
)
from pokebench_env.game_state import MapNames
from pokebench_env.live_map import OBJECT_EVENTS
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rerender import read_state
from pokebench_env.surf_gate import ConnectionKey, FloodInputs
from tests.env import route111_6056 as r111
from tests.env.test_feature_switches import map_memory, map_state
from tests.env.test_game_state import SB1

ROCK_ASK = "This rock appears to be breakable. Would you like to use ROCK SMASH?"
TREE_ASK = "This tree looks like it can be CUT down! Would you like to CUT it?"
ROUTE_112 = ("WEST", (0, 27), 20)


def tiles() -> dict[tuple[int, int], tuple[int, int]]:
    found = {}
    for y, row in enumerate(r111.ROWS):
        for x in range(r111.WIDTH):
            cell = int(row[x * 4 : x * 4 + 4], 16)
            if cell != 0xFFFF:
                found[(x, y)] = (cell >> 12, cell & 0xFF)
    return found


def obstacles() -> tuple[Obstacle, ...]:
    return tuple(Obstacle(*o) for o in r111.OBSTACLES)


def flood_inputs() -> FloodInputs:
    return FloodInputs(tiles(), r111.START, r111.WARPS, r111.CONNECTIONS, r111.WIDTH, r111.HEIGHT)


def field(caps: Capabilities | None = None, *, flood: bool = True) -> FieldObstacles[ConnectionKey]:
    f = flood_inputs()
    gates = MapGates(caps or Capabilities(r111.CAPABILITIES), obstacles())
    found = survey(f.tiles, f.start, gates, warps=f.warps, connections=f.connections)
    return FieldObstacles(
        gates,
        found,
        f.width,
        f.height,
        Flood(f.tiles, f.start, f.warps, f.connections) if flood else None,
    )


def name(key: ConnectionKey) -> str:
    return f"{key[0]} edge -> map {key[1][0]}/{key[1][1]}"


def warp(tile: tuple[int, int]) -> str:
    return f"({tile[0]},{tile[1]})"


def test_switch_is_a_default_off_server_feature() -> None:
    assert RESPAWN_SWITCH == "field-obstacle-respawn-v1" and RESPAWN_SWITCH in SERVER_FEATURES
    assert RESPAWN_SWITCH in features_off_from_env({})


def test_instruction_is_the_games_question_answered() -> None:
    assert clear_instruction("rock_smash", 16, semantic=True) == (
        'ROCK SMASH it: navigate_to_target target {"kind":"object","local_id":16}, answer YES'
    )
    assert clear_instruction("cut", 27, semantic=False) == "CUT it: face it and press A, answer YES"


def test_turn_1090_names_the_rocks_on_the_way_to_route_112() -> None:
    lines = field().clearable_lines(warp, name, semantic=True)
    assert lines == [
        "- every way on foot to WEST edge -> map 0/27 passes BREAKABLE_ROCK object 15 at (18,101)"
        f' or BREAKABLE_ROCK object 16 at (19,100): the game asks "{ROCK_ASK}"; for object 15,'
        ' ROCK SMASH it: navigate_to_target target {"kind":"object","local_id":15}, answer YES;'
        ' for object 16, ROCK SMASH it: navigate_to_target target {"kind":"object","local_id":16},'
        " answer YES"
    ]


def test_the_existing_lines_and_exit_labels_do_not_change() -> None:
    on, off = field(), field(flood=False)
    assert on.lines(warp, name) == off.lines(warp, name)
    assert on.json() == off.json()
    assert dict(on.survey.gated.connections)[ROUTE_112] == "foot"
    assert off.clearable_lines(warp, name, semantic=True) == []


def test_a_rock_the_party_cannot_smash_keeps_its_closed_gate_text() -> None:
    caps = Capabilities(tuple((g, False if g == "rock_smash" else v) for g, v in r111.CAPABILITIES))
    closed = field(caps)
    assert closed.clearable_lines(warp, name, semantic=True) == []
    assert any(
        "BREAKABLE_ROCK at (19,100) and (18,101) close every way" in line
        for line in closed.lines(warp, name)
    )


def test_one_tree_alone_says_it_alone_and_an_exit_off_foot_is_never_named() -> None:
    # A corridor: the player at (0,0), a usable tree at (2,0), a warp at (4,0); a second warp at
    # (0,2) is reached on foot anyway, and the far one (4,2) lies past a wall no tree opens.
    t = {(x, 0): (0, 0) for x in range(5)} | {(0, 1): (0, 0), (0, 2): (0, 0), (4, 2): (0, 0)}
    tree = Obstacle("cut", "CUTTABLE_TREE", ((2, 0),), 7, True)
    unusable = Obstacle("rock_smash", "BREAKABLE_ROCK", ((3, 0),), 8, True)
    caps = Capabilities((("cut", True), ("rock_smash", None)))
    gates = MapGates(caps, (tree, unusable))
    warps = ((4, 0), (0, 2), (4, 2))
    none: dict[ConnectionKey, tuple[tuple[tuple[int, int], ...], tuple[tuple[int, int], ...]]] = {}
    found = survey(t, (0, 0), gates, warps=warps, connections=none)
    f = FieldObstacles(gates, found, 5, 3, Flood(t, (0, 0), warps, none))
    assert f.clearable_lines(warp, name, semantic=False) == [
        "- every way on foot to (4,0) passes CUTTABLE_TREE object 7 at (2,0): the game asks"
        f' "{TREE_ASK}"; CUT it: face it and press A, answer YES'
    ]


def test_readout_on_adds_the_line_and_off_is_byte_identical() -> None:
    base = map_state()
    flood = flood_inputs()
    on_field = field()
    state = replace(
        base,
        exit_reach=build_exit_reach(flood, on_field.survey),
        field_obstacles=on_field,
    )
    before = replace(state, field_obstacles=field(flood=False))
    off = frozenset({RESPAWN_SWITCH})
    assert format_readout(state, off) == format_readout(before, off)
    assert format_readout(before, frozenset()) == format_readout(before, off)
    on = format_readout(state, frozenset()).split("\n")
    added = [line for line in on if line not in format_readout(state, off).split("\n")]
    assert len(added) == 1 and added[0].startswith("- every way on foot to WEST edge -> "), added
    assert "BREAKABLE_ROCK object 15 at (18,101) or BREAKABLE_ROCK object 16" in added[0]
    assert on.index(added[0]) > on.index(HEADER)


def test_a_lone_clearable_line_brings_its_own_header() -> None:
    t = {(x, 0): (0, 0) for x in range(3)}
    rock = Obstacle("rock_smash", "BREAKABLE_ROCK", ((1, 0),), 3, True)
    gates = MapGates(Capabilities((("rock_smash", True),)), (rock,))
    flood = FloodInputs(t, (0, 0), ((2, 0),), {}, 3, 1)
    found = survey(t, (0, 0), gates, warps=flood.warps, connections=flood.connections)
    f = FieldObstacles(gates, found, 3, 1, Flood(t, (0, 0), flood.warps, flood.connections))
    state = replace(map_state(), exit_reach=build_exit_reach(flood, found), field_obstacles=f)
    on = format_readout(state, frozenset()).split("\n")
    assert HEADER not in format_readout(state, frozenset({RESPAWN_SWITCH})).split("\n")
    line = next(x for x in on if x.startswith("- every way on foot to "))
    assert on[on.index(line) - 1] == HEADER


def test_the_game_state_reader_keeps_the_flood_it_surveyed() -> None:
    # test_map_observation_wiring's sandstorm map: ROUTE 111, the player at (11,60).
    memory = map_memory()
    memory.put(SB1, struct.pack("<hh", 11, 60) + bytes([0, 26]))
    memory.put(OBJECT_EVENTS + 9, bytes([26, 0]))
    memory.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", 18, 67))
    memory.put(0x02001000, struct.pack("<IIIIII", 24, 112, 0, 0, 0x02003000, 0x02004000))
    memory.put(0x03005DC0, struct.pack("<III", 39, 126, 0x02005000))
    memory.put(0x02005000, bytes(39 * 126 * 2))
    off = features_off_from_env({}) - {"field-move-gates-v1", "exit-reachability-v1"}
    state = read_state(memory.read, MapNames({(0, 26): "ROUTE111"}), active_ui=False, off=off)
    found = state.field_obstacles
    assert found is not None and found.flood is not None
    assert found.flood.start == (11, 60) and found.flood.start in found.flood.tiles


def test_a_way_past_a_boulder_the_party_cannot_move_is_not_said_to_pass_the_tree() -> None:
    # Two parallel ways from (0,1) to the warp (4,1): the top one past a CUTTABLE_TREE the party
    # can cut at (2,0), the bottom one past a PUSHABLE_BOULDER it cannot move at (2,2); (2,1) is a
    # wall. Closing the tree cuts the warp off, but its blocker set is the tree and the boulder,
    # so the tree alone is not every way there.
    t = {(x, y): (0, 0) for x in range(5) for y in range(3)} | {(2, 1): (1, 0)}
    tree = Obstacle("cut", "CUTTABLE_TREE", ((2, 0),), 7, True)
    boulder = Obstacle("strength", "PUSHABLE_BOULDER", ((2, 2),), 8, True)
    gates = MapGates(Capabilities((("cut", True), ("strength", False))), (tree, boulder))
    none: dict[ConnectionKey, tuple[tuple[tuple[int, int], ...], tuple[tuple[int, int], ...]]] = {}
    found = survey(t, (0, 1), gates, warps=((4, 1),), connections=none)
    assert dict(found.gated.warps)[(4, 1)] == "foot"
    f = FieldObstacles(gates, found, 5, 3, Flood(t, (0, 1), ((4, 1),), none))
    assert f.clearable_lines(warp, name, semantic=True) == []
