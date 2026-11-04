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
from pathlib import Path
from typing import Any

import pytest
from test_pokemon import change_secure
from test_pokemon import fixture as mon_fixture

from pokebench_env import rerender
from pokebench_env.game_state import GameState, MapNames
from pokebench_env.pokemon import PokemonCpu, decode_party_mon
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
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
        "type-gap-team-v1",
        "map-observability-v1",
        "player-elevation-readout-v1",
        "exit-reachability-v1",
        "heal-before-trainers-v1",
        "battle-effective-damage-v1",
        "semantic-navigation-v1",
        "semantic-navigation-v2",
        "exit-labels-v2",
    }
)


# Registered after these recordings and absent from their readouts.
TRAINING = frozenset({"exp-next-level-v1", "pokedex-own-v1", "map-wide-triggers-v1"})


def all_off(frame: dict[str, Any]) -> frozenset[str]:
    return (
        frozenset(frame["recorded_off"])
        | NEW
        | {"player-map-visibility-v2"}
        | {"active-warp-exits-v1", "available-exits-presentation-v1"}
        | LATER
        | TRAINING
        | {"poison-readout-v1", "berry-readout-v1", "static-npc-template-approach-v1"}
        | {"window-escape-route-v1", "elevation-aware-map-v1", "screen-center-player-v1"}
    )


def state(name: str, on: frozenset[str] = frozenset()) -> GameState:
    frame = BY_KEY[name]
    read = FixtureMemory(frame, operator_rom())
    return rerender.read_state(read, maps(), active_ui=frame["active_ui"], off=all_off(frame) - on)


def render(name: str, on: frozenset[str] = frozenset()) -> str:
    return rerender.render(state(name, on), all_off(BY_KEY[name]) - on)


def digest(value: dict[str, object]) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


# --- registry ---------------------------------------------------------------------------------


@pytest.mark.parametrize("switch", sorted(NEW))
def test_each_switch_is_a_registered_default_off_server_feature(switch: str) -> None:
    assert switch in SERVER_FEATURES
    assert switch in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": switch}) == frozenset({switch})


def test_registered_last_in_order() -> None:
    assert SERVER_FEATURES[42:47] == (
        OWNER,
        MID_FRAME,
        UNSET_WARP,
        STATUS,
        "surf-gated-exits-v2",
    )


# --- all switches off: the golden output -------------------------------------------------------


@pytest.mark.parametrize("name", [k for k, f in BY_KEY.items() if f["received"] is not None])
def test_golden_readout_is_what_the_model_received(name: str) -> None:
    # The agent inserts its own lines (untaken exits, people) into the server's readout.
    frame = BY_KEY[name]
    received, at = frame["received"].split("\n"), 0
    for line in frame["off_readout"].split("\n"):
        at = received.index(line, at) + 1


# --- 1. tutorial-party-owner-v1 ----------------------------------------------------------------


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


# --- 2. mid-frame-readout-v1 -------------------------------------------------------------------


# --- 3. unset-dynamic-warp-v1 ------------------------------------------------------------------


# --- 4. status-names-v1 ------------------------------------------------------------------------

# The game's own labels for the party/summary status icons (src/strings.c:627-631) in
# GetAilmentFromStatus order (src/party_menu.c:1909-1922).


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


# --- game-source grounding (operator rule 2026-10-17: say what the game would show) ------------
POKEEMERALD = Path(os.environ.get("POKEEMERALD", "/Users/user/dev/pokeemerald"))


def source(relative: str) -> str:
    path = POKEEMERALD / relative
    if not path.is_file():
        pytest.skip(f"pret/pokeemerald checkout not found at {POKEEMERALD}")
    return path.read_text()


# --- independent treatment arms on recorded RAM -----------------------------------------------
# The candidate arm is the incumbent with only changedFeature flipped; its prerequisite must be on
# in both arms, or the switch changes nothing. Each arm's server switches are the incumbent's off
# features, as serverFeatureEnv builds POKEBENCH_FEATURES_OFF.
