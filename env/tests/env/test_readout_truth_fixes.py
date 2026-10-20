"""Readout bugs from the 2026-10-17 top-50 run analysis, one server switch each.

runs/reviews/2026-10-17-run-analysis-top50/ram-audit.md items 1, 3 and 6. The fixture holds RAM
windows (never ROM bytes) and CPU registers of recorded archives, each run's own switch set, the
tool result the model got (when the agent recorded one), and the readout text and state JSON
digest rendered at main 00b2b317 with every new switch off (the golden OFF output):

- dc5a raw 10618 / 11525, f551 raw 8716: Norman's Wally scene after LoadWallyZigzagoon (the agent
  rejected every one of these states as malformed; no tool result).
- 93eb seq 16529 (raw 9411): the Wally tutorial battle, "UNKNOWN LvNone".
- b671 seq 8838 / 11566, e962 seq 9904, fe15 seq 9631: mid-frame snapshots read as
  uninitialized saves.
- 0e05 seq 693 (raw 226), 93eb seq 758 (raw 257): the truck before its dynamic warp is set;
  0e05 seq 798 (raw 263): after `setdynamicwarp MAP_LITTLEROOT_TOWN`.
- bd60 seq 18617 / 19141: TORCHIC poisoned on the field, "STATUS 8".
"""

import functools
import gzip
import hashlib
import json
import os
import struct
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from test_pokemon import change_secure
from test_pokemon import fixture as mon_fixture

from pokebench_env import rerender
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.pokemon import PokemonCpu, decode_party_mon
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

OWNER = "tutorial-party-owner-v1"
MID_FRAME = "mid-frame-readout-v1"
UNSET_WARP = "unset-dynamic-warp-v1"
STATUS = "status-names-v1"
NEW = frozenset({OWNER, MID_FRAME, UNSET_WARP, STATUS, "surf-gated-exits-v2"})
ROM_START = 0x08000000

FIXTURE: dict[str, Any] = json.loads(
    gzip.decompress((Path(__file__).parent / "fixtures/readout-truth-fixes.json.gz").read_bytes())
)
CURRENT_READOUTS: dict[str, str] = json.loads(
    (Path(__file__).parent / "fixtures/readout-truth-current-warp-names.json").read_text()
)["cases"]
FRAMES: list[dict[str, Any]] = FIXTURE["frames"]
UNINITIALIZED = "Save-backed world state unavailable: save data is not initialized or valid."
MID_FRAME_TEXT = (
    "Save-backed world state (player, location, party) not read in this snapshot: the game was"
    " in the middle of a frame. Observe again to read it."
)


def key(frame: dict[str, Any]) -> str:
    seq = frame["tool_result_seq"]
    return f"{frame['run'][-4:]}-{'raw' + frame['raw_ram'][8:16] if seq is None else seq}"


BY_KEY = {key(f): f for f in FRAMES}


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


class FixtureMemory:
    """Recorded RAM windows plus the archived CPU registers; ROM reads use the operator ROM."""

    def __init__(self, frame: dict[str, Any], rom: bytes) -> None:
        self.windows = [(int(w["address"], 16), bytes.fromhex(w["hex"])) for w in frame["windows"]]
        self.gprs = tuple(int(x) for x in frame["gprs"])
        self.cpsr = int(frame["cpsr"])
        self.rom = rom

    def __call__(self, address: int, length: int) -> bytes:
        if address >= ROM_START:
            return self.rom[address - ROM_START : address - ROM_START + length]
        for base, data in self.windows:
            if base <= address and address + length <= base + len(data):
                return data[address - base : address - base + length]
        raise KeyError(f"outside fixture: {address:#x}+{length}")

    def pokemon_cpu_context(self) -> PokemonCpu | None:
        sp = self.gprs[13]
        if not (0x02000000 <= sp <= 0x02040000 - 128 or 0x03000000 <= sp <= 0x03008000 - 128):
            return None
        return PokemonCpu(self.gprs, self.cpsr, sp, self(sp, 128))


# Registered on main after these runs were recorded, so off for them.
LATER = frozenset(
    {
        "exit-reachability-v1",
        "heal-before-trainers-v1",
        "battle-effective-damage-v1",
        "semantic-navigation-v1",
        "semantic-navigation-v2",
        "exit-labels-v2",
    }
)


def all_off(frame: dict[str, Any]) -> frozenset[str]:
    return frozenset(frame["recorded_off"]) | NEW | LATER


def state(name: str, on: frozenset[str] = frozenset()) -> GameState:
    frame = BY_KEY[name]
    read = FixtureMemory(frame, operator_rom())
    return rerender.read_state(read, maps(), active_ui=frame["active_ui"], off=all_off(frame) - on)


def render(name: str, on: frozenset[str] = frozenset()) -> str:
    return rerender.render(state(name, on), all_off(BY_KEY[name]) - on)


def digest(value: dict[str, object]) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def changed(name: str, on: frozenset[str]) -> list[tuple[str, str]]:
    before, after = render(name).split("\n"), render(name, on).split("\n")
    assert len(before) == len(after), (before, after)
    return [(a, b) for a, b in zip(before, after, strict=True) if a != b]


# --- registry ---------------------------------------------------------------------------------


@pytest.mark.parametrize("switch", sorted(NEW))
def test_each_switch_is_a_registered_default_off_server_feature(switch: str) -> None:
    assert switch in SERVER_FEATURES
    assert switch in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": switch}) == frozenset({switch})


def test_registered_last_in_order() -> None:
    assert SERVER_FEATURES[-12:-7] == (
        OWNER,
        MID_FRAME,
        UNSET_WARP,
        STATUS,
        "surf-gated-exits-v2",
    )


# --- all switches off: the golden output -------------------------------------------------------


@pytest.mark.parametrize("name", list(BY_KEY))
def test_off_reproduces_the_golden_readout_and_state(name: str) -> None:
    frame = BY_KEY[name]
    # off_readout remains the immutable text rendered when the RAM was archived. Current readout
    # policy lives in a separate fixture only for frames changed by later game-known warp naming.
    assert render(name) == CURRENT_READOUTS.get(name, frame["off_readout"])
    assert digest(state_json(state(name))) == frame["off_state_sha256"]


@pytest.mark.parametrize("name", [k for k, f in BY_KEY.items() if f["received"] is not None])
def test_golden_readout_is_what_the_model_received(name: str) -> None:
    # The agent inserts its own lines (untaken exits, people) into the server's readout.
    frame = BY_KEY[name]
    received, at = frame["received"].split("\n"), 0
    for line in frame["off_readout"].split("\n"):
        at = received.index(line, at) + 1


@pytest.mark.parametrize("name", list(BY_KEY))
@pytest.mark.parametrize("switch", sorted(NEW))
def test_each_switch_alone_changes_only_its_own_frames(name: str, switch: str) -> None:
    mine = {
        OWNER: {"dc5a-raw00010618", "dc5a-raw00011525", "f551-raw00008716", "93eb-16529"},
        MID_FRAME: {"b671-8838", "b671-11566", "e962-9904", "fe15-9631"},
        # Game-known warp naming now hides both invalid and unset internal dynamic-warp names.
        # The decoder remains independently covered through typed state below.
        UNSET_WARP: set(),
        STATUS: {"bd60-18617", "bd60-19141"},
        # bd60 T706 on ROUTE104: surf-gated-exits-v1 was on in that run.
        "surf-gated-exits-v2": {"bd60-19141"},
    }[switch]
    assert (render(name, frozenset({switch})) != render(name)) == (name in mine)


# --- 1. tutorial-party-owner-v1 ----------------------------------------------------------------

ZIGZAGOON_SCENE = ["dc5a-raw00010618", "dc5a-raw00011525", "f551-raw00008716"]


@pytest.mark.parametrize("name", ZIGZAGOON_SCENE)
def test_off_the_wally_scene_is_unknown_and_undecoded(name: str) -> None:
    off = state(name)
    assert off.party_owner == "unknown"
    assert BY_KEY[name]["observed"]["party_owner"] == "unknown"
    assert off.party is not None and off.party[0].diagnostic == (
        "harness bug: Pokémon invalid move or PP"
    )
    assert state_json(off)["party_owner"] == "unknown"


@pytest.mark.parametrize("name", ZIGZAGOON_SCENE)
def test_on_the_wally_scene_is_the_tutorial_zigzagoon(name: str) -> None:
    on = state(name, frozenset({OWNER}))
    assert on.party_owner == "tutorial"
    assert on.party_ownership is not None
    assert on.party_ownership.source == "native_wally_tutorial_script"
    assert on.party is not None
    mon = on.party[0]
    assert (mon.species, mon.species_id, mon.level, mon.diagnostic) == ("ZIGZAGOON", 288, 7, None)
    assert mon.moves is not None
    tackle = mon.moves[0].pp
    assert [(m.move_id, m.name, m.pp) for m in mon.moves] == [
        (33, "TACKLE", tackle),
        (0, None, 40),
        (0, None, 30),
        (0, None, 0),
    ]
    assert tackle in (33, 35)
    assert state_json(on)["party_owner"] == "tutorial"
    [(before, after)] = changed(name, frozenset({OWNER}))
    assert before.startswith("Party (unknown): UNKNOWN LvNone HP None/None")
    assert after == (
        f"Party (tutorial): ZIGZAGOON Lv7 HP {mon.hp}/{mon.max_hp} · moves TACKLE PP {tackle}"
        " · nickname ZIGZAGOON"
    )


def test_on_the_tutorial_battle_shows_the_zigzagoon() -> None:
    off = render("93eb-16529")
    on = render("93eb-16529", frozenset({OWNER}))
    assert "HARNESS BUG (battle): harness bug: empty battle move has PP" in off
    assert "Party (tutorial): UNKNOWN LvNone" in off
    assert "HARNESS BUG (battle)" not in on
    assert (
        "Battle details: WILD single · WALLY tutorial (the game plays it) · turn 4 · resolving"
        in on
    )
    assert "Actions: none (the game plays the WALLY tutorial)" in on
    assert (
        "Party (tutorial): ZIGZAGOON Lv7 HP 24/24 · moves TACKLE PP 33 · nickname ZIGZAGOON" in on
    )
    assert state("93eb-16529", frozenset({OWNER})).battle.initialized


def zigzagoon_body() -> tuple[bytes, Callable[[int, int], bytes]]:
    body, read = mon_fixture()
    return change_secure(body, attacks=struct.pack("<4H4B", 33, 0, 0, 0, 35, 40, 30, 0)), read


def test_an_empty_move_slot_keeps_its_pp_only_when_asked() -> None:
    body, read = zigzagoon_body()
    assert "move or PP" in str(decode_party_mon(body, read).diagnostic)
    mon = decode_party_mon(body, read, empty_move_pp=True)
    assert mon.diagnostic is None and mon.moves is not None
    assert [(m.move_id, m.pp, m.max_pp) for m in mon.moves] == [
        (33, 35, 35),
        (0, 40, 0),
        (0, 30, 0),
        (0, 0, 0),
    ]
    # A real move still cannot exceed its maximum, and PP above 64 is still corrupt.
    over = change_secure(body, attacks=struct.pack("<4H4B", 33, 0, 0, 0, 36, 0, 0, 0))
    assert "PP exceeds" in str(decode_party_mon(over, read, empty_move_pp=True).diagnostic)
    wild = change_secure(body, attacks=struct.pack("<4H4B", 33, 0, 0, 0, 35, 65, 0, 0))
    assert "move or PP" in str(decode_party_mon(wild, read, empty_move_pp=True).diagnostic)


def test_on_an_owner_that_cannot_be_established_leaves_party_owner_out() -> None:
    # The agent's schema accepts no "unknown" owner and rejects the whole state; ON omits the
    # optional field instead, so the agent keeps the state and party_ownership says why.
    on = state("dc5a-raw00010618", frozenset({OWNER}))
    unknown = replace(on, party_owner=None)
    body = state_json(unknown)
    assert "party_owner" not in body
    assert body["party_ownership"] is not None
    assert "Party (unknown): " in rerender.render(unknown, all_off(BY_KEY["dc5a-raw00010618"]))


def test_on_the_production_reader_omits_an_unestablished_owner() -> None:
    frame = BY_KEY["dc5a-raw00010618"]
    read = FixtureMemory(frame, operator_rom())
    party = 0x020244EC

    def broken(address: int, length: int) -> bytes:
        data = read(address, length)
        if address <= party + 0x13 < address + length:
            # Clear slot 0's has-species bit: the slot no longer decodes.
            index = party + 0x13 - address
            data = data[:index] + bytes([data[index] & ~2]) + data[index + 1 :]
        return data

    on = rerender.read_state(broken, maps(), active_ui=True, off=all_off(frame) - {OWNER})
    assert on.party_owner is None
    assert "party_owner" not in state_json(on)
    off = rerender.read_state(broken, maps(), active_ui=True, off=all_off(frame))
    assert off.party_owner == "unknown"


# --- 2. mid-frame-readout-v1 -------------------------------------------------------------------

MID = ["b671-8838", "b671-11566", "e962-9904", "fe15-9631"]


@pytest.mark.parametrize("name", MID)
def test_on_a_mid_frame_snapshot_says_so_instead_of_an_uninitialized_save(name: str) -> None:
    assert render(name).endswith(UNINITIALIZED)
    assert changed(name, frozenset({MID_FRAME})) == [(UNINITIALIZED, MID_FRAME_TEXT)]
    assert state_json(state(name, frozenset({MID_FRAME}))) == state_json(state(name))


def test_on_an_invalid_save_on_an_idle_frame_keeps_the_uninitialized_line() -> None:
    frame = BY_KEY["fe15-9631"]
    read = FixtureMemory(frame, operator_rom())
    regs = list(read.gprs)
    regs[15] = 0x080008C8 + 2  # WaitForVBlank: an idle main loop.
    read.gprs = tuple(regs)
    read.cpsr = 0x6000003F

    def zero_saves(address: int, length: int) -> bytes:
        return bytes(length) if address == 0x03005D8C else read(address, length)

    zero_saves.pokemon_cpu_context = read.pokemon_cpu_context  # type: ignore[attr-defined]
    off = all_off(frame) - {MID_FRAME}
    text = rerender.render(rerender.read_state(zero_saves, maps(), active_ui=True, off=off), off)
    assert text.endswith(UNINITIALIZED)


# --- 3. unset-dynamic-warp-v1 ------------------------------------------------------------------


@pytest.mark.parametrize("name", ["0e05-693", "93eb-758"])
def test_on_an_unset_dynamic_warp_is_not_petalburg_city(name: str) -> None:
    off, on = render(name), render(name, frozenset({UNSET_WARP}))
    assert "PETALBURG CITY" not in off and "PETALBURG CITY" not in on
    assert off == on
    assert state(name).dynamic_warp == (0, 0, "PETALBURG CITY")
    assert state(name, frozenset({UNSET_WARP})).dynamic_warp is None
    assert "Warp destination at (4,1): dynamic destination" in off


def test_on_a_set_dynamic_warp_keeps_its_internal_littleroot_identity() -> None:
    assert render("0e05-798", frozenset({UNSET_WARP})) == render("0e05-798")
    assert state("0e05-798", frozenset({UNSET_WARP})).dynamic_warp == (0, 9, "LITTLEROOT TOWN")
    assert "LITTLEROOT TOWN (dynamic warp; map 0/9)" not in render("0e05-798")


def test_v2_rewords_the_route104_south_edge_bd60_t706() -> None:
    [(before, after)] = changed("bd60-19141", frozenset({"surf-gated-exits-v2"}))
    head = "- SOUTH -> ROUTE105 (map 0/20), offset 0; not an exit you can use now: every way from"
    assert before == (
        f"{head} where you stand to this edge crosses water, and Surf needs the Balance Badge"
        " and a party Pokémon that knows SURF (you have neither)"
    )
    assert after == f"{head} where you stand to this edge crosses water you cannot cross yet"


def test_v2_alongside_exit_reachability_rewords_only_the_water_notes() -> None:
    # exit-reachability-v1 notes the exits reachable neither way ("not reachable on foot ...");
    # v2 replaces only v1's Surf wording on the water-only ones.
    reach = frozenset({"exit-reachability-v1"})
    v1 = render("bd60-19141", reach).split("\n")
    v2 = render("bd60-19141", reach | {"surf-gated-exits-v2"}).split("\n")
    assert len(v1) == len(v2)
    pairs = [(a, b) for a, b in zip(v1, v2, strict=True) if a != b]
    assert pairs and all("Balance Badge" in a and "cannot cross yet" in b for a, b in pairs)
    reached = [line for line in v2 if "not reachable on foot from where you stand" in line]
    assert reached and reached == [
        line for line in v1 if "not reachable on foot from where you stand" in line
    ]
    for line in v2:
        assert "Balance Badge" not in line and "SURF" not in line


# --- 4. status-names-v1 ------------------------------------------------------------------------

# The game's own labels for the party/summary status icons (src/strings.c:627-631) in
# GetAilmentFromStatus order (src/party_menu.c:1909-1922).


@pytest.mark.parametrize(("name", "hp"), [("bd60-18617", 13), ("bd60-19141", 2)])
def test_on_poison_reads_psn(name: str, hp: int) -> None:
    [(before, after)] = changed(name, frozenset({STATUS}))
    assert f"TORCHIC Lv11 HP {hp}/33 · STATUS 8 · moves" in before
    assert after == before.replace("STATUS 8", "STATUS PSN")


@pytest.mark.parametrize(
    ("status", "text"),
    [
        (0, None),
        (3, "SLP"),
        (8, "PSN"),
        (0x80 | (2 << 8), "PSN"),
        (16, "BRN"),
        (32, "FRZ"),
        (64, "PAR"),
        (8 | 64, "PSN"),
        (64 | 3, "PAR"),
        (3 | 32, "SLP"),
        (32 | 16, "FRZ"),
        (0x100, None),
    ],
)
def test_status_text_is_the_ailment_the_game_shows(status: int, text: str | None) -> None:
    from pokebench_env.status_names import status_text

    assert status_text(status) == text


def test_a_status_with_no_ailment_keeps_its_number() -> None:
    on = state("bd60-18617", frozenset({STATUS}))
    assert on.party is not None
    odd = replace(on, party=(replace(on.party[0], status=0x100),))
    off = all_off(BY_KEY["bd60-18617"]) - {STATUS}
    assert " · STATUS 256 · " in rerender.render(odd, off)


# --- game-source grounding (operator rule 2026-10-17: say what the game would show) ------------
POKEEMERALD = Path(os.environ.get("POKEEMERALD", "/Users/user/dev/pokeemerald"))


def source(relative: str) -> str:
    path = POKEEMERALD / relative
    if not path.is_file():
        pytest.skip(f"pret/pokeemerald checkout not found at {POKEEMERALD}")
    return path.read_text()


def test_status_labels_are_the_games_own_strings() -> None:
    strings = source("src/strings.c")
    for symbol, label in [
        ("gText_Psn", "PSN"),
        ("gText_Par", "PAR"),
        ("gText_Slp", "SLP"),
        ("gText_Frz", "FRZ"),
        ("gText_Brn", "BRN"),
    ]:
        assert f'const u8 {symbol}[] = _("{label}");' in strings
    order = source("src/party_menu.c").split("u8 GetAilmentFromStatus(u32 status)", 1)[1]
    order = order.split("}", 1)[0]
    returns = [line.strip() for line in order.splitlines() if "return AILMENT_" in line]
    assert returns == [
        "return AILMENT_PSN;",
        "return AILMENT_PRZ;",
        "return AILMENT_SLP;",
        "return AILMENT_FRZ;",
        "return AILMENT_BRN;",
        "return AILMENT_NONE;",
    ]


def test_surf_v2_says_only_what_the_game_shows_without_a_surf_user() -> None:
    # GetInteractedWaterScript (src/field_control_avatar.c:448-461) is the silent owner: pressing
    # A at surfable water starts EventScript_UseSurf (and its gText_WantToUseSurf prompt) only when
    # FLAG_BADGE05_GET is set, a party Pokémon knows Surf and the player faces surfable water;
    # otherwise, away from a waterfall, it returns NULL and the game shows nothing. So v2 states
    # only the fact: water the player cannot cross yet.
    body = source("src/field_control_avatar.c").split(
        "static const u8 *GetInteractedWaterScript(struct MapPosition *unused1,", 1
    )[1]
    body = body.split("\n}\n", 1)[0]
    assert (
        "if (FlagGet(FLAG_BADGE05_GET) == TRUE && PartyHasMonWithSurf() == TRUE"
        " && IsPlayerFacingSurfableFishableWater() == TRUE)\n        return EventScript_UseSurf;"
    ) in body
    assert "if (MetatileBehavior_IsWaterfall(metatileBehavior) == TRUE)" in body
    assert body.rstrip().endswith("return NULL;")
    from pokebench_env.surf_gate import CANNOT_CROSS

    assert CANNOT_CROSS == "crosses water you cannot cross yet"


# --- each pending experiment's arms (review round 1) --------------------------------------------
# The candidate arm is the incumbent with only changedFeature flipped; its prerequisite must be on
# in both arms, or the switch changes nothing. Each arm's server switches are the incumbent's off
# features, as serverFeatureEnv builds POKEBENCH_FEATURES_OFF.
EXPERIMENTS = Path(__file__).resolve().parents[3] / "experiments"
ARMS = [
    (
        "tutorial-party-owner",
        "dc5a-raw00010618",
        "Party (unknown): UNKNOWN LvNone",
        "Party (tutorial): ZIGZAGOON Lv7 HP 23/23",
    ),
    ("mid-frame-readout", "fe15-9631", UNINITIALIZED, MID_FRAME_TEXT),
    ("status-names", "bd60-18617", "HP 13/33 · STATUS 8 · ", "HP 13/33 · STATUS PSN · "),
]


@pytest.mark.parametrize(("experiment", "name", "before_text", "after_text"), ARMS)
def test_each_experiment_arm_turns_its_change_on(
    experiment: str, name: str, before_text: str, after_text: str
) -> None:
    body = json.loads((EXPERIMENTS / f"{experiment}.json").read_text())
    features: dict[str, bool] = body["incumbent"]["features"]
    changed_feature = body["changedFeature"]
    assert features[changed_feature] is False
    control = frozenset(f for f in SERVER_FEATURES if not features.get(f, False))
    candidate = control - {changed_feature}
    frame = BY_KEY[name]
    active = bool(features.get("active-ui-ownership-v1", False))

    def arm(off: frozenset[str]) -> str:
        read = FixtureMemory(frame, operator_rom())
        return rerender.render(rerender.read_state(read, maps(), active_ui=active, off=off), off)

    before, after = arm(control), arm(candidate)
    assert before_text in before and before_text not in after
    assert after_text in after and after_text not in before


def test_unset_dynamic_warp_experiment_is_superseded_but_still_flips_typed_state() -> None:
    body = json.loads((EXPERIMENTS / "unset-dynamic-warp.json").read_text())
    features: dict[str, bool] = body["incumbent"]["features"]
    assert "superseded" in body["hypothesis"]
    assert "no attributable treatment contrast" in body["discarded"]
    assert features[UNSET_WARP] is False and features["named-warp-destinations-v1"] is True
    control = frozenset(f for f in SERVER_FEATURES if not features.get(f, False))
    candidate = control - {UNSET_WARP}
    frame = BY_KEY["0e05-693"]
    read = FixtureMemory(frame, operator_rom())
    before = rerender.read_state(read, maps(), active_ui=True, off=control)
    after = rerender.read_state(read, maps(), active_ui=True, off=candidate)
    assert before.dynamic_warp == (0, 0, "PETALBURG CITY") and after.dynamic_warp is None
    assert rerender.render(before, control) == rerender.render(after, candidate)
