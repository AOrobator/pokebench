import struct

import pytest

from pokebench_env import battle_choices as b
from pokebench_env.gba_text import GBA_TEXT


# Independent fixture layout from the pinned US ROM proof, not reader constants.
class Memory:
    def __init__(self, count=2):
        self.data = {}
        self.struct = 0x02030000
        self.count = count
        self.set(0x030026F9, 2, 1)
        self.set(0x03005D04, 0x0803BE75)
        self.set(0x0202406C, count, 1)
        self.set(0x0202449C, self.struct)
        self.put(0x02024076, bytes(range(count)))
        self.phase(3)
        for i in range(count):
            self.set(0x0202406E + 2 * i, i, 2)
            mon = bytearray(0x58)
            struct.pack_into("<H", mon, 0, 25 if not i & 1 else 74)
            struct.pack_into("<H", mon, 0xC, 55)
            mon[0x24] = 25
            struct.pack_into("<H", mon, 0x28, 20)
            mon[0x2A] = 10
            struct.pack_into("<H", mon, 0x2C, 30)
            struct.pack_into("<I", mon, 0x48, 123 + i)
            struct.pack_into("<I", mon, 0x54, 456)
            self.put(0x02024084 + i * 0x58, mon)
            self.set(0x02024274 + 2 * i, 55, 2)
            self.set(self.struct + 0xC + i, 1, 1)
            self.set(self.struct + 0x5C + i, 2, 1)
        self.text(0x083185C8 + 25 * 11, "PIKACHU", 11)
        self.text(0x083185C8 + 74 * 11, "GEODUDE", 11)
        self.text(0x0831977C + 55 * 13, "WATER GUN", 13)

    def put(self, addr, value):
        self.data.update({addr + i: v for i, v in enumerate(value)})

    def set(self, addr, value, size=4):
        self.put(addr, value.to_bytes(size, "little"))

    def text(self, addr, value, size):
        inv = {v: k for k, v in GBA_TEXT.items()}
        self.put(addr, bytes(inv[c] for c in value) + b"\xff" + bytes(size - len(value) - 1))

    def phase(self, value):
        self.put(0x02024332, bytes([value] * self.count))

    def read(self, addr, size):
        return bytes(self.data.get(addr + i, 0) for i in range(size))

    def choose(self, journal):
        self.set(0x03005D04, 0x0803BE75)
        self.phase(3)
        journal.advance(self.read)
        self.phase(4)
        journal.advance(self.read)
        self.phase(5)
        journal.advance(self.read)
        self.set(0x03005D04, 0x0803D2E9)
        journal.advance(self.read)


def test_repeated_same_move_turns_have_exact_frame_receipts_and_ack_only_prunes_later():
    m = Memory()
    j = b.BattleJournal(clock=lambda: 1234.5)
    m.choose(j)
    j.advance(m.read)
    first = j.snapshot(0)
    assert first["entries"][0]["move"] == {"id": 55, "name": "WATER GUN", "slot": 0, "pp": 25}
    assert first["entries"][0]["target"]["species"] == "GEODUDE"
    assert first["entries"][0]["origin"] == "selected"
    assert first["entries"][0]["frame"] == 4
    assert first["entries"][0]["recorded_ms"] == 1234500
    assert len(j.snapshot(0)["entries"]) == 1
    m.set(b.RESULTS + 0x13, 1, 1)
    m.choose(j)
    assert [e["id"] for e in j.snapshot(0)["entries"]] == [1, 2]
    assert [e["battle_turn"] for e in j.snapshot(0)["entries"]] == [1, 2]
    assert len(j.snapshot(1)["entries"]) == 1
    assert j.snapshot(2)["entries"] == []
    for invalid in [1, 3]:
        with pytest.raises(ValueError, match="cursor"):
            j.snapshot(invalid)


def test_cursor_movement_cancel_and_partial_double_choices_do_not_commit():
    m = Memory(4)
    j = b.BattleJournal()
    m.phase(2)
    j.advance(m.read)
    assert j.snapshot(0)["entries"] == []
    m.phase(3)
    j.advance(m.read)
    m.phase(4)
    j.advance(m.read)
    m.phase(1)
    j.advance(m.read)  # cancel/reselect first partner
    m.choose(j)
    entries = j.snapshot(0)["entries"]
    assert len(entries) == 2
    assert [e["actor"]["position"] for e in entries] == [0, 2]
    assert all(e["origin"] == "selected" for e in entries)


@pytest.mark.parametrize(
    "action,field,value",
    [(1, "item_id", 13), (2, "switch_party_slot", 2), (3, "action", "run"), (7, "action", "other")],
)
def test_other_confirmed_actions_are_distinct(action, field, value):
    m = Memory()
    m.set(b.ACTIONS, action, 1)
    m.set(b.BUFFER_B + 1, 13, 2)
    j = b.BattleJournal()
    m.choose(j)
    e = j.snapshot(0)["entries"][0]
    assert e[field] == value
    assert e["move"] is None


def test_automatic_and_tutorial_are_not_fabricated_operator_move_selections():
    m = Memory()
    j = b.BattleJournal()
    m.set(b.MAIN_FUNC, b.COMMIT_ACTION)
    m.phase(5)
    j.advance(m.read)
    assert j.snapshot(0)["entries"][0]["origin"] == "automatic"
    assert j.snapshot(0)["entries"][0]["move"] is None
    m.set(b.IN_BATTLE, 0, 1)
    j.advance(m.read)
    m.set(b.IN_BATTLE, 2, 1)
    m.set(b.TYPE_FLAGS, 1 << 9)
    m.choose(j)
    assert j.snapshot(0)["entries"][1]["origin"] == "scripted"
    assert j.snapshot(0)["entries"][1]["battle"] == 2


@pytest.mark.parametrize(
    "address,value,size,message",
    [
        (b.COUNT, 3, 1, "count"),
        (b.POSITIONS, 7, 1, "positions"),
        (b.BATTLE_STRUCT, 0, 4, "pointer"),
        (b.BATTLE_STRUCT, 0x02030001, 4, "pointer"),
        (b.CHOSEN_MOVES, 0, 2, "move"),
        (0x02030080, 4, 1, "move"),
        (0x0203000C, 3, 1, "move"),
        (b.CHOSEN_MOVES, 56, 2, "match"),
        (b.MONS, 0, 2, "battler"),
        (b.MONS + 0x2A, 101, 1, "battler"),
        (b.MONS + 0x28, 31, 2, "battler"),
        (b.PARTY_INDEXES, 6, 2, "battler"),
        (b.BUFFER_B + 1, 0, 2, "item"),
        (0x0203005C, 6, 1, "switch"),
    ],
)
def test_invalid_owners_values_fail_explicitly(address, value, size, message):
    m = Memory()
    j = b.BattleJournal()
    if "item" in message:
        m.set(b.ACTIONS, 1, 1)
    if "switch" in message:
        m.set(b.ACTIONS, 2, 1)
    m.set(address, value, size)
    m.choose(j)
    with pytest.raises(ValueError, match=message):
        j.snapshot(0)
    j.advance(m.read)  # sticky failure, not a plausible empty log


def test_unknown_program_and_short_reads_and_overflow():
    m = Memory()
    j = b.BattleJournal()
    m.set(b.MAIN_FUNC, 0x08038421)
    j.advance(m.read)
    assert j.snapshot(0)["entries"] == []
    j.advance(lambda a, n: b"")
    with pytest.raises(ValueError, match="short"):
        j.snapshot(0)
    j = b.BattleJournal(capacity=0)
    m.choose(j)
    with pytest.raises(ValueError, match="full"):
        j.snapshot(0)
    j = b.BattleJournal()
    m.set(b.MAIN_FUNC, b.COMMIT_ACTION)
    m.phase(4)
    j.advance(m.read)
    with pytest.raises(ValueError, match="confirmed"):
        j.snapshot(0)


@pytest.mark.parametrize(
    "action,label",
    [(5, "safari_ball"), (6, "safari_pokeblock"), (7, "safari_go_near"), (8, "safari_run")],
)
def test_safari_choice_records_trainer_actor_and_native_action(action, label):
    m = Memory()
    m.set(b.TYPE_FLAGS, 0x80)
    m.put(b.MONS, bytes(0x58))
    m.set(b.ACTIONS, action, 1)
    m.put(b.BUFFER_B + 1, bytes([2, 0]))
    j = b.BattleJournal()
    m.choose(j)
    assert j.error is None
    e = j.snapshot(0)["entries"][0]
    assert e["actor"] == {"kind": "trainer", "battler": 0, "position": 0}
    assert e["action"] == label and e["origin"] == "selected"
    assert e["move"] is None and e["item_id"] is None
    if action == 6:
        assert e["safari_pokeblock"] == {"preference_code": 2, "color": 0}


def test_safari_invalid_trainer_bank_is_explicit_error():
    m = Memory()
    m.set(b.TYPE_FLAGS, 0x80)
    m.set(b.ACTIONS, 5, 1)
    j = b.BattleJournal()
    m.choose(j)
    assert "Safari trainer" in j.error


@pytest.mark.parametrize("controller,origin", [(0x08057505, "selected"), (0x081BB145, "remote")])
def test_selected_link_actor_provenance_uses_actual_controller(controller, origin):
    m = Memory()
    m.set(b.TYPE_FLAGS, 2)
    m.set(0x03005D60, controller)
    j = b.BattleJournal()
    m.choose(j)
    assert j.error is None
    assert j.snapshot(0)["entries"][0]["origin"] == origin


def test_recorded_battle_choices_are_scripted_even_when_confirmed():
    m = Memory()
    m.set(b.TYPE_FLAGS, 1 << 24)
    j = b.BattleJournal()
    m.choose(j)
    assert j.snapshot(0)["entries"][0]["origin"] == "scripted"


@pytest.mark.parametrize(
    "scenario,message",
    [
        ("safari_action", "trainer action"),
        ("safari_block", "Pokeblock"),
        ("link_controller", "link battle controller"),
    ],
)
def test_invalid_committed_variant_receipts_remain_journal_errors(scenario, message):
    m = Memory()
    if scenario.startswith("safari"):
        m.set(b.TYPE_FLAGS, 0x80)
        m.put(b.MONS, bytes(0x58))
        m.set(b.ACTIONS, 0 if scenario == "safari_action" else 6, 1)
        m.put(b.BUFFER_B + 1, bytes([0, 15]))
    else:
        m.set(b.TYPE_FLAGS, 2)
        m.set(0x03005D60, 0x08057504)
    journal = b.BattleJournal()
    m.choose(journal)
    assert message in journal.error
    with pytest.raises(ValueError, match=message):
        journal.snapshot(0)
