"""surf-gated-exits-v1: an exit reachable only across water is not an exit until Surf can be used.

Grounded in pret/pokeemerald 731ad5bf: GetInteractedWaterScript (field_control_avatar.c:448-452)
starts Surf only when FlagGet(FLAG_BADGE05_GET) (the Balance Badge) and PartyHasMonWithSurf()
(field_player_avatar.c:1297: a party Pokémon that knows MOVE_SURF, checked only while the
avatar is not already surfing, PLAYER_AVATAR_FLAG_SURFING = 1 << 3). On foot a surfable-water
tile is refused (TILE_FLAG_SURFABLE water sits at elevation 1, which mismatches land).

The real-RAM fixture is run 2026-10-16T12-42-29_qwen36-gpu0_4caa on ROUTE103: tool results
4770 (T198, at (10,21)) and 16069 (T597, at (21,10)). Their readouts listed
"(45,6) -> ALTERING CAVE (map 24/106); EAST edge -> ROUTE110 (map 0/25)" as untaken exits,
145 times in that run; both are across the route's water from every tile the player could walk to.
"""

import functools
import gzip
import json
import os
from pathlib import Path
from typing import Any

import pytest

from pokebench_env import rerender
from pokebench_env.game_state import MapNames
from pokebench_env.pokemon import PartyMon, PokemonMove
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom
from pokebench_env.surf_gate import (
    SWITCH,
    SurfGate,
    reachable,
    surf_use,
    water_only,
)

ID = "surf-gated-exits-v1"
FIXTURE: dict[str, Any] = json.loads(
    gzip.decompress((Path(__file__).parent / "fixtures" / "surf-gate-4caa.json.gz").read_bytes())
)
CASES = FIXTURE["cases"]
CURRENT = json.loads(
    (Path(__file__).parent / "fixtures/readout-truth-current-warp-names.json").read_text()
)["cases"]
RECORDED_OFF = [f for f in SERVER_FEATURES if f not in FIXTURE["harness_features"] and f != ID]
NEITHER = "Surf needs the Balance Badge and a party Pokémon that knows SURF (you have neither)"
OFF_EAST = (
    "- EAST -> ROUTE110 (map 0/25), offset -60; walk off the map from any tile from (79,7)"
    " to (79,11): stand on one of these edge tiles and press RIGHT"
)
ON_EAST = (
    "- EAST -> ROUTE110 (map 0/25), offset -60; not an exit you can use now: every way from"
    f" where you stand to this edge crosses water, and {NEITHER}"
)
OFF_WARP = (
    "Warp to map 24/106 at (45,6), elevation 0; movement; activation depends on metatile"
    " (see local map); conditional; destination map 24/106 warp 0"
)
ON_WARP = (
    f"{OFF_WARP}; not an exit you can use now: every way from where you stand to it crosses"
    f" water, and {NEITHER}"
)
OFF_DEST = "Warp destination at (45,6): map 24/106"
ON_DEST = (
    "Warp destination at (45,6): map 24/106 (not an exit you can use now: across water, needs Surf)"
)
ROM_START = 0x08000000
PLAYER_AVATAR = 0x02037590


# Immutable owners, built once per module: the ROM bytes, the map names and each case's RAM.
@functools.cache
def _rom() -> bytes | None:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        return None


def operator_rom() -> bytes:
    rom = _rom()
    if rom is None:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")
    return rom


@functools.cache
def maps() -> MapNames:
    return MapNames.load(rerender.PORYMAP_MAPS)


@functools.cache
def cells_of(seq: int, surfing: bool) -> dict[int, int]:
    case = next(c for c in CASES if c["tool_result_seq"] == seq)
    cells: dict[int, int] = {}
    for window in case["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value
    if surfing:
        cells[PLAYER_AVATAR] |= 1 << 3
    return cells


def reader(case: dict[str, Any], *, surfing: bool = False):
    rom, cells = operator_rom(), cells_of(case["tool_result_seq"], surfing)

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def readout(case: dict[str, Any], off: list[str], *, surfing: bool = False) -> str:
    read = reader(case, surfing=surfing)
    env = {"POKEBENCH_FEATURES_OFF": ",".join(off), "POKEBENCH_ACTIVE_UI": "1"}
    return rerender.rerender(
        Path("/run"), [rerender.RawRef("a", "s")], lambda _p, _s: read, maps(), env
    )[0]


def state(case: dict[str, Any], off: list[str], *, surfing: bool = False):
    return rerender.read_state(
        reader(case, surfing=surfing), maps(), active_ui=True, off=frozenset(off)
    )


def test_fixture_owners_are_built_once() -> None:
    operator_rom()
    for case in CASES:
        readout(case, RECORDED_OFF)
        state(case, RECORDED_OFF)
    assert _rom.cache_info().currsize == 1
    assert maps.cache_info().currsize == 1
    assert cells_of.cache_info().misses <= 2 * len(CASES)


def changed(before: str, after: str) -> list[tuple[str, str]]:
    a, b = before.split("\n"), after.split("\n")
    assert len(a) == len(b)
    return [(x, y) for x, y in zip(a, b, strict=True) if x != y]


def test_registered_server_switch_default_off() -> None:
    assert SWITCH == ID
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_off_matches_current_policy_without_rewriting_the_recorded_4caa_readout(
    case: dict[str, Any],
) -> None:
    assert case["untaken_line"] == (
        "Exits here you have not taken: (45,6) -> ALTERING CAVE (map 24/106);"
        " EAST edge -> ROUTE110 (map 0/25)"
    )
    off = readout(case, [*RECORDED_OFF, ID])
    assert off == CURRENT[f"surf-gate:{case['tool_result_seq']}"]
    assert {OFF_EAST, OFF_WARP, OFF_DEST} <= set(off.split("\n"))


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_on_notes_both_water_only_exits_and_changes_nothing_else(case: dict[str, Any]) -> None:
    on = readout(case, RECORDED_OFF)
    baseline = CURRENT[f"surf-gate:{case['tool_result_seq']}"]
    assert changed(baseline, on) == [
        (OFF_WARP, ON_WARP),
        (OFF_EAST, ON_EAST),
        (OFF_DEST, ON_DEST),
    ]
    # The walkable south edge to OLDALE TOWN keeps its walk instruction.
    assert (
        "- SOUTH -> OLDALE TOWN (map 0/10), offset 0; walk off the map from any tile from (8,21)"
        " to (11,21): stand on one of these edge tiles and press DOWN" in on.split("\n")
    )


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_on_state_json_carries_the_gate_off_has_no_field(case: dict[str, Any]) -> None:
    on = state_json(state(case, RECORDED_OFF))
    assert on["surf_gate"] == {
        "can_surf": False,
        "balance_badge": False,
        "party_surf": False,
        "surfing": False,
        "warps": [{"x": 45, "y": 6}],
        "connections": ["EAST"],
    }
    assert "surf_gate" not in state_json(state(case, [*RECORDED_OFF, ID]))


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_once_surf_can_be_used_the_exits_read_as_before(case: dict[str, Any]) -> None:
    # Already surfing (gPlayerAvatar.flags bit 3): the water is open, so nothing is noted.
    gate = state(case, RECORDED_OFF, surfing=True).surf_gate
    assert gate is not None and gate.can_surf is True and gate.surfing is True
    assert gate.warps == ((45, 6),) and gate.connections == ("EAST",)
    assert readout(case, RECORDED_OFF, surfing=True) == readout(
        case, [*RECORDED_OFF, ID], surfing=True
    )


def mon(*moves: int, decoded: bool = True) -> PartyMon:
    return PartyMon(
        "MARILL",
        20,
        50,
        50,
        moves=tuple(PokemonMove(m, 10, 0) for m in moves) if decoded else None,
    )


@pytest.mark.parametrize(
    ("badges", "party", "flags", "expected"),
    [
        (("STONE", "BALANCE"), (mon(33), mon(57)), 1, (True, True, True, False)),
        (("BALANCE",), (mon(33),), 1, (False, True, False, False)),
        (("STONE",), (mon(57),), 1, (False, False, True, False)),
        ((), (mon(10, 45),), 1, (False, False, False, False)),
        ((), (mon(10),), 1 | 8, (True, False, False, True)),
        (("BALANCE",), (mon(57), mon(decoded=False)), 1, (True, True, True, False)),
        (("BALANCE",), (mon(33), mon(decoded=False)), 1, (None, True, None, False)),
        ((), (mon(33), mon(decoded=False)), 1, (False, False, None, False)),
        (None, (mon(57),), 1, (None, None, True, False)),
        (("BALANCE",), None, 1, (None, True, None, False)),
        (("BALANCE",), (mon(57),), None, (True, True, True, None)),
        ((), (mon(10),), None, (None, False, False, None)),
    ],
)
def test_surf_use_follows_the_badge_and_party_move_check(
    badges: tuple[str, ...] | None,
    party: tuple[PartyMon, ...] | None,
    flags: int | None,
    expected: tuple[bool | None, bool | None, bool | None, bool | None],
) -> None:
    use = surf_use(badges, party, flags)
    assert (use.can_surf, use.balance_badge, use.party_surf, use.surfing) == expected


def grid(rows: list[str]) -> dict[tuple[int, int], tuple[int, int]]:
    cells = {".": (0, 0), "~": (0, 0x10), "#": (1, 0), "J": (1, 0x38), "W": (0, 0)}
    return {(x, y): cells[c] for y, row in enumerate(rows) for x, c in enumerate(row)}


# Land on the left, a pond (~, behavior 0x10) in the middle, land on the right; # is solid and
# J at (1,3) a ledge hopping east (MB_JUMP_EAST, 0x38).
POND = ["..~~~..", "..~~~..", "..#~#..", ".J.~...", "##~~~##"]


def test_reachable_on_foot_stops_at_water_with_water_crosses_it() -> None:
    tiles = grid(POND)
    foot = reachable(tiles, (0, 0), water=False)
    assert (1, 1) in foot and (2, 0) not in foot and (6, 0) not in foot
    both = reachable(tiles, (0, 0), water=True)
    assert (6, 0) in both and (2, 0) in both and (2, 2) not in both


def test_reachable_hops_a_ledge_only_in_its_arrow_direction() -> None:
    row = grid([".J."])  # hop from (0,0) over the ledge at (1,0) to (2,0), never back
    assert reachable(row, (0, 0), water=False) == frozenset({(0, 0), (2, 0)})
    assert reachable(row, (2, 0), water=False) == frozenset({(2, 0)})
    assert (2, 3) in reachable(grid(POND), (0, 0), water=False)


def test_reachable_from_off_map_start_is_only_the_start() -> None:
    assert reachable(grid(POND), (9, 9), water=False) == frozenset({(9, 9)})


def test_water_only_warps_and_connections() -> None:
    tiles = grid(POND)
    warps, connections = water_only(
        tiles,
        (0, 0),
        warps=[(6, 0), (1, 1), (9, 9)],
        connections={
            # (foot edge tiles, edge tiles crossable with water allowed)
            "EAST": (((6, 1),), ((6, 1),)),
            "WEST": (((0, 1),), ((0, 1),)),
            "SOUTH": ((), ((3, 4),)),
            "NORTH": ((), ()),
        },
    )
    # (6,0) is across the pond; (1,1) is on our side; (9,9) cannot be reached even by water.
    assert warps == ((6, 0),)
    # EAST: its foot edge is across the pond. SOUTH: its only edge tile is water. WEST: walkable.
    # NORTH: no tile crossable at all, so not a Surf gate either.
    assert connections == ("EAST", "SOUTH")


def gate(**kw: Any) -> SurfGate:
    base: dict[str, Any] = {
        "can_surf": False,
        "balance_badge": False,
        "party_surf": False,
        "surfing": False,
        "warps": ((45, 6),),
        "connections": ("EAST",),
    }
    return SurfGate(**{**base, **kw})


def test_gate_blocks_only_when_surf_cannot_be_used() -> None:
    assert gate().blocks_warp(45, 6) and gate().blocks_connection("EAST")
    assert not gate().blocks_warp(45, 7) and not gate().blocks_connection("SOUTH")
    for can in (True, None):
        assert not gate(can_surf=can).blocks_warp(45, 6)
        assert not gate(can_surf=can).blocks_connection("EAST")


@pytest.mark.parametrize(
    ("badge", "party", "says"),
    [
        (False, False, "(you have neither)"),
        (True, False, "(no Pokémon in your party knows SURF)"),
        (False, True, "(you do not have the Balance Badge)"),
        (None, False, "(no Pokémon in your party knows SURF)"),
    ],
)
def test_note_says_what_is_missing(badge: bool | None, party: bool, says: str) -> None:
    note = gate(balance_badge=badge, party_surf=party).reason()
    assert note == f"Surf needs the Balance Badge and a party Pokémon that knows SURF {says}"


def test_a_ledge_landing_outside_the_map_goes_nowhere() -> None:
    assert reachable(grid([".J"]), (0, 0), water=False) == frozenset({(0, 0)})


def test_reader_skips_dive_and_unreadable_connections_and_needs_a_map() -> None:
    from test_connection_edges import MAP_GROUPS, connected, open_north_row
    from test_live_map import Memory, loaded

    from pokebench_env.surf_gate import read_surf_gate
    from pokebench_env.topology import Connection, Topology

    assert read_surf_gate(Memory().read, (0, 0), (0, 0), None, None, (), ()) is None
    m = connected(open_north_row(loaded()), 2, 0, (5, 5))
    m.put(MAP_GROUPS, (0).to_bytes(4, "little"))  # the destination's size cannot be read
    topology = Topology(
        5, 5, (Connection("NORTH", 0, (0, 16), "R"), Connection("DIVE", 0, (0, 16), "D"))
    )
    gate = read_surf_gate(m.read, (0, 0), (0, 1), None, topology, ("BALANCE",), (mon(57),))
    assert gate is not None
    assert (gate.can_surf, gate.warps, gate.connections) == (True, (), ())


# --- surf-gated-exits-v2: the notes name no badge and no move ------------------------------------
# Operator decision (the operator, 2026-10-17 1:59 PM): on Route 103 the player has not been told about the
# Balance Badge or SURF, so naming them is route foreknowledge (PB4).

V2 = "surf-gated-exits-v2"
V2_EAST = (
    "- EAST -> ROUTE110 (map 0/25), offset -60; not an exit you can use now: every way from"
    " where you stand to this edge crosses water you cannot cross yet"
)
V2_WARP = (
    f"{OFF_WARP}; not an exit you can use now: every way from where you stand to it crosses"
    " water you cannot cross yet"
)
V2_DEST = (
    "Warp destination at (45,6): map 24/106"
    " (not an exit you can use now: across water you cannot cross yet)"
)


def test_v2_is_a_registered_default_off_server_switch() -> None:
    from pokebench_env.surf_gate import SWITCH_V2

    assert SWITCH_V2 == V2
    assert V2 in SERVER_FEATURES
    assert V2 in features_off_from_env({})


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_v2_off_keeps_the_v1_notes_byte_for_byte(case: dict[str, Any]) -> None:
    v1 = readout(case, [f for f in RECORDED_OFF if f != V2] + [V2])
    baseline = CURRENT[f"surf-gate:{case['tool_result_seq']}"]
    assert changed(baseline, v1) == [
        (OFF_WARP, ON_WARP),
        (OFF_EAST, ON_EAST),
        (OFF_DEST, ON_DEST),
    ]


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_v2_on_rewords_the_three_notes_and_nothing_else(case: dict[str, Any]) -> None:
    base = [f for f in RECORDED_OFF if f != V2]
    v1 = readout(case, [*base, V2])
    v2 = readout(case, base)
    assert changed(v1, v2) == [(ON_WARP, V2_WARP), (ON_EAST, V2_EAST), (ON_DEST, V2_DEST)]
    for word in ("Balance Badge", "SURF", "Surf"):
        assert word not in v2


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["tool_result_seq"]))
def test_v2_without_v1_changes_nothing(case: dict[str, Any]) -> None:
    base = [f for f in RECORDED_OFF if f not in (V2, ID)]
    current = CURRENT[f"surf-gate:{case['tool_result_seq']}"]
    assert readout(case, [*base, ID]) == readout(case, [*base, ID, V2]) == current


def test_v2_experiment_arms_differ_only_in_the_notes() -> None:
    # Review round 1: the candidate arm (incumbent with v2 flipped) must show the v2 wording, so
    # both arms have surf-gated-exits-v1 on. Rendered from the 4caa ROUTE103 RAM.
    on = {
        "ram-state-v1",
        "live-map-v1",
        "live-player-position-v1",
        "world-coordinate-grid-v1",
        "live-object-sprites-v1",
        "world-targets-v1",
        "named-interactions-v1",
        "bounded-navigation-v1",
        "field-dialogue-phase-v1",
        "active-field-message-buffer-v1",
        "naming-cursor-v1",
        "story-state-v1",
        "coordinate-script-conditions-v1",
        "field-control-lock",
        "warp-activation-guidance-v1",
        "ledge-hops-v1",
        "one-way-tiles-v1",
        ID,
    }
    control = [f for f in SERVER_FEATURES if f not in on]
    candidate = [f for f in control if f != V2]
    for case in CASES:
        before, after = readout(case, control), readout(case, candidate)
        pairs = changed(before, after)
        assert pairs and all("Balance Badge" in a and "cannot cross yet" in b for a, b in pairs)
        assert any("at (45,6)" in b for _, b in pairs)
