import json
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from test_human import request
from test_running import fixture
from test_view import get

from pokebench_env.action_history import install_action_history
from pokebench_env.running import FIELD_LOCK
from pokebench_env.travel import PREFIX, install_travel


def test_native_travel_rechecks_permission_each_frame_and_records_actual_chord():
    m = fixture()
    applied = []

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)

    api = FastAPI()
    journal = install_action_history(api, Emulator, m.read)
    server = SimpleNamespace(action_queue=[])
    install_travel(api, Emulator, server, m.read)
    status, _ = request(
        api,
        "/pokebench/travel",
        {
            "buttons": ["UP", "LEFT"],
            "automatic_running": True,
            "hold_frames": 8,
            "release_frames": 8,
        },
    )
    assert status == 200
    assert server.action_queue[0]["button"] == PREFIX + "UP"
    assert server.action_queue[1]["button"] == PREFIX + "LEFT"
    emu = Emulator()
    emu.run_frame_with_buttons([server.action_queue[0]["button"]])
    m.put(FIELD_LOCK, b"\x01")
    emu.run_frame_with_buttons([server.action_queue[0]["button"]])
    emu.run_frame_with_buttons([])
    emu.run_frame_with_buttons(["B"])
    assert applied == [["UP", "B"], ["UP"], [], ["B"]]
    events = [e for e in journal.entries if e["kind"] == "native_input"]
    assert [e["details"]["buttons"] for e in events] == applied
    assert [e["frame"] for e in events] == [1, 2, 3, 4]
    assert journal.frame == 4
    status, _, body = get(api, "/pokebench/actions")
    assert status == 200
    assert json.loads(body)["frame"] == 4
    with pytest.raises(ValueError, match="private travel direction"):
        emu.run_frame_with_buttons([PREFIX + "A"])


@pytest.mark.parametrize(
    "body",
    [
        {"buttons": ["A"], "automatic_running": True, "hold_frames": 8, "release_frames": 8},
        {"buttons": ["UP"], "automatic_running": False, "hold_frames": 8, "release_frames": 8},
        {"buttons": ["UP"], "automatic_running": True, "hold_frames": 0, "release_frames": 8},
        {
            "buttons": ["UP"],
            "automatic_running": True,
            "hold_frames": 8,
            "release_frames": 8,
            "held_buttons": ["B"],
        },
    ],
)
def test_travel_route_rejects_unbounded_or_unguarded_modifiers(body):
    api = FastAPI()
    server = SimpleNamespace(action_queue=[])

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            raise AssertionError("validation must not advance frames")

    install_travel(api, Emulator, server, fixture().read)
    assert request(api, "/pokebench/travel", body)[0] == 422
    assert server.action_queue == []
