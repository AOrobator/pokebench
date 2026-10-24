import hashlib
import struct
from dataclasses import replace

import pytest
from test_world import events

from pokebench_env.world import read_targets


@pytest.fixture(autouse=True)
def fixture_clock_signature(monkeypatch):
    from pokebench_env.interaction_names import SCRIPT_NAMES, ScriptName

    pointer, entry = next((p, e) for p, e in SCRIPT_NAMES.items() if e.name == "Wall clock")
    monkeypatch.setitem(
        SCRIPT_NAMES, pointer, ScriptName(entry.name, hashlib.sha256(bytes(range(16))).hexdigest())
    )


def clock_memory():
    from pokebench_env.interaction_names import SCRIPT_NAMES

    m = events()
    pointer, entry = next((p, e) for p, e in SCRIPT_NAMES.items() if e.name == "Wall clock")
    m.put(0x08003000, struct.pack("<HHBB2xI", 5, 1, 0, 0, pointer))
    m.put(pointer, bytes(range(16)))
    return m, pointer


def test_names_verified_clock_script_without_inventing_its_position():
    m, _ = clock_memory()
    target = read_targets(m.read, (1, 1))[2]
    assert target.name == "Wall clock"
    assert "Wall clock at (5,1)" in target.text(named=True)
    assert target.text() == "background at (5,1), elevation 0; A; conditional"
    moved = replace(target, x=3, y=4)
    assert "Wall clock at (3,4)" in moved.text(named=True)
    assert target.json()["name"] == "Wall clock"


def test_wrong_script_signature_is_explicitly_unknown():
    m, pointer = clock_memory()
    m.put(pointer, bytes(16))
    target = read_targets(m.read, (1, 1))[2]
    assert target.name is None
    assert "identity unavailable" in target.text(named=True)


def test_unknown_pointer_does_not_get_clock_name_from_coordinates():
    m = events()
    m.put(0x08003000, struct.pack("<HHBB2xI", 5, 1, 0, 0, 0x08006000))
    target = read_targets(m.read, (1, 1))[2]
    assert target.name is None
    assert "Wall clock" not in target.text(named=True)


def test_named_model_text_is_separately_switchable_and_state_retains_identity():
    from test_game_state import MAPS, OVERWORLD, SB1, game

    from pokebench_env.game_state import read_game_state
    from pokebench_env.readout import format_readout, state_json

    m, _ = clock_memory()
    memory = game(OVERWORLD)
    memory.cells.update(m.cells)
    memory.put(SB1 + 4, bytes([1, 1]))
    state = read_game_state(memory.read, MAPS)
    before = format_readout(state)
    after = format_readout(state, named_interactions=True)
    assert "Wall clock at (5,1)" in after
    assert "Wall clock" not in before
    assert "background at (5,1)" in before
    assert (
        format_readout(state, frozenset({"named-interactions-v1"}), named_interactions=True)
        == before
    )
    assert "Wall clock" not in format_readout(
        state, frozenset({"world-targets-v1"}), named_interactions=True
    )
    assert state_json(state)["interaction_targets"][2]["name"] == "Wall clock"


def test_object_labels_follow_live_graphics_and_position_not_template_coordinates():
    from test_live_map import obj

    m = events()
    m.put(0x02037350 + 0x24 + 5, bytes([215]))
    target = read_targets(m.read, (1, 0))[0]
    assert target.name == "MOM"
    assert "MOM id 2 at (2,0)" in target.text(named=True)
    obj(m, 1, 4, 3)
    m.put(0x02037350 + 0x24 + 5, bytes([215]))
    moved = read_targets(m.read, (1, 0))[0]
    assert moved.name == "MOM" and (moved.x, moved.y) == (4, 3)


def test_observation_endpoint_delivers_names_only_when_explicitly_enabled(monkeypatch):
    import json

    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_game_state import MAPS, OVERWORLD, SB1, game
    from test_view import get

    from pokebench_env.observation import install_observation

    class Shot(BaseModel):
        screenshot_base64: str = "eA=="

    m, _ = clock_memory()
    memory = game(OVERWORLD)
    memory.cells.update(m.cells)
    memory.put(SB1 + 4, bytes([1, 1]))
    for off, named in [("named-interactions-v1", False), ("", True)]:
        monkeypatch.setenv(
            "POKEBENCH_FEATURES_OFF",
            ",".join(
                filter(None, [off, "active-warp-exits-v1", "available-exits-presentation-v1"])
            ),
        )
        app = FastAPI()
        install_observation(app, Shot, memory.read, MAPS)
        status, _, body = get(app, "/pokebench/observation")
        assert status == 200
        payload = json.loads(body)
        assert ("Wall clock at (5,1)" in payload["state_text"]) == named
        assert payload["state"]["interaction_targets"][2]["name"] == "Wall clock"
