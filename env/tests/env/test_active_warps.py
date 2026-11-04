"""Static warp events must have a corresponding activation metatile.

Source: pokeemerald731ad5b field_control_avatar.c IsWarpMetatileBehavior,
TryArrowWarp, TryDoorWarp; Route116_MapScripts / AbnormalWeather placement.
Native case: 0517 seq29346 advertised the dormant Route116 Terra Cave exits.
"""

import json
from pathlib import Path

import pytest

from pokebench_env.active_warps import warp_activation
from pokebench_env.raw_ram import load_raw_ram
from tests.env.test_exit_labels import operator_rom

FIXTURE = Path(__file__).parent / "fixtures/active-warps-0517"
MANIFEST = json.loads((FIXTURE / "manifest.json").read_text())


def native(name):
    case = MANIFEST["cases"][name]
    return load_raw_ram(FIXTURE / case["raw_ram"], case["sha256"], rom=operator_rom())


@pytest.mark.parametrize(
    "behavior",
    [
        0x0E,
        0x0F,
        0x1B,
        0x1C,
        0x29,
        *range(0x60, 0x66),
        0x67,
        0x68,
        0x69,
        0x6A,
        0x6B,
        0x6C,
        0x6D,
        0x6E,
        0x70,
    ],
)
def test_source_supported_entrance_behaviors_remain_candidates(behavior):
    assert warp_activation(behavior) is True


@pytest.mark.parametrize("behavior", [0, 2, 3, 8, 0x32, 0x3B])
def test_ordinary_terrain_is_not_an_entrance(behavior):
    assert warp_activation(behavior) is False


@pytest.mark.parametrize("behavior", [None, 0x0D, 0x66, 0x8D, 0xFF])
def test_unknown_or_script_owned_activation_is_not_guessed_inactive(behavior):
    assert warp_activation(behavior) is None


def test_dormant_warp_record_does_not_cut_an_ordinary_floor_into_sections():
    from pokebench_env.exit_labels import RomMap
    from pokebench_env.map_sections import build_sections

    rom = RomMap(3, 1, ((0, 0, 3, 0),) * 3, ((1, 0, 0, 24, 104),), ())
    assert not build_sections(rom).reaches((0, 0), (2, 0))
    assert build_sections(rom, active_warps=True).reaches((0, 0), (2, 0))
