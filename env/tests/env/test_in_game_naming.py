"""in-game-naming-readout-v1: the naming readout for naming screens opened in the field.

Real RAM from showcase bundle run 2026-10-16T00-34-26_qwen36-gpu1_show, Birch's TORCHIC nickname:
state seq 4993 (turn 253, editor opening), 5043 (turn 254, "AAAAAAA") and 8548 (turn 330,
" ,VQ"). Each fixture holds only the RAM windows the readout reads; ROM bytes come from the
operator ROM. The recorded readouts are what the model saw with the switch absent.
"""

import json
import os
from pathlib import Path

import pytest

from pokebench_env import rerender
from pokebench_env.game_state import MapNames, read_game_state
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

ID = "in-game-naming-readout-v1"
FIXTURES = Path(__file__).parent / "fixtures"
# The showcase run's server-side switches that were off (its run_start features).
RECORDED_OFF = [
    "battle-details-v2",
    "counter-talk-v1",
    "expanded-menu-battle-information-v1",
    "full-map-navigation-v1",
]
ROM_START = 0x08000000
HINT = "A selects the current key; B deletes; SELECT changes page; START moves to OK."


def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def fixture_reader(seq: int):
    rom = operator_rom()
    cells: dict[int, int] = {}
    for window in json.loads((FIXTURES / f"in-game-naming-show-{seq}.json").read_text())[
        "windows"
    ]:
        start = int(window["address"], 16)
        for offset, value in enumerate(bytes.fromhex(window["hex"])):
            cells[start + offset] = value

    def read(address: int, length: int) -> bytes:
        if address >= ROM_START:
            return rom[address - ROM_START : address - ROM_START + length]
        return bytes(cells[address + i] for i in range(length))

    return read


def showcase(seq: int, off: list[str]) -> str:
    read = fixture_reader(seq)
    env = {"POKEBENCH_FEATURES_OFF": ",".join(off), "POKEBENCH_ACTIVE_UI": "1"}
    return rerender.rerender(
        Path("/run"),
        [rerender.RawRef("a", "s")],
        lambda _p, _s: read,
        MapNames.load(rerender.PORYMAP_MAPS),
        env,
    )[0]


def recorded(seq: int) -> str:
    return (FIXTURES / f"in-game-naming-off-show-{seq}.txt").read_text()


@pytest.mark.parametrize("seq", [4993, 5043, 8548])
def test_off_reproduces_the_recorded_readout_byte_for_byte(seq: int) -> None:
    assert showcase(seq, [*RECORDED_OFF, ID]) == recorded(seq)


@pytest.mark.parametrize(
    ("seq", "lines"),
    [
        (
            4993,
            [
                "Name being edited: ''",
                "Naming keyboard: uppercase; cursor column 0, row 0 (zero-based); selected key 'A'",
                "Naming input: transitioning; wait and observe",
                HINT,
            ],
        ),
        (
            5043,
            [
                "Name being edited: 'AAAAAAA'",
                "Naming keyboard: uppercase; cursor column 0, row 0 (zero-based); selected key 'A'",
                "Naming input: ready",
                HINT,
            ],
        ),
        (
            8548,
            [
                "Name being edited: ' ,VQ'",
                "Naming keyboard: uppercase; cursor column 1, row 0 (zero-based); selected key 'B'",
                "Naming input: ready",
                HINT,
            ],
        ),
    ],
)
def test_on_adds_the_naming_lines_after_the_story_line(seq: int, lines: list[str]) -> None:
    off = recorded(seq).split("\n")
    on = showcase(seq, RECORDED_OFF).split("\n")
    story = next(i for i, line in enumerate(off) if line.startswith("Story: "))
    assert on == [*off[: story + 1], *lines, *off[story + 1 :]]


def test_registered_server_switch_default_off() -> None:
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


def test_reader_threads_the_switch_into_state_json() -> None:
    read = fixture_reader(8548)
    maps = MapNames.load(rerender.PORYMAP_MAPS)
    off = read_game_state(read, maps, active_ui_enabled=True)
    on = read_game_state(read, maps, active_ui_enabled=True, in_game_naming_enabled=True)
    assert off.started and on.started
    assert off.naming is None and state_json(off)["naming"] is None
    assert on.naming is not None
    assert state_json(on)["naming"] == {
        "text": " ,VQ",
        "page": "uppercase",
        "column": 1,
        "row": 0,
        "key": "B",
        "ready": True,
    }
