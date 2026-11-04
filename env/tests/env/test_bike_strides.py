"""bike-navigation-v1: strides on the Mach and Acro Bikes (bike.c, measured 2026-11-03)."""

import struct
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from test_live_map import loaded, obj, tile
from test_running import fixture

from pokebench_env.running import OBJECT_EVENTS, PLAYER_AVATAR
from pokebench_env.strides import MAX_FRAMES, StrideRequest, bike_hold, install_strides

MACH, ACRO = 0x02, 0x04
# Frames per tile by Mach bikeFrameCounter (PlayerWalkNormal/Fast/Faster), then the Acro Bike.
MACH_FRAMES = (16, 8, 4)
ACRO_FRAMES = 6


def setup():
    """A 5x5 plain-floor map with the player at (0,2) and a four-tile corridor to its east."""
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
    server = SimpleNamespace(
        action_queue=[], action_frames_remaining=0, current_action=None, release_frames_remaining=0
    )
    body = {
        "id": "test",
        "map_id": [1, 0],
        "origin": {"x": 0, "y": 2},
        "path": [{"x": x, "y": 2} for x in range(1, 5)],
        "elevation": 3,
        "automatic_running": False,
    }
    return server, m, body


def route(api, path, method="POST"):
    """The route's own function: these tests call it in memory, without HTTP or an event loop."""
    return next(
        r.endpoint
        for r in api.routes
        if getattr(r, "path", None) == path and method in getattr(r, "methods", ())
    )


def submit(api, body):
    return route(api, "/pokebench/stride")(StrideRequest.model_validate(body))


def receipt(api):
    return route(api, "/pokebench/stride/{identity}", "GET")("test")


def start(server):
    marker = server.action_queue.pop()["button"]
    server.current_action = marker
    server.action_frames_remaining = MAX_FRAMES
    return marker


def ride(m, applied, bike):
    """Replace the fake's walking with the bike rules: a step starts only at a tile boundary."""
    m.put(PLAYER_AVATAR, bytes([bike]))
    state = {"left": 0, "speed": 0, "counter": 0}

    def step(dx):
        x, y = struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4))
        m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", x + dx, y))
        m.put(OBJECT_EVENTS, b"\x41")

    def frame(buttons):
        applied.append(buttons)
        if state["left"]:
            state["left"] -= 1
            if state["left"]:
                return
        held = "RIGHT" in buttons
        if bike == ACRO:
            if held:
                step(1)
                state["left"] = ACRO_FRAMES
            else:
                m.put(OBJECT_EVENTS, b"\x01")
        elif held:
            counter = state["counter"]
            step(1)
            state["left"] = MACH_FRAMES[counter]
            state["speed"] = counter + (counter >> 1)
            state["counter"] = min(counter + 1, 2)
        elif state["speed"]:
            state["speed"] -= 1
            state["counter"] = state["speed"]
            step(1)
            state["left"] = MACH_FRAMES[state["counter"]]
        else:
            state["counter"] = 0
            m.put(OBJECT_EVENTS, b"\x01")
        m.put(PLAYER_AVATAR + 0xA, bytes([state["counter"], state["speed"]]))

    return frame


def bike_setup(bike):
    server, m, body = setup()
    applied = []
    frame = ride(m, applied, bike)

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            frame(buttons)

    api = FastAPI()
    install_strides(api, Emulator, server, m.read)
    return (
        api,
        server,
        m,
        Emulator().run_frame_with_buttons,
        {**body, "bike": True},
        applied,
    )


def drive(api, server, run, body, frames=120, after_first=None):
    submit(api, body)
    marker = start(server)
    run([marker])
    if after_first is not None:
        after_first()
    for _ in range(frames):
        run([marker])
    return receipt(api)


@pytest.mark.parametrize("bike", [MACH, ACRO])
def test_bike_stride_ends_on_the_last_tile_and_never_holds_b(bike):
    api, server, m, run, body, applied = bike_setup(bike)
    r = drive(api, server, run, body)
    assert r["reason"] == "completed"
    assert r["completed"] == 4
    assert r["bike"] is True
    assert struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4)) == (11, 9)
    assert all(b in ([], ["RIGHT"]) for b in applied)
    assert server.action_frames_remaining == 1


def test_acro_bike_holds_through_tiles_without_stopping():
    api, server, _, run, body, applied = bike_setup(ACRO)
    drive(api, server, run, body)
    held = [i for i, b in enumerate(applied) if b == ["RIGHT"]]
    # Four tiles of six frames each, held from the first press to the last tile's start.
    assert held == list(range(held[0], held[0] + 3 * ACRO_FRAMES + 1))


def test_mach_bike_releases_early_enough_to_coast_onto_the_last_tile():
    api, server, m, run, body, applied = bike_setup(MACH)
    positions = []
    original = run

    def watched(buttons):
        original(buttons)
        positions.append(struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4))[0])

    r = drive(api, server, watched, body)
    assert r["reason"] == "completed"
    assert max(positions) == 11


def test_without_the_bike_field_a_riding_player_still_stops():
    api, server, _, run, body, applied = bike_setup(MACH)
    body = {k: v for k, v in body.items() if k != "bike"}
    r = drive(api, server, run, body)
    assert r["reason"] == "field input unavailable"
    assert "bike" not in r
    assert all(b == [] for b in applied)


@pytest.mark.parametrize("flags", [MACH | 0x08, ACRO | 0x10])
def test_surfing_or_underwater_flags_stop_a_bike_stride(flags):
    api, server, m, run, body, applied = bike_setup(MACH)
    m.put(PLAYER_AVATAR, bytes([flags]))
    r = drive(api, server, run, body)
    assert r["reason"] == "field input unavailable"
    assert all(b == [] for b in applied)


def test_bike_with_automatic_running_is_refused():
    _, _, _, _, body, _ = bike_setup(MACH)
    with pytest.raises(ValidationError):
        StrideRequest.model_validate({**body, "automatic_running": True})
    with pytest.raises(ValidationError):
        StrideRequest.model_validate({**body, "bike": "yes"})


def test_a_wall_ahead_stops_holding_before_the_next_step():
    api, server, m, run, body, applied = bike_setup(ACRO)
    r = drive(api, server, run, body, after_first=lambda: tile(m, 3, 2, 0x3400))
    assert r["reason"] == "corridor changed or unsafe"
    assert r["completed"] == 2
    assert struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4)) == (9, 9)


def test_leaving_the_corridor_stops_a_bike_stride():
    api, server, m, run, body, applied = bike_setup(ACRO)
    r = drive(
        api,
        server,
        run,
        body,
        after_first=lambda: m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", 8, 10)),
    )
    assert r["reason"] == "left planned corridor"


def test_on_foot_the_bike_field_changes_nothing():
    server, m, body = setup()
    applied = []

    class Walker:
        busy = 0

        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)
            if self.busy:
                self.busy -= 1
                if not self.busy:
                    m.put(OBJECT_EVENTS, b"\x01")
            elif "RIGHT" in buttons:
                x, y = struct.unpack("<hh", m.read(OBJECT_EVENTS + 0x10, 4))
                m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", x + 1, y))
                m.put(OBJECT_EVENTS, b"\x41")
                self.busy = 8

    api = FastAPI()
    install_strides(api, Walker, server, m.read)
    submit(api, {**body, "bike": True})
    marker = start(server)
    emu = Walker()
    for _ in range(80):
        emu.run_frame_with_buttons([marker])
    assert receipt(api)["reason"] == "completed"
    assert all(b in ([], ["RIGHT"]) for b in applied)


@pytest.mark.parametrize("length", range(1, 9))
@pytest.mark.parametrize("mach", [True, False])
def test_hold_rule_never_overshoots_and_always_arrives(length, mach):
    """bike.c rules: at each tile boundary a held Mach Bike speeds up, a released one slows down."""
    position, speed, counter = 0, 0, 0
    for _ in range(64):
        if bike_hold(length - position, counter, mach):
            position += 1
            if mach:
                speed, counter = counter + (counter >> 1), min(counter + 1, 2)
        elif mach and speed:
            speed -= 1
            counter = speed
            position += 1
        else:
            speed = counter = 0
        assert position <= length
    assert position == length


def test_hold_rule_values():
    assert bike_hold(0, 0, True) is False
    assert bike_hold(1, 0, True) is True
    assert bike_hold(2, 1, True) is True
    assert bike_hold(3, 2, True) is False
    assert bike_hold(4, 2, True) is True
    assert bike_hold(1, 2, False) is True
    assert bike_hold(0, 0, False) is False


def test_a_moving_origin_never_receives_input():
    api, server, m, run, body, applied = bike_setup(ACRO)
    m.put(OBJECT_EVENTS, b"\x41")
    r = drive(api, server, run, body, frames=0)
    assert r["reason"] == "origin changed or not stationary"
    assert applied == [[]]


def test_a_bike_that_never_moves_stops_after_bounded_frames():
    api, server, m, run, body, applied = bike_setup(ACRO)

    def stuck(buttons):
        run(buttons)
        m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", 7, 9))
        m.put(OBJECT_EVENTS, b"\x01")

    r = drive(api, server, stuck, body, frames=60)
    assert r["reason"] == "no movement"
    assert r["completed"] == 0


def test_a_height_change_on_a_still_tile_stops_the_ride():
    api, server, m, run, body, applied = bike_setup(ACRO)

    def still(buttons):
        run(buttons)
        m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", 7, 9))
        m.put(OBJECT_EVENTS, b"\x01")
        m.put(OBJECT_EVENTS + 0xB, b"\x44")

    r = drive(api, server, still, body)
    assert r["reason"] == "field input or elevation changed"
    assert r["completed"] == 0


def test_only_a_ridden_corridor_may_run_past_eight_tiles():
    _, _, _, _, body, _ = bike_setup(ACRO)
    long = [{"x": x, "y": 2} for x in range(1, 11)]
    assert len(StrideRequest.model_validate({**body, "path": long}).path) == 10
    with pytest.raises(ValidationError):
        StrideRequest.model_validate({**body, "path": long, "bike": False})
    too_long = [{"x": x, "y": 2} for x in range(1, 18)]
    with pytest.raises(ValidationError):
        StrideRequest.model_validate({**body, "path": too_long})
