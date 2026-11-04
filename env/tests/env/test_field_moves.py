"""field-move-gates-v1: one module owns every field-move and item gate (pret/pokeemerald 731ad5bf).

The gate table names, for each obstacle the game puts in the player's way, how the game marks it,
what opens it and the text the game prints when it stays closed. Capabilities are read from the
badges, the party's moves (checkpartymove skips eggs, src/scrcmd.c ScrCmd_checkpartymove), the
bag and the avatar flags; None wherever an unread value could change the answer.

Real-RAM fixture field-moves-a8f9.json.gz: control run 2026-10-20T16-14-34_qwen36-gpu0_a8f9,
state seq 41177 (turn 1283), RUSTURF TUNNEL (24/4) at (4,7), no badges. Its exit_reach labelled
the warps (4,10), (29,16) and (18,20) all `foot` although the map's two BREAKABLE_ROCK objects
at (24,4) and (24,5) close the only way east, and navigate_to said "call navigate_to again to
continue to (29,16)".
"""

import functools
import gzip
import json
import os
from pathlib import Path
from typing import Any

import pytest

from pokebench_env import field_moves, surf_gate
from pokebench_env.field_moves import (
    GATES,
    MACH_BIKE,
    Obstacle,
    capabilities,
    read_object_obstacles,
)
from pokebench_env.pokemon import PartyMon, PokemonMove
from pokebench_env.resources import ResourceItem
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

FIXTURES = Path(__file__).parent / "fixtures"
POKEEMERALD = Path(os.environ.get("POKEEMERALD", "/Users/user/dev/pokeemerald"))
MOVE_GATES = {
    "cut": ("STONE", 15),
    "rock_smash": ("DYNAMO", 249),
    "strength": ("HEAT", 70),
    "waterfall": ("RAIN", 127),
    "dive": ("MIND", 291),
}
ITEM_GATES = {"mach_bike": 259, "acro_bike": 272, "go_goggles": 279, "devon_scope": 288}


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
def fixture() -> dict[str, Any]:
    body: dict[str, Any] = json.loads(
        gzip.decompress((FIXTURES / "field-moves-a8f9.json.gz").read_bytes())
    )
    return body


@functools.cache
def cells() -> dict[int, int]:
    found: dict[int, int] = {}
    for window in fixture()["cases"][0]["windows"]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            found[start + offset] = value
    return found


def mon(moves: tuple[int, ...] | None, *, egg: bool | None = False) -> PartyMon:
    return PartyMon(
        "MON",
        10,
        10,
        10,
        is_egg=egg,
        moves=None if moves is None else tuple(PokemonMove(m, 10, 0) for m in moves),
    )


def item(item_id: int) -> ResourceItem:
    return ResourceItem(0, item_id, 1, "key_items")


def test_the_table_has_one_row_per_gate_in_the_contract() -> None:
    assert [g.id for g in GATES] == [
        "cut",
        "rock_smash",
        "strength",
        "surf",
        "waterfall",
        "dive",
        "mach_bike",
        "acro_bike",
        "go_goggles",
        "devon_scope",
    ]
    for gate in GATES:
        assert gate.marker and gate.source and gate.needs
    by_id = {g.id: g for g in GATES}
    for gid, (badge, move) in MOVE_GATES.items():
        assert (by_id[gid].badge, by_id[gid].move, by_id[gid].items) == (badge, move, ())
    assert (by_id["surf"].badge, by_id["surf"].move) == ("BALANCE", 57)
    for gid, item_id in ITEM_GATES.items():
        assert (by_id[gid].badge, by_id[gid].move, by_id[gid].items) == (None, None, (item_id,))
    assert by_id["mach_bike"].avatar == MACH_BIKE == 1 << 1
    assert by_id["acro_bike"].avatar == 1 << 2
    # surf-gated-exits-v2 wording: no badge or move is named.
    assert {g.needs for g in GATES} == {
        "a field move you cannot use yet",
        "an item you do not have yet",
        "special movement that walking navigation does not perform",
    }


def test_the_game_prints_nothing_for_surf_and_the_bikes() -> None:
    silent = {g.id for g in GATES if g.text is None}
    assert silent == {"surf", "mach_bike", "acro_bike"}
    texts = {g.id: g.text for g in GATES}
    assert texts["rock_smash"] == "It's a rugged rock, but a POKéMON may be able to smash it."
    assert texts["cut"] == "This tree looks like it can be CUT down!"


@pytest.mark.parametrize("gid", sorted(MOVE_GATES))
def test_move_gate_truth_table(gid: str) -> None:
    badge, move = MOVE_GATES[gid]
    other = 33
    cases: list[tuple[tuple[str, ...] | None, tuple[PartyMon, ...] | None, bool | None]] = [
        ((badge,), (mon((move,)),), True),
        ((badge,), (mon((other,)), mon((other, move))), True),
        ((), (mon((move,)),), False),
        ((badge,), (mon((other,)),), False),
        ((badge,), (), False),
        # checkpartymove skips eggs.
        ((badge,), (mon((move,), egg=True),), False),
        ((badge,), (mon((move,), egg=None),), None),
        ((badge,), (mon(None),), None),
        ((badge,), (mon(None), mon((move,))), True),
        ((badge,), None, None),
        (None, (mon((move,)),), None),
        (None, (mon((other,)),), False),
        ((), None, False),
        (None, None, None),
    ]
    for badges, party, want in cases:
        assert capabilities(party, badges, (), 0).of(gid) is want, (badges, party)


@pytest.mark.parametrize("gid", sorted(ITEM_GATES))
def test_item_gate_truth_table(gid: str) -> None:
    item_id = ITEM_GATES[gid]
    assert capabilities((), (), (item(item_id),), 0).of(gid) is True
    assert capabilities((), (), (item(4),), 0).of(gid) is False
    assert capabilities((), (), (), 0).of(gid) is False
    assert capabilities((), (), None, 0).of(gid) is None
    assert capabilities((), (), None, None).of(gid) is None


def test_riding_a_bike_opens_its_terrain_whatever_the_bag_says() -> None:
    assert capabilities((), (), (), 1 << 1).of("mach_bike") is True
    assert capabilities((), (), (), 1 << 2).of("acro_bike") is True
    assert capabilities((), (), (), 1 << 1).of("acro_bike") is False
    assert capabilities((), (), (), None).of("mach_bike") is False


def test_surf_is_the_surf_gated_exits_rule_unchanged() -> None:
    surfer = (mon((57,)),)
    for badges, party, flags in [
        (("BALANCE",), surfer, 0),
        ((), surfer, 0),
        (("BALANCE",), (), 0),
        ((), (), 1 << 3),
        (None, surfer, 0),
        (("BALANCE",), None, None),
        # PartyHasMonWithSurf counts an egg, as surf_use always has.
        (("BALANCE",), (mon((57,), egg=True),), 0),
    ]:
        assert (
            capabilities(party, badges, (), flags).of("surf")
            is surf_gate.surf_use(badges, party, flags).can_surf
        )


def test_surf_gate_keeps_its_names_as_thin_wrappers_over_field_moves() -> None:
    for name in ("surf_use", "reachable", "classify", "water_only", "SurfUse", "Reached"):
        assert getattr(surf_gate, name) is getattr(field_moves, name)
    assert surf_gate.LEDGES == field_moves.LEDGES and surf_gate.STEP == field_moves.STEP


def test_capabilities_json_names_every_gate() -> None:
    body = capabilities(None, (), (), 0).json()
    assert list(body) == [g.id for g in GATES]
    assert body["rock_smash"] is False and body["cut"] is False and body["mach_bike"] is False


def test_hidden_templates_and_other_sprites_are_not_obstacles() -> None:
    # One template slot per entry: (localId, graphicsId, x, y, flagId), 24 bytes each.
    save1 = 0x02025A00
    flags = save1 + 0x1270

    def template(local: int, graphics: int, x: int, y: int, flag: int) -> bytes:
        body = bytearray(24)
        body[0], body[1] = local, graphics
        body[4:6] = x.to_bytes(2, "little", signed=True)
        body[6:8] = y.to_bytes(2, "little", signed=True)
        body[0x14:0x16] = flag.to_bytes(2, "little")
        return bytes(body)

    templates = (
        template(1, 82, 3, 4, 0x11)  # CUTTABLE_TREE, its temp flag set: cut this visit
        + template(2, 82, 5, 6, 0x12)  # CUTTABLE_TREE, present
        + template(3, 87, 7, 8, 0)  # PUSHABLE_BOULDER, no flag
        + template(4, 59, 9, 9, 0)  # ITEM_BALL
        + template(5, 204, 12, 16, 0)  # KECLEON on the Route 120 bridge: a story event
        + bytes(24 * 59)
    )
    memory = {save1 + 0xC70 + i: b for i, b in enumerate(templates)}
    memory[flags + 0x11 // 8] = 1 << (0x11 % 8)

    def read(address: int, length: int) -> bytes:
        if address == 0x02037350:
            return bytes(length)
        return bytes(memory.get(address + i, 0) for i in range(length))

    found = read_object_obstacles(read, save1, (0, 0), "ROUTE120")
    assert found == (
        Obstacle("cut", "CUTTABLE_TREE", ((5, 6),), 2, False),
        Obstacle("strength", "PUSHABLE_BOULDER", ((7, 8),), 3, False),
    )
    assert read_object_obstacles(read, 0x01000000, (0, 0), "ROUTE120") is None


def test_a_short_or_failing_template_read_says_nothing() -> None:
    def short(address: int, length: int) -> bytes:
        return bytes(min(length, 8))

    def failing(address: int, length: int) -> bytes:
        raise ValueError("unmapped")

    assert read_object_obstacles(short, 0x02025A00, (0, 0), None) is None
    assert read_object_obstacles(failing, 0x02025A00, (0, 0), None) is None
