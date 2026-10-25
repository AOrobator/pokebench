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
