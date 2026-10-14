import struct

import pytest
from test_game_state import Memory, text

from pokebench_env.battle_choices import (
    COMMUNICATION,
    COUNT,
    IN_BATTLE,
    MAIN_FUNC,
    MONS,
    PARTY_INDEXES,
    POSITIONS,
    RESULTS,
)
from pokebench_env.battle_state import (
    ACTION_CURSOR,
    ATTACKER,
    BATTLE_MOVES,
    BUFFER_A,
    CONTROLLERS,
    CURRENT_MOVE,
    EXEC_FLAGS,
    MOVE_CURSOR,
    OUTCOME,
    SCRIPT_PC,
    TARGET,
    read_battle_state,
)
from pokebench_env.pokemon import MOVE_NAMES, SPECIES_NAMES


def fixture(double=False):
    m = Memory()
    m.put(IN_BATTLE, b"\x02")
    m.put(MAIN_FUNC, struct.pack("<I", 0x0803BE75))
    count = 4 if double else 2
    m.put(COUNT, bytes([count]))
    m.put(POSITIONS, bytes(range(count)))
    m.put(EXEC_FLAGS, struct.pack("<I", 1))
    m.put(CONTROLLERS, struct.pack("<4I", 0x08057589, 0x0805F001, 0x08057589, 0x0805F001))
    m.put(COMMUNICATION, bytes([1, 5, 1, 5]))
    m.put(RESULTS + 0x13, b"\x03")
    for index in range(count):
        mon = bytearray(0x58)
        struct.pack_into("<6H", mon, 0, 280 if index % 2 == 0 else 288, 10, 8, 9, 10, 7)
        struct.pack_into("<4H", mon, 0x0C, 10, 45, 0, 0)
        mon[0x18:0x20] = bytes([6] * 8)
        mon[0x20:0x23] = bytes([66, 10 if index % 2 == 0 else 0, 10 if index % 2 == 0 else 0])
        mon[0x24:0x28] = bytes([35, 40, 0, 0])
        struct.pack_into("<HBBHH", mon, 0x28, 18, 5, 70, 20, 0)
        struct.pack_into("<I", mon, 0x48, 0x12345678 + index)
        struct.pack_into("<II", mon, 0x4C, 0x40, 0x80)
        struct.pack_into("<I", mon, 0x54, 0xABCDEF12)
        m.put(MONS + index * 0x58, mon)
        m.put(PARTY_INDEXES + index * 2, struct.pack("<H", index))
        m.put(BUFFER_A + index * 0x200, b"\x12")
    for species, name in [(280, "TORCHIC"), (288, "ZIGZAGOON")]:
        m.put(SPECIES_NAMES + species * 11, text(name) + b"\xff")
    for move, name, pp in [(10, "SCRATCH", 35), (45, "GROWL", 40)]:
        m.put(MOVE_NAMES + move * 13, text(name) + b"\xff")
        m.put(BATTLE_MOVES + move * 12, bytes([0, 40, 0, 100, pp]) + bytes(7))
    m.put(SCRIPT_PC, struct.pack("<I", 0x082D9000))
    return m


def test_continuous_battle_battlers_pp_status_stages_and_inputs():
    m = fixture()
    state = read_battle_state(m.read)
    assert state.initialized is True and state.active is True
    assert state.phase == "input" and state.ready is True
    assert state.turn == 4 and state.outcome == "ongoing"
    mon = state.battlers[0]
    assert (mon.species, mon.hp, mon.max_hp, mon.level) == ("TORCHIC", 18, 20, 5)
    assert mon.identity == "12345678:abcdef12"
    assert (mon.status1, mon.status2, mon.stat_stages) == (0x40, 0x80, (6,) * 8)
    assert [(move.name, move.pp, move.max_pp) for move in mon.moves] == [
        ("SCRATCH", 35, 35),
        ("GROWL", 40, 40),
        (None, 0, 0),
        (None, 0, 0),
    ]
    assert state.player_inputs[0].selected == "FIGHT"
    m.put(ACTION_CURSOR, b"\x03")
    assert read_battle_state(m.read).player_inputs[0].selected == "RUN"
    m.put(EXEC_FLAGS, bytes(4))
    assert read_battle_state(m.read).ready is False


def test_double_battle_positions_and_player_owners_separate():
    m = fixture(double=True)
    m.put(EXEC_FLAGS, struct.pack("<I", 5))
    state = read_battle_state(m.read)
    assert len(state.battlers) == 4
    assert [item.battler for item in state.player_inputs] == [0, 2]
    assert [item.party_slot for item in state.battlers] == [0, 1, 2, 3]


@pytest.mark.parametrize("fn,phase", [(0x08057BFD, "move"), (0x08058139, "move_reorder")])
def test_live_move_menu_uses_native_display_payload(fn, phase):
    m = fixture()
    m.put(CONTROLLERS, struct.pack("<I", fn))
    m.put(MOVE_CURSOR, b"\x01")
    packet = bytearray(32)
    packet[0] = 20
    struct.pack_into("<4H", packet, 4, 10, 45, 0, 0)
    packet[12:16] = bytes([35, 39, 0, 0])
    packet[16:20] = bytes([35, 40, 0, 0])
    m.put(BUFFER_A, packet)
    state = read_battle_state(m.read)
    control = state.player_inputs[0]
    assert (control.phase, control.selected, control.displayed_pp, control.displayed_max_pp) == (
        phase,
        "GROWL",
        39,
        40,
    )
    assert control.selected_move_id == 45
    assert state.current_execution is None


def test_target_menu_cursor_names_actual_battler():
    m = fixture()
    m.put(CONTROLLERS, struct.pack("<I", 0x08057825))
    m.put(0x03005D74, b"\x01")
    assert read_battle_state(m.read).player_inputs[0].selected == "ZIGZAGOON"


def test_native_move_announcement_is_not_a_selected_choice_or_hit():
    m = fixture()
    m.put(MAIN_FUNC, struct.pack("<I", 0x0803E019))
    m.put(CURRENT_MOVE, struct.pack("<H", 10))
    m.put(ATTACKER, b"\x00")
    m.put(TARGET, b"\x01")
    packet = bytearray(32)
    packet[0] = 16
    struct.pack_into("<3H", packet, 2, 4, 10, 10)
    m.put(BUFFER_A, packet)
    state = read_battle_state(m.read)
    assert state.signals[0].kind == "move_announced"
    assert state.signals[0].move_id == 10
    assert state.current_execution.phase == "move_announced"
    assert state.current_execution.attacker == 0 and state.current_execution.target == 1
    m.put(EXEC_FLAGS, bytes(4))
    assert read_battle_state(m.read).signals == ()
    assert read_battle_state(m.read).current_execution.phase == "script_resolution"


@pytest.mark.parametrize(
    "request_id,value,kind", [(42, 11, "hp_updated"), (40, 0x40, "status_updated")]
)
def test_controller_commit_receipts_distinguish_hp_and_status(request_id, value, kind):
    m = fixture()
    m.put(CONTROLLERS, struct.pack("<I", 0x08057505))
    m.put(BUFFER_A, bytes([2, request_id, 0]) + struct.pack("<I", value) + bytes(25))
    state = read_battle_state(m.read)
    assert state.signals[0].kind == kind
    assert (state.signals[0].hp if request_id == 42 else state.signals[0].status) == value
    assert state.current_execution is None


@pytest.mark.parametrize(
    "code,name", [(1, "won"), (2, "lost"), (3, "drew"), (4, "ran"), (7, "caught"), (0x81, "won")]
)
def test_game_owned_outcome_is_recorded_separately(code, name):
    m = fixture()
    m.put(OUTCOME, bytes([code]))
    state = read_battle_state(m.read)
    assert state.phase == "finishing"
    assert state.outcome == name and state.outcome_code == code
    m.put(IN_BATTLE, b"\x00")
    assert read_battle_state(m.read).outcome is None


@pytest.mark.parametrize(
    "field",
    ["species", "hp", "stage", "type", "ability", "move", "cursor", "outcome", "controller"],
)
def test_bad_native_data_is_explicit_harness_bug_not_plausible_species(field):
    m = fixture()
    if field == "species":
        m.put(MONS, struct.pack("<H", 999))
    elif field == "hp":
        m.put(MONS + 0x28, struct.pack("<H", 21))
    elif field == "stage":
        m.put(MONS + 0x18, b"\x0d")
    elif field == "type":
        m.put(MONS + 0x21, b"\x12")
    elif field == "ability":
        m.put(MONS + 0x20, b"\x4e")
    elif field == "move":
        m.put(MONS + 0x0C, struct.pack("<H", 999))
    elif field == "cursor":
        m.put(ACTION_CURSOR, b"\x04")
    elif field == "outcome":
        m.put(OUTCOME, b"\x0b")
    else:
        m.put(CONTROLLERS, bytes(4))
    state = read_battle_state(m.read)
    assert state.phase == "unavailable" and state.battlers is None
    assert state.diagnostic.startswith("harness bug:")
    assert len(state.raw_hex) <= 4096


def test_init_and_unknown_reads_do_not_decode_empty_species_as_pokemon():
    m = fixture()
    m.put(COUNT, b"\x00")
    state = read_battle_state(m.read)
    assert state.phase == "initializing" and state.diagnostic is None
    m.put(COUNT, b"\x02")
    m.put(MAIN_FUNC, struct.pack("<I", 0x0803AC85))
    m.put(MONS, bytes(0x58 * 2))
    assert read_battle_state(m.read).phase == "initializing"
    m.put(MAIN_FUNC, struct.pack("<I", 0x0803BE75))
    assert read_battle_state(m.read).diagnostic is not None

    def short(address, length):
        return m.read(address, length) if address == IN_BATTLE else bytes(max(0, length - 1))

    assert read_battle_state(short).diagnostic is not None


def test_party_hp_receipt_does_not_claim_active_battler_hp():
    m = fixture()
    m.put(BUFFER_A, bytes([2, 42, 4]) + struct.pack("<H", 17) + bytes(27))
    s = read_battle_state(m.read)
    assert s.signals[0].kind == "party_hp_updated"
    assert s.signals[0].party_mask == 4


def test_consumed_packet_is_not_reemitted_as_new_execution():
    m = fixture()
    m.put(EXEC_FLAGS, bytes(4))
    m.put(BUFFER_A, bytes([2, 42, 0]) + struct.pack("<H", 17) + bytes(27))
    s = read_battle_state(m.read)
    assert not s.signals
    assert not s.ready


@pytest.mark.parametrize(
    "cursor,label", [(0, "SAFARI BALL"), (1, "POKEBLOCK"), (2, "GO NEAR"), (3, "RUN")]
)
def test_safari_trainer_bank_is_not_fabricated_as_a_pokemon(cursor, label):
    from pokebench_env.battle_choices import TYPE_FLAGS

    m = fixture()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x80))
    m.put(MONS, bytes(0x58))
    m.put(CONTROLLERS, struct.pack("<I", 0x081593D9))
    m.put(ACTION_CURSOR, bytes([cursor]))
    s = read_battle_state(m.read)
    assert s.diagnostic is None and s.ready
    assert s.non_pokemon_battlers == (0,)
    assert len(s.battlers) == 1 and s.battlers[0].battler == 1
    assert s.player_inputs[0].phase == "safari_action"
    assert s.player_inputs[0].selected == label


def test_safari_nonzero_trainer_pokemon_data_is_not_silently_skipped():
    from pokebench_env.battle_choices import TYPE_FLAGS

    m = fixture()
    m.put(TYPE_FLAGS, struct.pack("<I", 0x80))
    s = read_battle_state(m.read)
    assert "Safari trainer bank" in s.diagnostic


@pytest.mark.parametrize("cursor,label", [(0, "YES"), (1, "NO")])
def test_game_owned_battle_yes_no_controller(cursor, label):
    from pokebench_env.battle_state import MULTI_CURSOR

    m = fixture()
    m.put(CONTROLLERS, struct.pack("<I", 0x080599D5))
    m.put(MULTI_CURSOR, bytes([cursor]))
    s = read_battle_state(m.read)
    assert s.diagnostic is None and s.ready
    assert s.player_inputs[0].phase == "yes_no"
    assert s.player_inputs[0].selected == label


@pytest.mark.parametrize(
    "finished,callback,ready",
    [(0, 0x08038421, True), (1, 0x08038421, False), (0, 0x081AAD5D, False)],
)
def test_replay_b_stop_is_owned_by_battle_callback_only(finished, callback, ready):
    from pokebench_env.battle_choices import TYPE_FLAGS
    from pokebench_env.game_screen import GMAIN

    m = fixture()
    m.put(TYPE_FLAGS, struct.pack("<I", 1 << 24))
    m.put(GMAIN + 4, struct.pack("<I", callback))
    m.put(0x0203CCD0, bytes([finished]))
    m.put(EXEC_FLAGS, bytes(4))
    s = read_battle_state(m.read)
    assert s.phase == "replay" and s.ready is ready
    assert s.playback.stoppable is ready


@pytest.mark.parametrize(
    "address,body,message",
    [
        (MONS + 0x26, b"\x01", "empty battle move"),
        (BATTLE_MOVES + 10 * 12 + 4, b"\x00", "move table"),
        (COUNT, b"\x03", "battle count"),
        (POSITIONS, b"\x00\x00", "positions"),
        (OUTCOME, b"\x7f", "outcome"),
    ],
)
def test_impossible_native_battle_payloads_are_diagnostics(address, body, message):
    m = fixture()
    m.put(address, body)
    s = read_battle_state(m.read)
    assert s.ready is None and message in s.diagnostic


def test_safari_double_battle_is_rejected_before_trainer_decode():
    from pokebench_env.battle_choices import TYPE_FLAGS

    m = fixture(double=True)
    m.put(TYPE_FLAGS, struct.pack("<I", 0x80))
    assert "Safari battler count" in read_battle_state(m.read).diagnostic


@pytest.mark.parametrize(
    "controller,offset,body,message",
    [
        (0x08057BFD, MOVE_CURSOR, b"\x04", "move cursor"),
        (0x08057BFD, BUFFER_A + 4, bytes(2), "displayed battle move"),
        (0x08057BFD, BUFFER_A + 16, b"\x00", "name/PP"),
        (0x08058139, 0x03005D74, b"\x04", "reorder cursor"),
        (0x080599D5, 0x03005D74, b"\x02", "yes/no cursor"),
        (0x08057825, 0x03005D74, b"\x02", "target cursor"),
    ],
)
def test_native_input_cursor_and_display_corruption_is_not_a_selection(
    controller, offset, body, message
):
    m = fixture()
    m.put(CONTROLLERS, struct.pack("<I", controller))
    packet = bytearray(32)
    struct.pack_into("<H", packet, 4, 10)
    packet[12] = packet[16] = 35
    m.put(BUFFER_A, packet)
    m.put(offset, body)
    s = read_battle_state(m.read)
    assert s.ready is None and message in s.diagnostic


def test_script_resolution_can_exist_without_a_pending_move_announcement():
    from pokebench_env.battle_state import SCRIPT_OWNERS

    m = fixture()
    m.put(MAIN_FUNC, struct.pack("<I", min(SCRIPT_OWNERS)))
    m.put(EXEC_FLAGS, bytes(4))
    state = read_battle_state(m.read)
    assert state.current_execution.phase == "script_resolution"
    assert state.signals == () and not state.ready


def test_corrupt_recorded_playback_completion_is_explicit():
    from pokebench_env.battle_choices import TYPE_FLAGS

    m = fixture()
    m.put(TYPE_FLAGS, struct.pack("<I", 1 << 24))
    m.put(0x0203CCD0, b"\x02")
    assert "playback state" in read_battle_state(m.read).diagnostic


@pytest.mark.parametrize(
    "address,body",
    [
        (ATTACKER, b"\x02"),
        (TARGET, b"\x02"),
        (CURRENT_MOVE, struct.pack("<H", 355)),
        (SCRIPT_PC, bytes(4)),
    ],
)
def test_invalid_execution_owner_fields_cannot_be_recorded_as_a_move(address, body):
    from pokebench_env.battle_state import SCRIPT_OWNERS

    m = fixture()
    m.put(MAIN_FUNC, struct.pack("<I", min(SCRIPT_OWNERS)))
    m.put(address, body)
    state = read_battle_state(m.read)
    assert state.current_execution is None and state.ready is None
    assert "script execution fields" in state.diagnostic
