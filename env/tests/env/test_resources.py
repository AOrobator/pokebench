import struct

import pytest
from test_game_state import Memory, text
from test_pokemon import fixture

from pokebench_env.live_map import OBJECT_EVENTS
from pokebench_env.resources import (
    BAG_POCKETS,
    BERRY_TREE_COUNT,
    BERRY_TREE_SIZE,
    STORAGE_POINTER,
    STORAGE_SIZE,
    read_resources,
)

SB1, SB2, STORAGE = 0x02020000, 0x02025000, 0x02028000
KEY = 0xABCD2468


def memory():
    m = Memory()
    for item_id, name in [(13, "POTION"), (133, "CHERI BERRY")]:
        address = 0x085839A0 + item_id * 44
        m.put(address, text(name) + b"\xff")
        m.put(address + 14, struct.pack("<H", item_id))
    m.put(SB2 + 0xAC, struct.pack("<I", KEY))
    for _, offset, count in BAG_POCKETS:
        m.put(SB1 + offset, struct.pack("<HH", 0, KEY & 0xFFFF) * count)
    m.put(SB1 + 0x159C + 3 * 4, struct.pack("<I", KEY ^ 9))
    m.put(STORAGE_POINTER, struct.pack("<I", STORAGE))
    m.put(STORAGE, bytes(STORAGE_SIZE))
    return m


def test_bag_low_halfword_xor_and_pc_plain_quantities():
    m = memory()
    m.put(SB1 + 0x560, struct.pack("<HH", 13, 7 ^ (KEY & 0xFFFF)))
    m.put(SB1 + 0x790 + 4 * 2, struct.pack("<HH", 133, 12 ^ (KEY & 0xFFFF)))
    m.put(SB1 + 0x498, struct.pack("<HH", 13, 2))
    result = read_resources(m.read, SB1, SB2)
    assert [(i.pocket, i.slot, i.item_id, i.quantity) for i in result.bag] == [
        ("items", 0, 13, 7),
        ("berries", 2, 133, 12),
    ]
    assert [item.name for item in result.bag] == ["POTION", "CHERI BERRY"]
    assert result.pc_items[0].quantity == 2
    assert result.planted_berries == 9
    assert result.diagnostics == ()
    assert result.json()["bag"][0]["quantity"] == 7


def test_exact_rom_eight_byte_tree_stride_and_bitfield_layout():
    m = memory()
    m.put(SB1 + 0x169C + 8 * 7, struct.pack("<BBHBBxx", 2, 0x85, 1440, 3, 0xA4))
    result = read_resources(m.read, SB1, SB2)
    assert len(result.berry_trees) == BERRY_TREE_COUNT
    assert BERRY_TREE_SIZE == 8
    t = result.berry_trees[7]
    assert (
        t.berry,
        t.item_id,
        t.stage,
        t.stop_growth,
        t.minutes_until_next_stage,
        t.yield_count,
        t.regrowth_count,
        t.watered,
    ) == (2, 134, 5, True, 1440, 3, 4, (False, True, False, True))
    assert result.berry_trees[6].berry == result.berry_trees[8].berry == 0


def test_all_boxes_and_corrupt_occupied_slots_retained():
    m = memory()
    body, read = fixture()
    m.put(STORAGE, b"\x0d")
    m.put(STORAGE + 4 + 419 * 80, body[:80])
    m.put(STORAGE + 4 + 7 * 80, b"\x01" + bytes(79))

    def resource_read(a, n):
        return read(a, n) if a >= 0x08000000 else m.read(a, n)

    result = read_resources(resource_read, SB1, SB2)
    assert result.storage.current_box == 13
    assert [(p.box, p.slot) for p in result.storage.occupied] == [(0, 7), (13, 29)]
    assert result.storage.occupied[1].pokemon.species_id == 280
    assert result.storage.occupied[1].pokemon.hp is None
    assert result.storage.occupied[0].pokemon.diagnostic.startswith("harness bug:")
    assert result.diagnostics[0].owner == "storage:0:7"


@pytest.mark.parametrize("owner", ["bag", "pc_items", "berry_trees", "storage"])
def test_invalid_owner_remains_unknown_with_raw_bug_evidence(owner):
    m = memory()
    if owner == "bag":
        m.put(SB1 + 0x560, struct.pack("<HH", 999, 1 ^ (KEY & 0xFFFF)))
    elif owner == "pc_items":
        m.put(SB1 + 0x498, struct.pack("<HH", 13, 0))
    elif owner == "berry_trees":
        m.put(SB1 + 0x169C, b"\x2c\x05")
    else:
        m.put(STORAGE_POINTER, struct.pack("<I", STORAGE + 1))
    result = read_resources(m.read, SB1, SB2)
    assert getattr(result, owner) is None
    assert any(
        d.owner == owner and d.message.startswith("harness bug:") for d in result.diagnostics
    )


def test_short_reads_and_bad_save_pointers_are_explicit():
    result = read_resources(lambda a, n: bytes(max(0, n - 1)), SB1, SB2)
    assert result.bag is result.storage is result.berry_trees is result.pc_items is None
    assert result.diagnostics
    assert read_resources(memory().read, 0, SB2).diagnostics[0].owner == "save"


@pytest.mark.parametrize(
    "pc,owner", [(0x08274465, "harvest"), (0x082744D4, "water"), (0x082744EE, "plant")]
)
def test_native_committed_berry_script_owner_and_selected_tree(pc, owner):
    m = memory()
    context = bytearray(12)
    context[1] = 2
    struct.pack_into("<I", context, 8, pc)
    m.put(0x03000E40, context)
    m.put(0x03005DF0, b"\x03")
    obj = bytearray(0x24)
    obj[0] = 1
    obj[0x1D] = 7
    m.put(OBJECT_EVENTS + 3 * 0x24, obj)
    result = read_resources(m.read, SB1, SB2)
    assert result.berry_script_owner == owner
    assert result.selected_tree_id == 7
    # Stop/waiting context, canceled/full-pockets and unrelated scripts cannot prove a commit.
    for invalid_pc in [0, 0x08274448, 0x08274470, 0x082744C7, 0x082744DD]:
        struct.pack_into("<I", context, 8, invalid_pc)
        m.put(0x03000E40, context)
        assert read_resources(m.read, SB1, SB2).berry_script_owner is None
    m.put(0x03000E40, bytes(12))
    assert read_resources(m.read, SB1, SB2).selected_tree_id is None


def test_narrow_frame_snapshot_never_reads_or_claims_storage():
    m = memory()

    def guarded(address, length):
        assert address != STORAGE_POINTER
        assert not STORAGE <= address < STORAGE + STORAGE_SIZE
        return m.read(address, length)

    result = read_resources(guarded, SB1, SB2, include_storage=False)
    assert result.storage is None
    assert result.berry_trees is not None
    assert result.bag == ()
    assert result.diagnostics == ()


def test_daycare_pokemon_are_recorded_without_an_open_menu_and_invalid_slots_retained():
    from tests.env.test_daycare import SAVE, sample

    m = memory()
    native = sample()
    m.put(SB1 + 0x3030, native.read(SAVE + 0x3030, 280))
    for address, byte in native.cells.items():
        if address >= 0x08000000:
            m.put(address, bytes([byte]))
    result = read_resources(m.read, SB1, SB2)
    assert result.diagnostics == ()
    assert [
        (entry.slot, entry.pokemon.nickname, entry.displayed_level) for entry in result.daycare
    ] == [(0, "MARILL", 5), (1, "SHROOMISH", 5)]
    assert result.json()["daycare"][0]["pokemon"]["moves"][0]["name"] == "WATER GUN"
    m.put(SB1 + 0x3030 + 28, b"\x00\x00")
    result = read_resources(m.read, SB1, SB2)
    assert result.daycare[0].pokemon.diagnostic.startswith("harness bug:")
    assert result.daycare[0].displayed_level is None
    assert result.diagnostics[0].owner == "daycare:0"
    assert len(result.diagnostics[0].raw_hex) == 160
