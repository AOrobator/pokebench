import struct

import pytest
from test_live_map import Memory

from pokebench_env.map_layout import effective_dimensions, read_layout_context


def test_ordinary_dimensions_must_agree_with_live_backup_padding():
    assert effective_dimensions((15, 22), (30, 36), (0, 1), 1) == (15, 22)
    assert effective_dimensions((15, 22), (31, 36), (0, 1), 1) is None
    assert effective_dimensions((0, 22), (15, 36), (0, 1), 1) is None
    assert effective_dimensions((256, 256), (271, 270), (0, 1), 1) is None


def test_pyramid_is_qualified_by_map_header_layout_and_exact_generated_size():
    # GenerateBattlePyramidFloorLayout assembles four-by-four 8x8 squares.
    assert effective_dimensions((8, 8), (47, 46), (26, 26), 361) == (32, 32)
    for map_id, layout_id, declared, backup in [
        ((26, 25), 361, (8, 8), (47, 46)),
        ((26, 26), 362, (8, 8), (47, 46)),
        ((26, 26), 361, (16, 16), (47, 46)),
        ((26, 26), 361, (8, 8), (46, 46)),
        (None, 361, (8, 8), (47, 46)),
        ((26, 26), None, (8, 8), (47, 46)),
    ]:
        assert effective_dimensions(declared, backup, map_id, layout_id) is None


def test_trainer_hill_requires_no_generated_dimension_exception():
    for floor in range(4):
        assert effective_dimensions((16, 21), (31, 35), (26, 61 + floor), 415 + floor) == (
            16,
            21,
        )


def context_memory(layout_id: int = 164) -> Memory:
    m = Memory()
    m.put(0x03005D8C, struct.pack("<I", 0x02010000))
    m.put(0x02010004, bytes([24, 46]))
    m.put(0x02010030, bytes([3]))
    m.put(0x02010032, struct.pack("<H", layout_id))
    m.put(0x08481DD4, struct.pack("<4I", 0x083E0524, 0x083E1804, 0x083E1E64, 0x083E3144))
    m.put(0x08481DD4 + 4 * (layout_id - 1), struct.pack("<I", 0x083F0000))
    m.put(0x02037318, struct.pack("<I", 0x083F0000))
    # SetCurrentMapLayout changes the saved ID and pointer, not this original header ID.
    m.put(0x0203732A, struct.pack("<H", 164))
    return m


def test_current_layout_follows_pointer_and_saved_id_not_the_stale_original_header():
    low = read_layout_context(context_memory().read, (24, 46))
    high = read_layout_context(context_memory(168).read, (24, 46))
    assert low is not None and high is not None
    assert (low.layout_id, low.flash_level, low.variant) == (164, 3, "low tide")
    assert (high.layout_id, high.flash_level, high.variant) == (168, 3, "high tide")


@pytest.mark.parametrize(
    "address,body",
    [
        (0x03005D8C, struct.pack("<I", 0x08000000)),
        (0x02010004, bytes([24, 47])),
        (0x02010032, bytes(2)),
        (0x02010032, struct.pack("<H", 442)),
        (0x08481DD4, bytes(16)),
        (0x02037318, struct.pack("<I", 0x083F0020)),
    ],
)
def test_unverified_layout_context_is_unavailable_instead_of_defaulting(address, body):
    memory = context_memory()
    memory.put(address, body)
    assert read_layout_context(memory.read, (24, 46)) is None


def test_invalid_flash_level_is_unknown_and_cannot_invent_a_layout_variant():
    memory = context_memory(89)
    memory.put(0x02010030, bytes([255]))
    context = read_layout_context(memory.read, (24, 46))
    assert context is not None
    assert context.layout_id == 89
    assert context.flash_level is None
    assert context.variant is None


@pytest.mark.parametrize("invalid_save", [0x02010001, 0x01010000, 0x0203FFF0])
def test_layout_save_owner_bounds_reject_valid_looking_aliased_bytes(invalid_save):
    memory = context_memory()
    memory.put(0x03005D8C, struct.pack("<I", invalid_save))

    def read(address, size):
        if invalid_save <= address < invalid_save + 0x34:
            return memory.read(0x02010000 + address - invalid_save, size)
        return memory.read(address, size)

    assert read_layout_context(read, (24, 46)) is None


@pytest.mark.parametrize("layout_id", [0, 442])
def test_layout_id_bounds_cannot_be_satisfied_by_a_matching_out_of_table_entry(layout_id):
    assert read_layout_context(context_memory(layout_id).read, (24, 46)) is None


@pytest.mark.parametrize("pointer", [0x02010000, 0x0A000000])
def test_layout_pointer_must_be_rom_even_if_table_entry_matches(pointer):
    memory = context_memory()
    memory.put(0x02037318, struct.pack("<I", pointer))
    memory.put(0x08481DD4 + 4 * 163, struct.pack("<I", pointer))
    assert read_layout_context(memory.read, (24, 46)) is None


def test_missing_current_map_does_not_read_or_infer_layout_context():
    calls = []
    memory = context_memory()

    def read(address, size):
        calls.append((address, size))
        return memory.read(address, size)

    assert read_layout_context(read, None) is None
    assert calls == []


@pytest.mark.parametrize(
    "declared,backup",
    [((257, 1), (272, 15)), ((1, 257), (16, 271)), ((-1, 1), (14, 15)), ((1, 0), (16, 14))],
)
def test_each_dimension_bound_applies_before_matching_padding(declared, backup):
    assert effective_dimensions(declared, backup, (0, 1), 1) is None
