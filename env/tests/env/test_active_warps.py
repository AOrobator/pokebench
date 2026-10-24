"""Static warp events must have a corresponding activation metatile.

Source: pokeemerald731ad5b field_control_avatar.c IsWarpMetatileBehavior,
TryArrowWarp, TryDoorWarp; Route116_MapScripts / AbnormalWeather placement.
Native case: 0517 seq29346 advertised the dormant Route116 Terra Cave exits.
"""

import json
from pathlib import Path

import pytest

from pokebench_env.active_warps import warp_activation
from pokebench_env.game_state import read_game_state
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import SERVER_FEATURES, state_json
from pokebench_env.rerender import read_state, render
from tests.env.test_exit_labels import maps, operator_rom

FIXTURE = Path(__file__).parent / "fixtures/active-warps-0517"
MANIFEST = json.loads((FIXTURE / "manifest.json").read_text())


def native(name):
    case = MANIFEST["cases"][name]
    return load_raw_ram(FIXTURE / case["raw_ram"], case["sha256"], rom=operator_rom())


def disabled():
    on = {
        "ram-state-v1",
        "live-map-v1",
        "world-targets-v1",
        "world-destinations-v1",
        "named-warp-destinations-v1",
        "exit-labels-v2",
        "exit-labels-v3",
        "full-map-navigation-v1",
    }
    return frozenset(SERVER_FEATURES) - on


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


def test_native_remote_arrival_does_not_advertise_dormant_terra_cave():
    read = native("tunnel")
    off = disabled()
    before = read_state(read, maps(), active_ui=True, off=off)
    after = read_state(read, maps(), active_ui=True, off=off - {"active-warp-exits-v1"})
    assert "TERRA CAVE" in render(before, off)
    assert "TERRA CAVE" not in render(after, off - {"active-warp-exits-v1"})
    assert "ROUTE 116" in render(after, off - {"active-warp-exits-v1"})
    again = read_state(read, maps(), active_ui=True, off=off)
    assert render(before, off) == render(again, off)
    assert state_json(before) == state_json(again)


def test_native_current_map_hides_closed_warps_from_all_exit_owners():
    off = disabled()
    before = read_state(native("route"), maps(), active_ui=True, off=off)
    after = read_state(native("route"), maps(), active_ui=True, off=off - {"active-warp-exits-v1"})
    for position in [(59, 13), (79, 6)]:
        assert any(t.kind == "warp" and (t.x, t.y) == position for t in before.interaction_targets)
        assert not any(
            t.kind == "warp" and (t.x, t.y) == position for t in after.interaction_targets
        )
        assert not any((x, y) == position for x, y, *_ in after.full_map.warps)
        assert not any((w.x, w.y) == position for w in after.exit_sections.warps)
    assert "TERRA CAVE" not in render(after, off - {"active-warp-exits-v1"})
    assert after.full_map.rows[13][59] != "W"
    # Ordinary Rusturf Tunnel entrances remain available.
    assert any(t.kind == "warp" and t.destination[:2] == (24, 4) for t in after.interaction_targets)


def test_current_map_uses_live_entrance_tile_even_when_rom_is_closed():
    from pokebench_env.live_map import MAP_OFFSET, _layout

    base = native("route")
    layout = _layout(base)
    assert layout is not None
    # Find the map's real cave-door metatile, preserving source tile attributes.
    before = read_game_state(base, maps(), full_map_enabled=True)
    tile = next(t for t in before.full_map.tiles if t.behavior == 0x60)
    block = tile.metatile | tile.collision << 10 | tile.elevation << 12
    addr = layout.buffer + 2 * ((13 + MAP_OFFSET) * layout.width + 59 + MAP_OFFSET)

    def changed(address, length):
        raw = bytearray(base(address, length))
        patch = block.to_bytes(2, "little")
        for i in range(length):
            if addr <= address + i < addr + 2:
                raw[i] = patch[address + i - addr]
        return bytes(raw)

    state = read_game_state(
        changed,
        maps(),
        full_map_enabled=True,
        active_warp_exits_enabled=True,
        exit_sections_enabled=True,
    )
    assert any(t.kind == "warp" and (t.x, t.y) == (59, 13) for t in state.interaction_targets)
    assert any((x, y) == (59, 13) for x, y, *_ in state.full_map.warps)
    assert state.full_map.rows[13][59] == "W"

    assert any((w.x, w.y) == (59, 13) for w in state.exit_sections.warps)


def test_local_map_checks_live_tile_and_keeps_unknown_activation():
    from pokebench_env.live_map import read_local_map

    base = native("route")
    before = read_local_map(base, (59, 14), (0, 31))
    after = read_local_map(base, (59, 14), (0, 31), active_warps=True)
    assert before is not None and after is not None
    assert any((x, y) == (59, 13) for x, y, *_ in before.warps)
    assert not any((x, y) == (59, 13) for x, y, *_ in after.warps)
    assert before.rows[6][7] == "W"
    assert after.rows[6][7] != "W"


def test_dormant_warp_record_does_not_cut_an_ordinary_floor_into_sections():
    from pokebench_env.exit_labels import RomMap
    from pokebench_env.map_sections import build_sections

    rom = RomMap(3, 1, ((0, 0, 3, 0),) * 3, ((1, 0, 0, 24, 104),), ())
    assert not build_sections(rom).reaches((0, 0), (2, 0))
    assert build_sections(rom, active_warps=True).reaches((0, 0), (2, 0))
