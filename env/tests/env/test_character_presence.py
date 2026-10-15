import struct

from pokebench_env.character_presence import (
    TEMPLATES,
    read_story_characters,
)
from pokebench_env.world_context import SAVE_VARIABLES, LiveObject

SAVE1 = 0x02025A00
FLAGS = 0x1270


class Memory:
    def __init__(self) -> None:
        self.bytes: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.bytes[address + i] = b

    def read(self, address: int, length: int) -> bytes:
        return bytes(self.bytes.get(address + i, 0) for i in range(length))


def template(slot: int, local_id: int, graphics: int, x: int, y: int, flag: int) -> tuple[int, bytes]:
    body = struct.pack("<BBBxhhBBHHHIH2x", local_id, graphics, 0, x, y, 0, 0, 0, 0, 0, 0x08100000, flag)
    return SAVE1 + TEMPLATES + slot * 24, body


def lab(memory: Memory, *, birch_hidden: bool) -> None:
    for slot, args in enumerate([(1, 46, 9, 7, 0), (2, 64, 6, 4, 0x2D0), (3, 105, 2, 3, 0x2D1)]):
        memory.put(*template(slot, *args))
    if birch_hidden:
        memory.put(SAVE1 + FLAGS + 0x2D0 // 8, bytes([1 << (0x2D0 % 8)]))
    memory.put(SAVE1 + FLAGS + 0x2D1 // 8, bytes([memory.read(SAVE1 + FLAGS + 0x2D1 // 8, 1)[0] | 1 << (0x2D1 % 8)]))


def test_hidden_story_characters_are_not_on_this_map_and_sprite_kinds_are_never_named_as_them() -> None:
    memory = Memory()
    lab(memory, birch_hidden=True)
    found = read_story_characters(memory.read, SAVE1, (1, 4), ())
    assert found is not None
    text = found.text()
    assert text.startswith("Story characters here (from this map's own object list): none.")
    assert "Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN." in text
    assert "SCIENTIST_1" not in text.split("Not on this map")[0]
    assert "Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters." in text


def test_a_visible_character_is_listed_with_its_live_position_or_as_out_of_view() -> None:
    memory = Memory()
    lab(memory, birch_hidden=False)
    live = (LiveObject(2, (1, 4), 64, "PROF_BIRCH", 6, 5),)
    shown = read_story_characters(memory.read, SAVE1, (1, 4), live)
    assert shown is not None
    assert "here (from this map's own object list): PROF. BIRCH at 6,5." in shown.text()
    assert "PROF. BIRCH," not in shown.text().split("Not on this map:")[1]
    unseen = read_story_characters(memory.read, SAVE1, (1, 4), ())
    assert unseen is not None and "PROF. BIRCH (on this map, out of view)" in unseen.text()


def test_variable_graphics_resolve_through_the_game_variable() -> None:
    memory = Memory()
    memory.put(*template(0, 1, 240 + 3, 4, 4, 0))
    memory.put(SAVE1 + SAVE_VARIABLES + 2 * (0x4010 + 3 - 0x4000), struct.pack("<H", 215))
    shown = read_story_characters(memory.read, SAVE1, (0, 9), ())
    assert shown is not None and "MOM (on this map, out of view)" in shown.text()


def test_unreadable_save_block_gives_no_line() -> None:
    assert read_story_characters(Memory().read, 0, (0, 9), ()) is None


def test_readout_prints_the_line_only_when_the_switch_is_on() -> None:
    from dataclasses import replace

    from pokebench_env.readout import format_readout
    from tests.env.test_feature_switches import map_memory
    from pokebench_env.game_state import read_game_state
    from tests.env.test_game_state import MAPS

    state = read_game_state(map_memory().read, MAPS)
    memory = Memory()
    lab(memory, birch_hidden=True)
    found = read_story_characters(memory.read, SAVE1, (1, 4), ())
    with_line = replace(state, story_characters=found)
    on = format_readout(with_line)
    off = format_readout(with_line, frozenset({"character-presence-v1"}))
    assert "Story characters here" in on
    assert off == format_readout(replace(state, story_characters=None))
    assert "Story characters here" not in off
