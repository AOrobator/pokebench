"""Per-feature observation switches: each one removes only its own model text."""

import json
import re
import struct
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from test_view import get

from pokebench_env.game_state import GameState, read_game_state
from pokebench_env.naming import NamingState
from pokebench_env.observation import install_observation
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, game
from tests.env.test_live_map import loaded, tile
from tests.env.test_world_context import COORDS, world


def map_memory():
    m = loaded()
    m.cells.update(game(OVERWORLD).cells)
    m.put(SB1, struct.pack("<hhbb", 1, 1, 0, 9))
    m.put(0x02037350 + 0x10, struct.pack("<hh", 8, 8))
    m.put(0x02007000, struct.pack("<H", 0x69))
    return m


def map_state() -> GameState:
    return read_game_state(map_memory().read, MAPS)


def context_state() -> GameState:
    m = game(OVERWORLD)
    context = world()
    context.put(COORDS + 2, struct.pack("<h", 2))
    m.cells.update(context.cells)
    m.put(0x02037350, bytes(16 * 0x24))
    m.put(0x02037350, b"\x01\x00\x01")
    m.put(0x02037350 + 0x10, struct.pack("<hh", 17, 9))
    m.put(0x02037350 + 0x18, b"\x44")
    m.put(0x02037350 + 0x24, context.read(0x02037350, 0x24))
    m.put(SB1 + 0x139C + (0x4050 - 0x4000) * 2, struct.pack("<H", 1))
    state = read_game_state(m.read, MAPS)
    assert state.world_context is not None and state.world_context.triggers, state
    return replace(state, field_controls_locked=True)


NAMING = NamingState("MA", "upper", 2, 1, "I", True)


def dropped(full: str, reduced: str) -> list[str]:
    lines = reduced.split("\n")
    assert [line for line in lines if line not in full.split("\n")] == [], reduced
    return [line for line in full.split("\n") if line not in lines]


def test_no_switches_off_is_the_existing_readout() -> None:
    for state in (map_state(), context_state()):
        assert format_readout(state, frozenset()) == format_readout(state)


def test_ram_state_off_leaves_only_the_screenshot() -> None:
    assert format_readout(map_state(), frozenset({"ram-state-v1"})) == ""


def test_map_off_drops_the_whole_grid_block() -> None:
    state = map_state()
    full = format_readout(state)
    gone = dropped(full, format_readout(state, frozenset({"live-map-v1"})))
    assert gone[0].startswith("Local map from live memory"), gone
    assert any(line.startswith("Warps: ") for line in gone), gone
    assert not any(line.startswith("warp at") for line in gone), gone


def test_position_off_drops_only_the_position_line() -> None:
    state = map_state()
    assert dropped(
        format_readout(state), format_readout(state, frozenset({"live-player-position-v1"}))
    ) == ["Position: X=1, Y=1, facing right"]


def test_grid_off_prints_unlabeled_rows() -> None:
    state = map_state()
    assert state.nearby is not None
    text = format_readout(state, frozenset({"world-coordinate-grid-v1"}))
    assert "\n".join(state.nearby.rows) in text, text
    assert "   -6  -5" not in text and "   -6" in format_readout(state)


def test_warp_guidance_off_lists_warps_without_activation() -> None:
    state = map_state()
    full = format_readout(state)
    text = format_readout(state, frozenset({"warp-activation-guidance-v1"}))
    assert "(0,1) -> map 0/9 [door: approach from below and press UP toward door]" in full
    assert "Warps: (0,1) -> map 0/9\n" in text, text
    assert "W warp;" in text and "see activation below" not in text
    assert "W alone does not guarantee" not in text and "W alone does not guarantee" in full


def test_ledge_hops_off_draws_ledges_as_collision() -> None:
    m = map_memory()
    m.put(0x02007000 + 2 * 3, struct.pack("<H", 0x3B))
    tile(m, 1, 2, 0x400 | 3)
    state = read_game_state(m.read, MAPS)
    full = format_readout(state)
    text = format_readout(state, frozenset({"ledge-hops-v1"}))
    assert "?   .   v   .   .   .   ?" in full and "?   .   #   .   .   .   ?" in text, text
    assert "one-way hop" in full and "ledge" not in text


def test_one_way_tiles_off_draws_edge_walls_as_clear_terrain() -> None:
    m = map_memory()
    m.put(0x02007000 + 2 * 3, struct.pack("<H", 0xC0))
    tile(m, 1, 2, 3)
    state = read_game_state(m.read, MAPS)
    full = format_readout(state)
    text = format_readout(state, frozenset({"one-way-tiles-v1"}))
    assert "?   .   +   .   .   .   ?" in full and "?   .   .   .   .   .   ?" in text, text
    assert "Edge walls: (1,2) north+south" in full and "dge wall" not in text


def test_counter_talk_off_draws_counters_as_collision() -> None:
    m = map_memory()
    m.put(0x02007000 + 2 * 3, struct.pack("<H", 0x80))
    tile(m, 1, 2, 0x400 | 3)
    state = read_game_state(m.read, MAPS)
    full = format_readout(state)
    text = format_readout(state, frozenset({"counter-talk-v1"}))
    assert "?   .   =   .   .   .   ?" in full and "?   .   #   .   .   .   ?" in text, text
    assert "talk to someone standing behind it" in full and "counter" not in text


def test_targets_off_drops_candidates_only() -> None:
    state = map_state()
    gone = dropped(format_readout(state), format_readout(state, frozenset({"world-targets-v1"})))
    assert gone[0].startswith("Map interaction candidates"), gone
    assert all(line.startswith("Map interaction") or " at (" in line for line in gone), gone


@pytest.mark.parametrize(
    "feature,first,kept",
    [
        ("live-object-sprites-v1", "Field objects", "Nearby script-trigger tiles"),
        ("coordinate-script-conditions-v1", "Nearby script-trigger tiles", "Field objects"),
        ("active-field-message-buffer-v1", "Field-message text: unavailable", "Field objects"),
    ],
)
def test_world_context_parts_switch_independently(feature: str, first: str, kept: str) -> None:
    state = context_state()
    full = format_readout(state)
    text = format_readout(state, frozenset({feature}))
    gone = dropped(full, text)
    assert gone and gone[0].startswith(first), gone
    assert kept in text


def test_world_context_disappears_when_all_three_parts_are_off() -> None:
    state = context_state()
    off = frozenset(
        {
            "live-object-sprites-v1",
            "coordinate-script-conditions-v1",
            "active-field-message-buffer-v1",
        }
    )
    assert state.world_context is not None
    assert state.world_context.text() not in format_readout(state, off)
    assert "Field" not in format_readout(state, off).replace("Field controls", "")


def test_field_lock_story_and_naming_lines_switch_off() -> None:
    state = replace(context_state(), naming=NAMING)
    full = format_readout(state)
    assert dropped(full, format_readout(state, frozenset({"field-control-lock"}))) == [
        "Field controls: locked (dialog, menu, or script; direction presses cannot move)"
    ]
    assert state.story is not None
    assert dropped(
        full, format_readout(state, frozenset({"story-state-v1"}))
    ) == state.story.text().split("\n")
    assert dropped(
        full, format_readout(state, frozenset({"naming-cursor-v1"}))
    ) == NAMING.readout().split("\n")


def test_measurement_json_is_identical_with_every_switch_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payloads = []
    for off in ("", ",".join(SERVER_FEATURES)):
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
        app = FastAPI()
        install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200, body
        payloads.append(json.loads(body))
    # Whole-map navigation is the one switch that adds planner geometry to the state.
    assert payloads[0]["state"].pop("map_grid")["width"] == 5
    assert "map_grid" not in payloads[1]["state"]
    assert payloads[0]["state"] == payloads[1]["state"]
    assert payloads[0]["state_text"] != "" and payloads[1]["state_text"] == ""


def test_server_feature_list_matches_the_agent_registry() -> None:
    source = (Path(__file__).resolve().parents[3] / "packages/agent/src/features.ts").read_text()
    block = source.split("export const SERVER_FEATURES: readonly SwitchableFeature[] = [", 1)[1]
    block = block.split("];", 1)[0]
    assert tuple(re.findall(r'"([a-z0-9-]+)"', block)) == SERVER_FEATURES


def test_env_list_is_validated() -> None:
    assert features_off_from_env({}) == frozenset(
        {
            "named-interactions-v1",
            "world-destinations-v1",
            "bounded-navigation-v1",
            "expanded-menu-battle-information-v1",
            "field-dialogue-phase-v1",
            "full-map-navigation-v1",
            "named-warp-destinations-v1",
            "character-presence-v1",
            "battle-details-v2",
            "warp-arrival-settle-v1",
            "displayed-place-names-v1",
            "battle-triage-guidance-v1",
            "adjacent-tiles-v1",
            "readout-rules-in-prompt-v1",
            "connection-edge-tiles-v1",
            "in-game-naming-readout-v1",
            "battle-message-waiting-v1",
            "offscreen-objects-v1",
        }
    )
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": ""}) == frozenset()
    assert features_off_from_env(
        {"POKEBENCH_FEATURES_OFF": "live-map-v1,story-state-v1"}
    ) == frozenset({"live-map-v1", "story-state-v1"})
    for bad in ("invented-v1", "live-map-v1,,story-state-v1", "deterministic-loop-guard-v1"):
        with pytest.raises(ValueError, match="POKEBENCH_FEATURES_OFF"):
            features_off_from_env({"POKEBENCH_FEATURES_OFF": bad})
    assert "active-ui-ownership-v1" not in SERVER_FEATURES and len(SERVER_FEATURES) == 33


def test_observation_route_applies_the_env_switches(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "live-player-position-v1")
    app = FastAPI()
    install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
    status, _, body = get(app, "/pokebench/observation")
    payload = json.loads(body)
    assert status == 200, body
    assert "Position:" not in payload["state_text"] and "Location:" in payload["state_text"]
    assert payload["state"]["position"] == {"x": 1, "y": 1}


class _Shot:
    def model_dump(self) -> dict[str, object]:
        return {"screenshot_base64": "iVBORw0KGgo="}


def test_full_map_switch_replaces_the_local_grid_and_adds_map_grid_only_when_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    app = FastAPI()
    install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
    _, _, body = get(app, "/pokebench/observation")
    payload = json.loads(body)
    assert "Whole current map from live memory (5x5)" in payload["state_text"]
    assert "Local map from live memory" not in payload["state_text"]
    assert payload["state"]["map_grid"]["width"] == 5
    assert len(payload["state"]["navigation_grid"]["tiles"]) == 25
    _, _, state_body = get(app, "/pokebench/state")
    assert json.loads(state_body)["map_grid"]["height"] == 5
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "full-map-navigation-v1")
    app = FastAPI()
    install_observation(app, lambda: _Shot(), map_memory().read, MAPS)
    _, _, body = get(app, "/pokebench/observation")
    payload = json.loads(body)
    assert "Local map from live memory" in payload["state_text"]
    assert "Whole current map" not in payload["state_text"]
    assert "map_grid" not in payload["state"]


def test_full_map_text_respects_live_map_and_coordinate_switches() -> None:
    state = read_game_state(map_memory().read, MAPS, full_map_enabled=True)
    assert state.full_map is not None
    assert "Whole current map" in format_readout(state)
    assert "Whole current map" not in format_readout(state, frozenset({"live-map-v1"}))
    assert "     01234" not in format_readout(state, frozenset({"world-coordinate-grid-v1"}))
    local = format_readout(state, frozenset({"full-map-navigation-v1"}))
    assert "Local map from live memory" in local and "Whole current map" not in local
