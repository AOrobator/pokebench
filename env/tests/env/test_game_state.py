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
from pokebench_env.party_ownership import PartyOwnership
from pokebench_env.pokemon import PokemonMove
from pokebench_env.resources import BAG_POCKETS, BerryTree, PokemonStorage, Resources
from pokebench_env.running import read_running_permission
from pokebench_env.story import INITIAL_TRAINER_FLAGS, StoryState

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
    header = bytearray(struct.pack("<II", personality, ot_id) + bytes(0x18))
    header[0x13] = 2
    struct.pack_into("<H", header, 0x1C, sum(struct.unpack("<24H", plain)) & 0xFFFF)
    body = bytes(header) + secure
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
    m.put(SB1 + 0x159C, struct.pack("<64I", *([0x1234] * 64)))
    m.put(SB1 + 0x490, struct.pack("<I", 3000 ^ 0x1234))
    for _, offset, count in BAG_POCKETS:
        m.put(SB1 + offset, struct.pack("<HH", 0, 0x1234) * count)
    m.put(0x03005D94, struct.pack("<I", 0x02010000))
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
    memory = game(OVERWORLD, party, badges=0b101)
    state = read_game_state(memory.read, MAPS)
    assert state == GameState(
        screen="overworld",
        story=StoryState(
            **{field: False for field in INITIAL_TRAINER_FLAGS},
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
            rustboro_josh_defeated=False,
            rustboro_tommy_defeated=False,
            rustboro_marc_defeated=False,
        ),
        running=read_running_permission(memory.read),
        party_ownership=PartyOwnership("player", "ordinary_player_party"),
        resources=Resources(
            daycare=(),
            bag=(),
            pc_items=(),
            storage=PokemonStorage(0, ()),
            berry_trees=tuple(
                BerryTree(i, 0, None, 0, False, 0, 0, 0, (False, False, False, False))
                for i in range(128)
            ),
            planted_berries=0,
            script_pc=0,
            script_mode=0,
            script_status=0,
        ),
        started=True,
        name="MAY",
        location="LITTLEROOT TOWN",
        map_id=(0, 9),
        position=(7, 9),
        facing="right",
        in_battle=False,
        party=(
            PartyMon(
                "TORCHIC",
                5,
                18,
                20,
                "12345671:cafebabe",
                280,
                0x12345671,
                0xCAFEBABE,
                False,
                0,
                0,
                0,
                (PokemonMove(0, 0, 0, None, 0),) * 4,
                "encrypted",
            ),
        ),
        money=3000,
        badges=("STONE", "DYNAMO"),
        play_time=(1, 2, 3),
        field_controls_locked=False,
        blackout_active=False,
        game_stats={
            "saved_game": 0,
            "pokemon_captures": 0,
            "evolved_pokemon": 0,
            "used_pokecenter": 0,
        },
    )


@pytest.mark.parametrize("personality", range(24))
def test_every_substructure_order_decrypts(personality: int) -> None:
    party = [mon(286, 3, 9, 12, personality=personality + 24 * 7, ot_id=0x0BADF00D)]
    state = read_game_state(game(OVERWORLD, party).read, MAPS)
    assert state.party == (
        PartyMon(
            "POOCHYENA",
            3,
            9,
            12,
            f"{personality + 24 * 7:08x}:0badf00d",
            286,
            personality + 24 * 7,
            0x0BADF00D,
            False,
            0,
            0,
            0,
            (PokemonMove(0, 0, 0, None, 0),) * 4,
            "encrypted",
        ),
    )


def test_before_the_game_starts_no_save_field_is_reported() -> None:
    from pokebench_env.ui_state import ActiveUi

    state = read_game_state(game(NAMING).read, MAPS)
    assert state == GameState(
        blackout_active=False,
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


def test_an_invalid_species_is_a_diagnostic_harness_bug() -> None:
    party = [mon(999, 5, 1, 1, personality=1, ot_id=2)]
    result = read_game_state(game(OVERWORLD, party).read, MAPS).party[0]
    assert result.species is None
    assert result.diagnostic == "harness bug: Pokémon species out of range: 999"
    assert result.raw_hex == party[0].hex()


def test_a_party_count_above_six_is_an_error() -> None:
    m = game(OVERWORLD)
    m.put(0x020244E9, bytes([7]))
    with pytest.raises(ValueError, match="party count 7"):
        read_game_state(m.read, MAPS)


def test_decode_text_stops_at_the_terminator_and_marks_unknown_bytes() -> None:
    assert decode_text(text("MR. MIME") + b"\xff" + text("X")) == "MR. MIME"
    assert decode_text(bytes([0x01])) == "À"


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


def test_active_ui_reader_ablation_withholds_phase_selection_and_diagnostic() -> None:
    from pokebench_env.readout import format_readout, state_json

    state = read_game_state(game(NAMING).read, MAPS, active_ui_enabled=False)
    assert state.active_ui is None and state_json(state)["active_ui"] is None
    assert "STATE COVERAGE ERROR" not in format_readout(
        state
    ) and "Interface:" not in format_readout(state)
    assert state.screen == "naming" and state.name is None


@pytest.mark.parametrize("key", [0, 0x12345678, 0xFFFFFFFF])
def test_game_stats_xor_key_exact_indices_and_json(key: int) -> None:
    from pokebench_env.game_state import GAME_STAT_FIELDS
    from pokebench_env.readout import state_json

    m = game(OVERWORLD)
    m.put(SB2 + 0xAC, struct.pack("<I", key))
    values = {"saved_game": 3, "pokemon_captures": 7, "evolved_pokemon": 2, "used_pokecenter": 11}
    m.put(SB1 + 0x159C, struct.pack("<64I", *([99 ^ key] * 64)))
    for field, index in GAME_STAT_FIELDS.items():
        m.put(SB1 + 0x159C + 4 * index, struct.pack("<I", values[field] ^ key))
    assert state_json(read_game_state(m.read, MAPS))["game_stats"] == values


def test_game_stats_invalid_decoded_counter_and_short_read_are_unknown_or_error() -> None:
    from pokebench_env.game_state import _game_stats

    m = game(OVERWORLD)
    m.put(SB1 + 0x159C + 4 * 11, struct.pack("<I", 0x1000000 ^ 0x1234))
    assert read_game_state(m.read, MAPS).game_stats["pokemon_captures"] is None
    assert read_game_state(game(NAMING).read, MAPS).game_stats is None
    with pytest.raises(ValueError, match="short game-stat read"):
        _game_stats(lambda _a, _n: b"", SB1, SB2)


def test_party_identity_survives_reordering_level_and_species_changes() -> None:
    from pokebench_env.readout import state_json

    a = mon(280, 5, 18, 20, personality=10, ot_id=20)
    b = mon(286, 3, 9, 12, personality=11, ot_id=20)
    before = state_json(read_game_state(game(OVERWORLD, [a, b]).read, MAPS))["party"]
    after = state_json(
        read_game_state(game(OVERWORLD, [b, mon(286, 6, 20, 21, 10, 20)]).read, MAPS)
    )["party"]
    assert before[0]["identity"] == after[1]["identity"] == "0000000a:00000014"
    assert before[1]["identity"] == after[0]["identity"] == "0000000b:00000014"
    assert before[0]["identity"] != before[1]["identity"]


@pytest.mark.parametrize(
    "callback,expected",
    [(0x08085F59, True), (0x08085F57, False), (0x08085F5B, False), (0x08085E5D, False)],
)
def test_blackout_exact_callback_owner_even_without_valid_save(callback, expected) -> None:
    from pokebench_env.readout import state_json

    m = game((0, callback))
    m.put(0x03005D8C, bytes(8))
    state = read_game_state(m.read, MAPS)
    assert state_json(state)["blackout_active"] is expected
    assert state.game_stats is None
