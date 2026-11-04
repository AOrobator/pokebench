"""rotating-gate-positions-v1, -rules-v1, -map-v1 and map-code-aliases-v1, all in memory."""

import struct

import pytest
from test_map_observation_wiring import map_memory, off_set
from test_map_rotating_elements import SAVE, GateMemory, edges, room

from pokebench_env.game_state import MapNames
from pokebench_env.live_map import FullMap, LocalMap, MapTile
from pokebench_env.map_observation import (
    build_observation,
    render_observation,
    reset_codebook,
)
from pokebench_env.map_observation_types import MapElement
from pokebench_env.map_rotating_elements import GATE_RULES, read_rotating_elements
from pokebench_env.rerender import read_state, render

POSITIONS = "rotating-gate-positions-v1"
RULES = "rotating-gate-rules-v1"
GATE_MAP = "rotating-gate-map-v1"
ALIASES = "map-code-aliases-v1"
GATE_2 = {
    ("east", (3, 18, 3, 19)),
    ("east", (4, 18, 4, 19)),
    ("south", (2, 19, 3, 19)),
    ("west", (2, 18, 2, 19)),
}
# Gate 2's sprite, copied from run 274b raw-ram/00057155: loaded and never rotated, on screen with
# the player at (4,19). 0x3F=0x50 (affineAnimEnded clear), data[1]=0, for as long as it stays there.
FRESH_SPRITE = bytes.fromhex(
    "280140cafc280000b01d590800000000781f5908987d000300000000e5ba0f08b0ff2000"
    "00000000e0e000000000020000000000000000000000000000000350fc000094"
)


def on_screen(memory, gate_id=2, slot=8):
    ids = bytearray([64] * 8)
    ids[gate_id] = slot
    memory.put(0x0203A038, bytes(ids))
    sprite = bytearray(FRESH_SPRITE)
    struct.pack_into("<h", sprite, 0x2E, gate_id)
    memory.put(0x02020630 + slot * 0x44, bytes(sprite))


def test_the_274b_fixture_is_the_fresh_state_that_reads_transitioning_with_the_switch_off():
    assert FRESH_SPRITE[0x3F] == 0x50 and FRESH_SPRITE[0x30:0x32] == b"\0\0"
    memory = GateMemory()
    on_screen(memory)
    elements, _ = read_rotating_elements(memory.read, (12, 1), room())
    assert [e.state for e in elements if e.group == "gate:2"] == ["transitioning"]


def test_a_fresh_never_rotated_sprite_reports_its_orientation_and_every_arm_before_any_push():
    memory = GateMemory()
    on_screen(memory)
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room(), every_gate=True)
    assert unavailable == ()
    assert edges(elements, "gate:2") == GATE_2
    assert all(e.orientation == 1 for e in elements if e.group == "gate:2")
    assert not any(e.state == "transitioning" for e in elements)


def test_an_off_screen_gate_reports_the_same_orientation_and_arms():
    memory = GateMemory()
    assert memory.read(0x0203A038 + 2, 1) == bytes([64])
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room(), every_gate=True)
    assert unavailable == ()
    assert edges(elements, "gate:2") == GATE_2


def test_a_push_reads_at_once_from_the_byte_while_the_sprite_still_animates():
    memory = GateMemory()
    on_screen(memory)
    orientations = bytearray(memory.read(SAVE + 0x139C, 8))
    orientations[2] = 2
    memory.put(SAVE + 0x139C, bytes(orientations))
    sprite = bytearray(FRESH_SPRITE)
    struct.pack_into("<hh", sprite, 0x30, 2, 2)
    memory.put(0x02020630 + 8 * 0x44, bytes(sprite))
    elements, _ = read_rotating_elements(memory.read, (12, 1), room(), every_gate=True)
    assert all(e.orientation == 2 for e in elements if e.group == "gate:2")
    assert ("south", (2, 20, 3, 20)) in edges(elements, "gate:2")


def test_the_sprite_table_is_not_read_at_all():
    memory = GateMemory()
    read_rotating_elements(memory.read, (12, 1), room(), every_gate=True)
    assert not any(address in (0x0203A038, 0x02020630) for address, _ in memory.calls)


def test_every_gate_is_listed_from_a_view_that_shows_none_of_them():
    memory = GateMemory()
    shown = LocalMap((19, 0), (".",), (MapTile(19, 0, 0, 0, 0),), (), ())
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), shown, every_gate=True)
    assert unavailable == ()
    assert len([e for e in elements if e.state == "pivot"]) == 8
    assert ("south", (2, 19, 3, 19)) in edges(elements, "gate:2")
    kept = build_observation(shown, (12, 1), (), anywhere=elements)
    assert kept.elements == elements


def test_source_identity_and_live_owner_checks_still_hold():
    memory = GateMemory()
    memory.put(0x0858E8B0, b"\xff")
    assert read_rotating_elements(memory.read, (12, 1), room(), every_gate=True) == (
        (),
        ("rotating gate source identity unavailable",),
    )
    memory = GateMemory()
    memory.put(SAVE + 4, b"\x1d\x08")
    assert read_rotating_elements(memory.read, (12, 1), room(), every_gate=True) == (
        (),
        ("rotating gate live owner unavailable",),
    )
    memory = GateMemory()
    memory.put(SAVE + 0x139C + 2, b"\x04")
    elements, unavailable = read_rotating_elements(memory.read, (12, 1), room(), every_gate=True)
    assert not any(e.group == "gate:2" for e in elements)
    assert unavailable == ("gate:2 rotating gate state unavailable",)


def gym_memory():
    memory = map_memory()
    memory.cells.update(GateMemory().bytes)
    memory.put(0x02037350 + 9, bytes([1, 12]))
    memory.put(0x02037350 + 0x10, struct.pack("<hh", 12, 14))
    memory.put(0x02001000, struct.pack("<IIIIII", 20, 25, 0, 0, 0x02003000, 0x02004000))
    memory.put(0x03005DC0, struct.pack("<III", 35, 39, 0x02005000))
    memory.put(0x02005000, bytes(35 * 39 * 2))
    memory.put(0x02002000, bytes(20))
    on_screen(memory, 0, 8)
    return memory


MAPS = MapNames({(12, 1): "FORTREE CITY GYM"})
SWITCHES = frozenset({POSITIONS, RULES, GATE_MAP, ALIASES})


def rendered(memory, on=frozenset()):
    off = off_set() - on
    return render(read_state(memory.read, MAPS, active_ui=False, off=off), off)


def test_production_path_honors_the_position_switch_for_an_unpushed_gate_beside_the_player():
    memory = gym_memory()
    off = rendered(memory)
    assert "transitioning" in off and "rotating gate arm across this edge" not in off
    text = rendered(memory, frozenset({POSITIONS}))
    assert "transitioning" not in text
    assert "edge (5,6)-(5,7)" in text
    north = next(s for s in text.splitlines() if s.startswith("Next tiles:")).split("; down", 1)[0]
    assert "up (5,6)" in north and "rotating gate arm across this edge" in north


def test_rules_appear_only_on_a_gate_map_and_only_with_their_switch():
    memory = gym_memory()
    assert GATE_RULES not in rendered(memory)
    assert rendered(memory, frozenset({RULES})).count(GATE_RULES) == 1
    other = map_memory()
    assert GATE_RULES not in render(
        read_state(other.read, MAPS, active_ui=False, off=off_set() - {RULES}), off_set() - {RULES}
    )


def test_rules_give_the_game_mechanics_and_never_a_push():
    for phrase in (
        "movable",
        "lie on the lines between tiles",
        "corner where four tiles meet, not a tile you can stand on",
        "90 degrees around its pivot",
        "in the direction you walk",
        "will not turn if an arm would sweep into a wall",
        "you do not move",
    ):
        assert phrase in GATE_RULES
    assert not any(word in GATE_RULES for word in ("north", "south", "east", "west", "("))


def gate_view():
    width, height = 4, 3
    rows = ("....", ".#..", "....")
    tiles = tuple(
        MapTile(x, y, 0, 0, 1 if rows[y][x] == "#" else 0, 3)
        for y in range(height)
        for x in range(width)
    )
    return FullMap(width, height, rows, tiles, (), ())


GATE = (
    MapElement("rotating_gate", 2, 1, state="pivot", group="gate:2", orientation=1),
    MapElement(
        "rotating_gate",
        2,
        0,
        state="arm",
        direction="east",
        group="gate:2",
        orientation=1,
        edge=(2, 0, 2, 1),
    ),
    MapElement(
        "rotating_gate",
        3,
        0,
        state="arm",
        direction="east",
        group="gate:2",
        orientation=1,
        edge=(3, 0, 3, 1),
    ),
    MapElement(
        "rotating_gate",
        1,
        1,
        state="arm",
        direction="south",
        group="gate:2",
        orientation=1,
        edge=(1, 1, 2, 1),
    ),
)


def test_gate_map_draws_arms_on_edges_and_names_them_by_the_tiles_they_separate():
    shown = gate_view()
    observation = build_observation(shown, (12, 1), GATE)
    text = render_observation(shown, observation, gate_lines=True)
    assert (
        render_observation(shown, observation).split("Base glyph")[0] == text.split("Base glyph")[0]
    )
    assert (
        "Gate 2: pivot at the corner of (1,0), (2,0), (1,1) and (2,1); "
        "east arm between (2,0) and (2,1), between (3,0) and (3,1); "
        "south arm between (1,1) and (2,1)"
    ) in text
    assert "| and -- between cells are gate arms" in text
    assert "not walls" in text
    assert "Element legend" not in text and "R:a" not in text and "orientation" not in text


def test_gate_map_key_lists_only_glyphs_the_grid_draws():
    shown = FullMap(2, 1, ("..",), (MapTile(0, 0, 0, 0, 0), MapTile(1, 0, 0, 0, 0)), (), ())
    observation = build_observation(shown, (1, 1), ())
    assert render_observation(shown, observation).count("@ player, N object, W warp") == 1
    text = render_observation(shown, observation, gate_lines=True)
    assert "Base glyph / element token preserves both layers." in text
    for absent in ("@ player", "N object", "W warp", "Gate", "*", "edge wall"):
        assert absent not in text
    shown = FullMap(2, 1, ("@+",), (MapTile(0, 0, 0, 0, 0), MapTile(1, 0, 0, 0, 0)), (), ())
    text = render_observation(shown, build_observation(shown, (1, 1), ()), gate_lines=True)
    assert "; @ player." in text and "A + inside a cell remains a base edge wall." in text


def test_gate_map_keeps_listing_a_gate_outside_this_view_without_keying_undrawn_glyphs():
    shown = LocalMap((16, 3), (".",), (MapTile(16, 3, 0, 0, 0, 3),), (), ())
    observation = build_observation(shown, (12, 1), (), anywhere=GATE)
    text = render_observation(shown, observation, gate_lines=True)
    assert "Gate 2: pivot" in text
    assert "between cells are gate arms" not in text and "pivot, a corner" not in text


def test_gate_map_key_names_only_the_gate_glyphs_this_view_draws():
    pivot, north_south = GATE[0], GATE[3]
    shown = gate_view()
    both = render_observation(shown, build_observation(shown, (12, 1), GATE), gate_lines=True)
    assert "| and -- between cells are gate arms" in both and "* is a gate's pivot" in both
    arm = render_observation(
        shown, build_observation(shown, (12, 1), (north_south,)), gate_lines=True
    )
    assert "| between cells are gate arms" in arm and "--" not in arm.split("Base glyph")[1]
    assert "* is" not in arm
    alone = render_observation(shown, build_observation(shown, (12, 1), (pivot,)), gate_lines=True)
    assert "between cells are gate arms" not in alone and "* is a gate's pivot" in alone


class Aliased:
    @staticmethod
    def shown(glyphs):
        return FullMap(2, 1, (glyphs,), (MapTile(0, 0, 0, 0, 0), MapTile(1, 0, 0, 0, 0)), (), ())


@pytest.mark.parametrize("stable", [False, True])
def test_one_element_token_has_one_code_whatever_glyph_it_sits_under(stable):
    reset_codebook()
    shown = Aliased.shown("@W")
    warp = (
        MapElement("warp", 0, 0, state="arrow", direction="south"),
        MapElement("warp", 1, 0, state="arrow", direction="south"),
    )
    observation = build_observation(shown, (1, 1), warp)
    args = {"compact": True, "base_glyph": True, "stable_codes": stable}
    before = render_observation(shown, observation, **args)
    assert before.count("= Wp:arrow:v") == 2
    reset_codebook()
    after = render_observation(shown, observation, one_code=True, **args)
    codes = next(line for line in after.splitlines() if line.startswith("Codes:"))
    assert codes.count("= Wp:arrow:v") == 1
    letter = codes.removeprefix("Codes: ").split(" = ")[0]
    assert f"@{letter}" in after and f"W{letter}" in after


def test_one_character_element_tokens_keep_their_own_code():
    reset_codebook()
    shown = Aliased.shown("..")
    observation = build_observation(shown, (1, 1), (MapElement("hole", 0, 0),))
    text = render_observation(
        shown, observation, compact=True, base_glyph=True, stable_codes=True, one_code=True
    )
    assert "= H" in next(line for line in text.splitlines() if line.startswith("Codes:"))


def test_production_path_honors_the_map_and_alias_switches():
    memory = gym_memory()
    text = rendered(memory, frozenset({POSITIONS, GATE_MAP}))
    assert "Gate 0: pivot at the corner of (5,6), (6,6), (5,7) and (6,7);" in text
    assert "Now rotating gate" not in text
    assert rendered(memory, SWITCHES).count("Gate 0: pivot") == 1
