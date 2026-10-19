import json
import struct
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from test_human import request
from test_live_map import loaded, obj, tile
from test_running import fixture
from test_view import get

from pokebench_env.running import FIELD_LOCK, OBJECT_EVENTS
from pokebench_env.strides import MAX_FRAMES, PREFIX, install_strides


def setup():
    m = loaded()
    m.cells.update(fixture().cells)
    m.put(0x08500000, struct.pack("<IIIIII", 5, 5, 0, 0, 0x02003000, 0x02004000))
    m.put(0x02037318 + 4, struct.pack("<I", 0x08501000))
    m.put(0x08501000, bytes(16))
    m.put(0x02025004, bytes([1, 0]))
    obj(m, 0, 0, 2, player=True)
    m.put(OBJECT_EVENTS + 0xB, b"\x33")
    for x in range(5):
        for y in range(5):
            tile(m, x, y, 0x3000)
    applied = []

    class Emulator:
        busy = 0

        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)
            if self.busy:
                assert buttons == [], "direction must be released during native motion"
                self.busy -= 1
                if not self.busy:
                    m.put(OBJECT_EVENTS, b"\x01")
            elif "RIGHT" in buttons:
                x, y = struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4))
                m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", x + 1, y))
                m.put(OBJECT_EVENTS, b"\x41")
                self.busy = 8

    api = FastAPI()
    server = SimpleNamespace(
        action_queue=[], action_frames_remaining=0, current_action=None, release_frames_remaining=0
    )
    install_strides(api, Emulator, server, m.read)
    body = {
        "id": "test",
        "map_id": [1, 0],
        "origin": {"x": 0, "y": 2},
        "path": [{"x": x, "y": 2} for x in range(1, 5)],
        "elevation": 3,
        "automatic_running": True,
    }
    return api, server, m, Emulator(), body, applied


def start(server):
    marker = server.action_queue.pop()["button"]
    server.current_action = marker
    server.action_frames_remaining = MAX_FRAMES
    return marker


def receipt(api):
    return json.loads(get(api, "/pokebench/stride/test")[2])


def test_running_stride_never_holds_through_two_tiles_and_stops_stationary_at_goal():
    api, server, m, emu, body, applied = setup()
    assert request(api, "/pokebench/stride", body)[0] == 200
    marker = start(server)
    for _ in range(80):
        emu.run_frame_with_buttons([marker])
    assert sum(bool(b) for b in applied) == 4
    assert all(b in ([], ["RIGHT", "B"]) for b in applied)
    assert struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4)) == (11, 9)
    assert emu.busy == 0
    assert receipt(api)["completed"] == 4
    assert receipt(api)["reason"] == "completed"
    assert server.action_frames_remaining == 1


@pytest.mark.parametrize(
    "hazard", ["wall", "grass", "elevation", "object", "script", "lock", "map"]
)
def test_every_step_revalidates_live_corridor_and_controls(hazard):
    api, server, m, emu, body, applied = setup()
    assert request(api, "/pokebench/stride", body)[0] == 200
    marker = start(server)
    emu.run_frame_with_buttons([marker])
    if hazard in ("wall", "grass", "elevation"):
        tile(m, 2, 2, {"wall": 0x3400, "grass": 0x3001, "elevation": 0x4000}[hazard])
    if hazard == "object":
        obj(m, 1, 2, 2)
    if hazard == "script":
        m.put(0x08501002, b"\x01")
        m.put(0x0850100C, struct.pack("<I", 0x08502000))
        m.put(0x08502000, struct.pack("<hhBxHH2xI", 2, 2, 3, 0x4000, 0, 0x08503000))
    if hazard == "lock":
        m.put(FIELD_LOCK, b"\x01")
    if hazard == "map":
        m.put(0x02025004, bytes([0, 9]))
    for _ in range(40):
        emu.run_frame_with_buttons([marker])
    assert sum(bool(b) for b in applied) == 1
    assert receipt(api)["stopped"] is True
    assert receipt(api)["reason"] != "completed"


def test_nonstationary_origin_never_receives_input():
    api, server, m, emu, body, applied = setup()
    m.put(OBJECT_EVENTS, b"\x41")
    assert request(api, "/pokebench/stride", body)[0] == 200
    emu.run_frame_with_buttons([start(server)])
    assert applied == [[]]
    assert receipt(api)["reason"] == "origin changed or not stationary"


@pytest.mark.parametrize(
    "change",
    [
        {"path": []},
        {"path": [{"x": 1, "y": 2}, {"x": 1, "y": 3}]},
        {"map_id": [1, 999]},
        {"id": "bad:marker"},
        {"elevation": 0},
        {"held_buttons": ["B"]},
    ],
)
def test_invalid_corridors_never_queue(change):
    api, server, _, _, body, _ = setup()
    assert request(api, "/pokebench/stride", {**body, **change})[0] == 422
    assert server.action_queue == []


def test_admission_and_receipt_identity_are_bounded():
    api, server, _, emu, body, _ = setup()
    assert request(api, "/pokebench/stride", body)[0] == 200
    assert request(api, "/pokebench/stride", body)[0] == 409
    assert request(api, "/pokebench/stride", {**body, "id": "other"})[0] == 409
    assert get(api, "/pokebench/stride/unknown")[0] == 404
    with pytest.raises(ValueError, match="private stride"):
        emu.run_frame_with_buttons([PREFIX + "unknown"])
    assert len(server.action_queue) == 1


def test_cancel_stops_own_marker_without_truncating_other_queued_input():
    api, server, _, emu, body, applied = setup()
    assert request(api, "/pokebench/stride", body)[0] == 200
    marker = start(server)
    emu.run_frame_with_buttons([marker])
    assert request(api, "/pokebench/stride/test/cancel")[0] == 200
    for _ in range(20):
        emu.run_frame_with_buttons([marker])
    assert sum(bool(b) for b in applied) == 1
    assert receipt(api)["reason"] == "cancelled"
    assert request(api, "/pokebench/stride/unknown/cancel")[0] == 404


def test_ordinary_active_or_release_input_refuses_stride_admission():
    for field, value in [
        ("current_action", "RIGHT"),
        ("action_frames_remaining", 10),
        ("release_frames_remaining", 8),
    ]:
        api, server, _, _, body, _ = setup()
        setattr(server, field, value)
        assert request(api, "/pokebench/stride", body)[0] == 409
        assert server.action_queue == []


def test_budget_and_unexpected_displacement_stop_without_new_direction():
    for mode in ("budget", "teleport", "unreadable"):
        api, server, m, emu, body, applied = setup()
        assert request(api, "/pokebench/stride", body)[0] == 200
        marker = start(server)
        emu.run_frame_with_buttons([marker])
        if mode == "budget":
            emu.busy = MAX_FRAMES + 10
        elif mode == "teleport":
            m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", 11, 9))
        else:
            m.put(0x03005D8C, bytes(4))
        for _ in range(MAX_FRAMES + 1):
            emu.run_frame_with_buttons([marker])
        assert sum(bool(b) for b in applied) == 1
        assert (
            receipt(api)["reason"]
            == {
                "budget": "frame budget",
                "teleport": "left planned corridor",
                "unreadable": "native validation unavailable",
            }[mode]
        )


def test_a_foreign_queue_input_does_not_inherit_stride_or_get_truncated():
    api, server, _, emu, body, applied = setup()
    assert request(api, "/pokebench/stride", body)[0] == 200
    marker = start(server)
    emu.run_frame_with_buttons([marker])
    server.current_action = "A"
    server.action_frames_remaining = 10
    emu.busy = 0
    emu.run_frame_with_buttons(["A"])
    assert applied[-1] == ["A"]
    assert server.action_frames_remaining == 10
    assert receipt(api)["reason"] == "queue interrupted"
