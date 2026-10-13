import json
import struct
from pathlib import Path

import pytest

from pokebench_env.game_state import (
    GBA_TEXT,
    SPECIES_NAMES,
    GameState,
    MapNames,
    PartyMon,
    decode_text,
    read_game_state,
)
from pokebench_env.story import StoryState

SB1, SB2 = 0x02025A18, 0x02024A6C
OVERWORLD = (0x08085E05, 0x08085E5D)
NAMING = (0x0, 0x080E4F59)
BIRCH_SPEECH = 0x0802F6B1
ORDERS = (
    "GAEM GAME GEAM GEMA GMAE GMEA AGEM AGME AEGM AEMG AMGE AMEG "
    "EGAM EGMA EAGM EAMG EMGA EMAG MGAE MGEA MAGE MAEG MEGA MEAG"
).split()


def text(s: str) -> bytes:
    inverse = {v: k for k, v in GBA_TEXT.items()}
    return bytes(inverse[c] for c in s)


class Memory:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


def mon(species: int, level: int, hp: int, max_hp: int, personality: int, ot_id: int) -> bytes:
    growth = struct.pack("<HHIBBH", species, 0, 0, 0, 0, 0)
    subs = {k: (growth if k == "G" else bytes(12)) for k in "GAEM"}
    plain = b"".join(subs[k] for k in ORDERS[personality % 24])
    key = personality ^ ot_id
    secure = b"".join(
        struct.pack("<I", struct.unpack("<I", plain[i : i + 4])[0] ^ key) for i in range(0, 48, 4)
    )
    body = struct.pack("<II", personality, ot_id) + bytes(0x18) + secure
    body += bytes(0x54 - len(body)) + struct.pack("<BBHH", level, 0, hp, max_hp)
    return body + bytes(100 - len(body))


def game(screen: tuple[int, int], party: list[bytes] | None = None, badges: int = 0) -> Memory:
    m = Memory()
    m.put(0x030022C0, struct.pack("<II", *screen))
    m.put(0x03005D8C, struct.pack("<II", SB1, SB2))
    m.put(SB2, text("MAY") + b"\xff" + bytes(4))
    m.put(SB2 + 0x0E, struct.pack("<HBB", 1, 2, 3))
    m.put(SB2 + 0xAC, struct.pack("<I", 0x1234))
    m.put(SB1, struct.pack("<hhbb", 7, 9, 0, 9))
    m.put(SB1 + 0x490, struct.pack("<I", 3000 ^ 0x1234))
    m.put(
        SB1 + 0x1270 + (0x867 >> 3),
        bytes([badges << (0x867 & 7) & 0xFF, badges >> (8 - (0x867 & 7))]),
    )
    m.put(0x02037350, bytes([1, 0, 1]))
    m.put(0x02037350 + 0x10, struct.pack("<hh", 14, 16))
    m.put(0x02037590 + 5, bytes([0]))
    m.put(0x02037350 + 0x18, bytes([0x44]))
    m.put(0x030026F9, bytes([0]))
    members = party or []
    m.put(0x020244E9, bytes([len(members)]))
    for i, body in enumerate(members):
        m.put(0x020244EC + 100 * i, body)
    for sid, name in ((280, "TORCHIC"), (286, "POOCHYENA")):
        m.put(0x083185C8 + 11 * sid, text(name) + b"\xff")
    return m


MAPS = MapNames({(0, 9): "LITTLEROOT TOWN"})


def test_overworld_reports_every_field_from_the_save_blocks() -> None:
    party = [mon(280, 5, 18, 20, personality=0x12345671, ot_id=0xCAFEBABE)]
    state = read_game_state(game(OVERWORLD, party, badges=0b101).read, MAPS)
    assert state == GameState(
        screen="overworld",
        story=StoryState(
            name_confirmed=True,
            intro_stage=0,
            rival_stage=0,
            birch_lab_stage=0,
            petalburg_gym_stage=0,
            woods_stage=0,
            clock_set=False,
            rival_battle_won=False,
            pokedex_received=False,
            running_shoes_received=False,
            starter_tutorial_complete=False,
            rustboro_gym_complete=False,
            stone_badge=True,
            rock_tomb_received=False,
        ),
        started=True,
        name="MAY",
        location="LITTLEROOT TOWN",
        map_id=(0, 9),
        position=(7, 9),
        facing="right",
        in_battle=False,
        party=(PartyMon("TORCHIC", 5, 18, 20),),
        money=3000,
        badges=("STONE", "DYNAMO"),
        play_time=(1, 2, 3),
        field_controls_locked=False,
    )


@pytest.mark.parametrize("personality", range(24))
def test_every_substructure_order_decrypts(personality: int) -> None:
    party = [mon(286, 3, 9, 12, personality=personality + 24 * 7, ot_id=0x0BADF00D)]
    state = read_game_state(game(OVERWORLD, party).read, MAPS)
    assert state.party == (PartyMon("POOCHYENA", 3, 9, 12),)


def test_before_the_game_starts_no_save_field_is_reported() -> None:
    from pokebench_env.ui_state import ActiveUi

    state = read_game_state(game(NAMING).read, MAPS)
    assert state == GameState(
        screen="naming",
        active_ui=ActiveUi(
            "unsupported",
            None,
            None,
            "Observe and report this coverage error",
            "callback2 0x080E4F59; naming buffer or cursor invalid; pointer 0x00000000",
        ),
        story=StoryState(),
        started=False,
        name=None,
        location=None,
        map_id=None,
        position=None,
        facing=None,
        in_battle=False,
        party=None,
        money=None,
        badges=None,
        play_time=None,
    )


def test_an_unknown_map_is_named_by_its_id() -> None:
    m = game(OVERWORLD)
    m.put(SB1 + 4, bytes([25, 40]))
    assert read_game_state(m.read, MAPS).location == "unknown map (25, 40)"


def test_unknown_screen_after_start_still_reports_fields_and_flags_battle() -> None:
    m = game((0x0, 0x0803CAFE))
    m.put(0x030026F9, bytes([0x02]))
    state = read_game_state(m.read, MAPS)
    assert (state.screen, state.started, state.in_battle, state.name) == (
        "unknown (callback2 0x0803CAFE)",
        True,
        True,
        "MAY",
    )


def test_an_unreadable_species_is_reported_by_id() -> None:
    party = [mon(999, 5, 1, 1, personality=1, ot_id=2)]
    assert read_game_state(game(OVERWORLD, party).read, MAPS).party == (
        PartyMon("species #999", 5, 1, 1),
    )


def test_a_party_count_above_six_is_an_error() -> None:
    m = game(OVERWORLD)
    m.put(0x020244E9, bytes([7]))
    with pytest.raises(ValueError, match="party count 7"):
        read_game_state(m.read, MAPS)


def test_decode_text_stops_at_the_terminator_and_marks_unknown_bytes() -> None:
    assert decode_text(text("MR. MIME") + b"\xff" + text("X")) == "MR. MIME"
    assert decode_text(bytes([0x01])) == "?"


def test_species_names_live_in_the_rom_table() -> None:
    assert SPECIES_NAMES == 0x083185C8


def test_map_names_come_from_pokeemerald_map_groups(tmp_path: Path) -> None:
    root = tmp_path / "maps"
    (root / "LittlerootTown").mkdir(parents=True)
    (root / "LittlerootTown" / "map.json").write_text(json.dumps({"id": "MAP_LITTLEROOT_TOWN"}))
    (root / "InsideOfTruck").mkdir()
    (root / "InsideOfTruck" / "map.json").write_text(json.dumps({"id": "MAP_INSIDE_OF_TRUCK"}))
    groups = {"group_order": ["gA", "gB"], "gA": ["LittlerootTown"], "gB": ["InsideOfTruck"]}
    (root / "map_groups.json").write_text(json.dumps(groups))
    names = MapNames.load(root)
    assert names.name((0, 0)) == "LITTLEROOT TOWN"
    assert names.name((1, 0)) == "INSIDE OF TRUCK"
    assert names.name((5, 5)) is None


def test_the_vendored_map_groups_name_the_truck() -> None:
    root = (
        Path(__file__).resolve().parents[2]
        / "vendor/continual-harness/pokemon_env/porymap/data/maps"
    )
    assert MapNames.load(root).name((25, 40)) == "INSIDE OF TRUCK"


@pytest.mark.parametrize("locked", [False, True])
def test_field_controls_lock_comes_from_script_flag(locked: bool) -> None:
    memory = game(OVERWORLD)
    memory.put(0x03000F2C, bytes([int(locked)]))
    assert read_game_state(memory.read, MAPS).field_controls_locked is locked


def test_field_controls_not_claimed_before_overworld() -> None:
    memory = game(NAMING)
    memory.put(0x03000F2C, b"\x01")
    assert read_game_state(memory.read, MAPS).field_controls_locked is None


def test_live_player_coordinates_override_stale_save_coordinates():
    m = game(OVERWORLD)
    m.put(SB1, struct.pack("<hh", 100, 100))
    m.put(0x02037350 + 0x10, struct.pack("<hh", 10, 11))
    assert read_game_state(m.read, MAPS).position == (3, 4)


@pytest.mark.parametrize(
    "address,body", [(0x02037595, b"\x10"), (0x02037350, b"\0"), (0x02037352, b"\0")]
)
def test_invalid_player_object_is_unavailable(address, body):
    m = game(OVERWORLD)
    if address == 0x02037595:
        # Populate the invalid slot with plausible flags so the slot-bound arm
        # cannot be shadowed by an inactive-object check if its bound is wrong.
        m.put(0x02037350 + 16 * 0x24, b"\x01\x00\x01")
    m.put(address, body)
    state = read_game_state(m.read, MAPS)
    assert not state.started and state.position is None and state.facing is None


def test_unknown_pregame_callback_does_not_expose_default_save_data() -> None:
    m = game((0, 0x0803CAFE))
    m.put(0x02037350, bytes(3))
    s = read_game_state(m.read, MAPS)
    assert not s.started and s.name is None and s.location is None
    m.put(0x02037590 + 5, b"\xff")
    assert not read_game_state(m.read, MAPS).started


def test_dialog_and_menu_come_from_the_ui_reader() -> None:
    from pokebench_env.ui_state import STRING_VAR4, WINDOWS

    memory = Memory()
    memory.put(0x030022C0 + 4, struct.pack("<I", BIRCH_SPEECH))
    memory.put(0x03005E00, struct.pack("<IB", 0x080308B1, 1))
    memory.put(STRING_VAR4, text("Hi") + b"\xff")
    memory.put(WINDOWS, struct.pack("<BBBBBBHI", 0, 2, 15, 27, 4, 15, 1, 0x02002000))
    memory.put(0x02002000, b"\x11\x1f")
    state = read_game_state(memory.read, MapNames({}))
    assert state.dialog == "Hi"
    assert state.menu is None


def test_real_state_reader_propagates_owned_confirmation_without_save_defaults() -> None:
    from pokebench_env.game_screen import TASKS
    from pokebench_env.readout import format_readout, state_json
    from pokebench_env.ui_state import MENU, WINDOWS

    memory = game((0, BIRCH_SPEECH))
    memory.put(TASKS, struct.pack("<IB", 0x08031189, 1))
    memory.put(MENU + 2, struct.pack("<bbbB", 1, 0, 1, 1))
    pixels = 0x02004000
    memory.put(WINDOWS + 12, struct.pack("<BBBBBBHI", 0, 22, 1, 6, 4, 15, 0x139, pixels))
    memory.put(pixels, b"\x11" * 767 + b"\x12")
    result = read_game_state(memory.read, MAPS)
    assert result.screen == "birch_speech" and not result.started and result.name is None
    assert result.active_ui.selected == "NO" and result.active_ui.ready
    assert state_json(result)["active_ui"]["selected"] == "NO"
    assert "Menu: name_confirmation; selected NO" in format_readout(result)
    assert result.story.name_confirmed is False
