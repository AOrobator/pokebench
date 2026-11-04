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
from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env
from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom

ID = "in-game-naming-readout-v1"
FIXTURES = Path(__file__).parent / "fixtures"
# The showcase run's server-side switches that were off (its run_start features).
# Server switches registered after the run was recorded were not in it.
ROM_START = 0x08000000


def operator_rom() -> bytes:
    try:
        return resolve_rom(os.environ, EMERALD_SHA1).read_bytes()
    except RomError:
        pytest.skip("POKEBENCH_ROM is not set to the Emerald ROM")


def fixture_reader(seq: int):
    rom = operator_rom()
    cells: dict[int, int] = {}
    for window in json.loads((FIXTURES / f"in-game-naming-show-{seq}.json").read_text())["windows"]:
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


def test_registered_server_switch_default_off() -> None:
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})
