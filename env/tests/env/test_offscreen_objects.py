"""offscreen-objects-v1: people and objects on this map that the local map does not show.

The fixture holds the RAM windows (never ROM bytes) that re-rendering two recorded readouts of
cook run #2 (2026-10-16T02-23-17_qwen36-gpu1_sh02) reads, plus the tool result the model got.
T416 (raw-ram 4588): the player has just entered Route 103 at (11,21); the readout said
"MAY (on this map, out of view)" with no tile. T754 (raw-ram 5144): MAY at (10,3) is inside
the 15x15 window for the first time.
"""

import functools
import json
import os
import struct
from pathlib import Path

import pytest

from pokebench_env import rerender
from pokebench_env.character_presence import TEMPLATES, StoryCharacters
from pokebench_env.game_state import MapNames
from pokebench_env.live_map import MAP_OFFSET, OBJECT_EVENTS
from pokebench_env.offscreen_objects import (
    HEADER,
    SWITCH,
    MapObject,
    offscreen_text,
    read_offscreen_objects,
)
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

FIXTURE = json.loads((Path(__file__).parent / "fixtures/offscreen-objects-sh02.json").read_text())
ROM_START = 0x08000000
# Server switches registered after cook run #2 were off for it.
RECORDED_OFF = frozenset(FIXTURE["recorded_off"]) | {
    "active-warp-exits-v1",
    "available-exits-presentation-v1",
    "player-elevation-readout-v1",
    "static-npc-template-approach-v1",
    "connection-edge-tiles-v1",
    "in-game-naming-readout-v1",
    "readout-truth-v1",
    "birch-speech-pages-v1",
    "blackout-readout-v1",
    "surf-gated-exits-v1",
    "exit-reachability-v1",
    "heal-before-trainers-v1",
    "tutorial-party-owner-v1",
    "mid-frame-readout-v1",
    "unset-dynamic-warp-v1",
    "status-names-v1",
    "surf-gated-exits-v2",
    "battle-effective-damage-v1",
    "semantic-navigation-v2",
    "exit-labels-v2",
    "exp-next-level-v1",
    "pokedex-own-v1",
}
T416 = "raw-ram/00004588.json.gz"
T754 = "raw-ram/00005144.json.gz"
CURRENT = json.loads(
    (Path(__file__).parent / "fixtures/readout-truth-current-warp-names.json").read_text()
)["cases"]
MAY_OFF = "MAY (on this map, out of view)"
MAY_ON = "MAY at 10,3 (out of view; where the map places this character, it may have moved)"
MAY_ENTRY = (
    "- map 0/18 object 2: sprite RIVAL_MAY_NORMAL (graphics 105) at (10,3), "
    "not loaded; where the map places it, it may have moved"
)


@functools.cache
def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def frame(raw: str) -> dict[str, object]:
    return next(f for f in FIXTURE["frames"] if f["raw_ram"] == raw)


@functools.cache
def map_names() -> MapNames:
    return MapNames.load(rerender.PORYMAP_MAPS)


def reader(raw: str, rom: bytes):  # type: ignore[no-untyped-def]
    cells: dict[int, int] = {}
    for window in frame(raw)["windows"]:  # type: ignore[attr-defined]
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def render(raw: str, off: frozenset[str]) -> str:
    read = reader(raw, operator_rom())
    maps = map_names()
    return rerender.render(rerender.read_state(read, maps, active_ui=True, off=off), off)


def changed(before: str, after: str) -> tuple[list[str], list[str]]:
    old, new = before.split("\n"), after.split("\n")
    return [line for line in old if line not in new], [line for line in new if line not in old]


# --- cook run #2, real ROM ----------------------------------------------------------------


@pytest.mark.parametrize("raw", [T416, T754])
def test_off_matches_current_policy_without_rewriting_what_the_model_received(raw: str) -> None:
    text = render(raw, RECORDED_OFF | {SWITCH})
    received = str(frame(raw)["received"])
    assert text == CURRENT[f"offscreen:{raw}"]
    assert "Warp destination at (45,6): ALTERING CAVE" in received
    assert HEADER not in text


def test_t416_on_lists_may_where_the_map_places_her() -> None:
    off = render(T416, RECORDED_OFF | {SWITCH})
    on = render(T416, RECORDED_OFF)
    removed, added = changed(off, on)
    assert removed == [line for line in off.split("\n") if MAY_OFF in line]
    assert HEADER in added
    assert MAY_ENTRY in added
    story = next(line for line in on.split("\n") if line.startswith("Story characters here"))
    assert MAY_ON in story
    assert MAY_OFF not in story
    # Every added line is the story line, the header or an object entry; nothing else changes.
    assert all(
        line.startswith(("Story characters here", HEADER, "- map 0/18 object ")) for line in added
    )


def test_t416_lists_every_unhidden_object_outside_the_window_once() -> None:
    on = render(T416, RECORDED_OFF)
    lines = on.split("\n")
    entries = lines[lines.index(HEADER) + 1 :]
    entries = entries[: next(i for i, line in enumerate(entries) if not line.startswith("- "))]
    ids = [int(line.split(" object ")[1].split(":")[0]) for line in entries]
    assert len(ids) == len(set(ids))
    assert 2 in ids  # MAY
    assert 11 not in ids  # PROF. BIRCH's Route 103 template: its flag is set, so it is hidden
    for line in entries:
        x, y = (int(v) for v in line.split(" at (")[1].split(")")[0].split(","))
        assert abs(x - 11) > 7 or abs(y - 21) > 7


def test_t754_may_is_on_screen_so_she_is_not_listed_off_screen() -> None:
    on = render(T754, RECORDED_OFF)
    assert "MAY at 10,3." in on or "MAY at 10,3 " in on
    assert MAY_ON not in on
    assert "object 2:" not in on.split(HEADER)[1]
    assert "- map 0/18 object 2: sprite RIVAL_MAY_NORMAL (graphics 105) at (10,3)" in on


def test_production_route_honors_the_switch() -> None:
    off = render(T416, RECORDED_OFF | {SWITCH})
    on = render(T416, RECORDED_OFF)
    assert HEADER in on
    assert HEADER not in off


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


# --- synthetic RAM -------------------------------------------------------------------------

SAVE1 = 0x02025A6C
MAP = (0, 18)
FLAGS = SAVE1 + 0x1270


class Ram:
    def __init__(self) -> None:
        self.cells: dict[int, int] = {}

    def put(self, address: int, data: bytes) -> None:
        for i, b in enumerate(data):
            self.cells[address + i] = b

    def __call__(self, address: int, length: int) -> bytes:
        return bytes(self.cells.get(address + i, 0) for i in range(length))


def template(ram: Ram, slot: int, local_id: int, gfx: int, x: int, y: int, flag: int = 0) -> None:
    entry = bytearray(24)
    entry[0], entry[1] = local_id, gfx
    struct.pack_into("<hh", entry, 4, x, y)
    struct.pack_into("<H", entry, 0x14, flag)
    ram.put(SAVE1 + TEMPLATES + slot * 24, bytes(entry))


def live(ram: Ram, slot: int, local_id: int, x: int, y: int, invisible: bool = False) -> None:
    body = bytearray(0x24)
    body[0] = 1
    body[1] = 0x20 if invisible else 0
    body[8], body[9], body[10] = local_id, MAP[1], MAP[0]
    struct.pack_into("<hh", body, 0x10, x + MAP_OFFSET, y + MAP_OFFSET)
    ram.put(OBJECT_EVENTS + slot * 0x24, bytes(body))


def test_template_far_away_is_listed_with_its_template_tile() -> None:
    ram = Ram()
    template(ram, 0, 3, 7, 40, 5)
    assert read_offscreen_objects(ram, SAVE1, MAP, (10, 10)) == (
        MapObject(3, 7, "BOY_1", 40, 5, False),
    )


def test_loaded_object_off_window_uses_its_live_tile() -> None:
    ram = Ram()
    template(ram, 0, 3, 7, 40, 5)
    live(ram, 1, 3, 30, 6)
    assert read_offscreen_objects(ram, SAVE1, MAP, (10, 10)) == (
        MapObject(3, 7, "BOY_1", 30, 6, True),
    )


def test_inside_window_invisible_and_flag_hidden_objects_are_not_listed() -> None:
    ram = Ram()
    template(ram, 0, 3, 7, 12, 12)  # inside the window
    template(ram, 1, 4, 7, 40, 5)
    live(ram, 2, 4, 40, 5, invisible=True)
    template(ram, 2, 5, 7, 41, 5, flag=0x20)
    ram.put(FLAGS + 0x20 // 8, bytes([1 << (0x20 % 8)]))
    assert read_offscreen_objects(ram, SAVE1, MAP, (10, 10)) == ()


def test_variable_graphics_resolve_through_the_game_variable() -> None:
    ram = Ram()
    template(ram, 0, 2, 240, 10, 3)
    ram.put(SAVE1 + 0x139C + 2 * 0x10, struct.pack("<H", 105))
    assert read_offscreen_objects(ram, SAVE1, MAP, (11, 21)) == (
        MapObject(2, 105, "RIVAL_MAY_NORMAL", 10, 3, False),
    )


def test_invalid_save_block_or_failed_read_gives_none() -> None:
    assert read_offscreen_objects(Ram(), 0, MAP, (0, 0)) is None

    def failing(address: int, length: int) -> bytes:
        raise OSError("gone")

    assert read_offscreen_objects(failing, SAVE1, MAP, (0, 0)) is None
    assert read_offscreen_objects(lambda a, n: b"", SAVE1, MAP, (0, 0)) is None


def test_text_lists_every_object_whole_or_says_none() -> None:
    objects = (MapObject(3, 7, "BOY_1", 30, 6, True), MapObject(9, 0, None, 50, 1, False))
    assert offscreen_text(objects, MAP) == "\n".join(
        [
            HEADER,
            "- map 0/18 object 3: sprite BOY_1 (graphics 7) at (30,6), "
            "loaded off screen, its tile now",
            "- map 0/18 object 9: sprite unknown (graphics 0) at (50,1), "
            "not loaded; where the map places it, it may have moved",
        ]
    )
    assert offscreen_text((), MAP) == "Off-screen people and objects on this map: none."


def test_story_line_on_names_the_tile_off_keeps_today() -> None:
    story = StoryCharacters(here=(MAY_OFF,), absent=("MOM",), out_of_view=(("MAY", 2),))
    placed = {2: MapObject(2, 105, "RIVAL_MAY_NORMAL", 10, 3, False)}
    assert story.text() == (
        f"Story characters here (from this map's own object list): {MAY_OFF}. "
        "Not on this map: MOM. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these "
        "characters."
    )
    assert MAY_ON in story.text(placed)
    loaded = {2: MapObject(2, 105, "RIVAL_MAY_NORMAL", 30, 3, True)}
    assert "MAY at 30,3 (out of view)" in story.text(loaded)
    assert MAY_OFF in story.text({})


def test_format_readout_needs_the_switch_and_live_object_sprites() -> None:
    read = reader(T416, operator_rom())
    maps = map_names()
    state = rerender.read_state(read, maps, active_ui=True, off=RECORDED_OFF)
    assert HEADER in format_readout(state, RECORDED_OFF)
    assert HEADER not in format_readout(state, RECORDED_OFF | {SWITCH})
    assert HEADER not in format_readout(state, RECORDED_OFF | {"live-object-sprites-v1"})
    state_off = rerender.read_state(read, maps, active_ui=True, off=RECORDED_OFF | {SWITCH})
    assert state_off.offscreen_objects is None
