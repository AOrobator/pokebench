import json
import struct
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from test_human import request
from test_live_map import loaded, obj, tile
from test_running import fixture
from test_view import get

from pokebench_env.intercept import MAX_FRAMES, PREFIX, install_intercept
from pokebench_env.running import FIELD_LOCK, OBJECT_EVENTS

# An 8-tile ring around a 1x1 table at (2,2), walked like a walk-sequence patrol.
RING = [(1, 1), (2, 1), (3, 1), (3, 2), (3, 3), (2, 3), (1, 3), (1, 2)]
DIR = {(0, -1): 2, (0, 1): 1, (-1, 0): 3, (1, 0): 4}
STEP = 16


def coords(m, slot, offset=0x10):
    x, y = struct.unpack("<hh", m.read(OBJECT_EVENTS + slot * 0x24 + offset, 4))
    return x - 7, y - 7


def place(m, slot, point, local_id):
    obj(m, slot, *point)
    m.put(OBJECT_EVENTS + slot * 0x24 + 8, bytes([local_id]))
    m.put(OBJECT_EVENTS + slot * 0x24 + 0x14, struct.pack("<hh", point[0] + 7, point[1] + 7))
    m.put(OBJECT_EVENTS + slot * 0x24 + 0xB, b"\x33")


def occupied(m, point, skip):
    for slot in range(16):
        base = OBJECT_EVENTS + slot * 0x24
        if slot == skip or not m.read(base, 1)[0] & 1:
            continue
        if point in (coords(m, slot), coords(m, slot, 0x14)):
            return True
    return False


class World:
    """Stepped fake: walkers advance one ring tile per STEP frames, or walk in place if blocked."""

    def __init__(self, m, walkers):
        self.m = m
        self.walkers = walkers  # slot -> ring index
        self.clock = 0
        self.player_busy = 0
        self.bumps = 0
        self.refuse = False
        self.inputs: list[tuple[int, list[str]]] = []

    def walk(self):
        for slot, index in list(self.walkers.items()):
            if self.clock % STEP:
                continue
            nxt = RING[(index + 1) % len(RING)]
            base = OBJECT_EVENTS + slot * 0x24
            if occupied(self.m, nxt, slot):
                self.m.put(base + 0x14, self.m.read(base + 0x10, 4))
                continue
            self.m.put(base + 0x14, self.m.read(base + 0x10, 4))
            self.m.put(base + 0x10, struct.pack("<hh", nxt[0] + 7, nxt[1] + 7))
            self.walkers[slot] = (index + 1) % len(RING)

    def run_frame_with_buttons(self, buttons):
        self.clock += 1
        self.inputs.append((self.clock, list(buttons)))
        m = self.m
        if self.player_busy:
            self.player_busy -= 1
            if not self.player_busy:
                m.put(OBJECT_EVENTS, b"\x01")
        else:
            moves = {"UP": (0, -1), "DOWN": (0, 1), "LEFT": (-1, 0), "RIGHT": (1, 0)}
            pressed = [b for b in buttons if b in moves]
            if pressed:
                delta = moves[pressed[0]]
                facing = m.read(OBJECT_EVENTS + 0x18, 1)[0] & 15
                if facing != DIR[delta]:
                    m.put(OBJECT_EVENTS + 0x18, bytes([DIR[delta]]))
                    m.put(OBJECT_EVENTS, b"\x41")
                    self.player_busy = 8
                else:
                    here = coords(m, 0)
                    nxt = (here[0] + delta[0], here[1] + delta[1])
                    m.put(OBJECT_EVENTS, b"\x41")
                    self.player_busy = STEP
                    if self.refuse or occupied(m, nxt, 0):
                        self.bumps += 1
                    else:
                        m.put(OBJECT_EVENTS + 0x14, m.read(OBJECT_EVENTS + 0x10, 4))
                        m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", nxt[0] + 7, nxt[1] + 7))
        self.walk()


def setup(*, lead=3, target_start=0, player=(2, 0), facing=4):
    m = loaded()
    m.cells.update(fixture().cells)
    m.put(0x08500000, struct.pack("<IIIIII", 5, 5, 0, 0, 0x02003000, 0x02004000))
    m.put(0x02037318 + 4, struct.pack("<I", 0x08501000))
    m.put(0x08501000, bytes(16))
    m.put(0x02025004, bytes([1, 0]))
    m.put(0x02002000, bytes(4))
    for x in range(5):
        for y in range(5):
            tile(m, x, y, 0x3000)
    tile(m, 2, 2, 0x3400)
    obj(m, 0, *player, player=True)
    m.put(OBJECT_EVENTS + 0x14, struct.pack("<hh", player[0] + 7, player[1] + 7))
    m.put(OBJECT_EVENTS + 0xB, b"\x33")
    m.put(OBJECT_EVENTS + 0x18, bytes([facing]))
    for slot in range(1, 16):
        m.put(OBJECT_EVENTS + slot * 0x24, bytes(0x24))
    walkers = {1: target_start}
    place(m, 1, RING[target_start], 1)
    if lead:
        leader = (target_start + lead) % len(RING)
        place(m, 2, RING[leader], 2)
        walkers[2] = leader
    world = World(m, walkers)

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            world.run_frame_with_buttons(buttons)

    api = FastAPI()
    server = SimpleNamespace(
        action_queue=[], action_frames_remaining=0, current_action=None, release_frames_remaining=0
    )
    install_intercept(api, Emulator, server, m.read)
    # Wait above (2,1); the target reaches (2,1) from (1,1).
    body = {
        "id": "pin",
        "map_id": [1, 0],
        "wait": {"x": 2, "y": 0},
        "enter": {"x": 2, "y": 1},
        "approach": {"x": 1, "y": 1},
        "target_local_id": 1,
        "target_slot": 1,
        "elevation": 3,
        "max_frames": MAX_FRAMES,
    }
    return api, server, m, world, Emulator(), body


def start(server):
    marker = server.action_queue.pop()["button"]
    server.current_action = marker
    server.action_frames_remaining = MAX_FRAMES
    return marker


def receipt(api, identity="pin"):
    return json.loads(get(api, f"/pokebench/intercept/{identity}")[2])


def run(api, server, emu, body, frames=MAX_FRAMES + 2):
    assert request(api, "/pokebench/intercept", body)[0] == 200
    marker = start(server)
    for _ in range(frames):
        emu.run_frame_with_buttons([marker])
        if receipt(api, body["id"])["stopped"]:
            break
    return receipt(api, body["id"])


@pytest.mark.parametrize("lead", [1, 2, 3])
@pytest.mark.parametrize("target_start", [0, 3, 6])
def test_pins_the_trailing_target_not_the_walker_ahead(lead, target_start):
    api, server, m, world, emu, body = setup(lead=lead, target_start=target_start)
    result = run(api, server, emu, body)
    assert result["reason"] == "entered"
    assert coords(m, 0) == (2, 1)
    assert world.bumps == 0
    # Let both walkers play out: the selected target stops on the approach tile.
    for _ in range(4 * STEP):
        world.run_frame_with_buttons([])
    assert coords(m, 1) == (1, 1)
    assert coords(m, 2) != (1, 1)


def test_steps_on_the_first_frame_the_target_reaches_the_approach_tile():
    api, server, m, world, emu, body = setup(lead=3, target_start=6)
    assert request(api, "/pokebench/intercept", body)[0] == 200
    marker = start(server)
    arrived = None
    stepped = None
    for frame in range(1, 200):
        before = coords(m, 1)
        emu.run_frame_with_buttons([marker])
        pressed = world.inputs[-1][1]
        if arrived is None and before == (1, 1):
            arrived = frame - 1
        if (
            stepped is None
            and pressed == ["DOWN"]
            and world.m.read(OBJECT_EVENTS + 0x18, 1)[0] == 1
        ):
            if coords(m, 0) == (2, 1):
                stepped = frame
        if receipt(api)["stopped"]:
            break
    assert arrived is not None and stepped is not None
    assert stepped - arrived <= 1


def test_turns_before_stepping_and_never_walks_while_turning():
    api, server, m, world, emu, body = setup(lead=3, target_start=4, facing=4)
    result = run(api, server, emu, body)
    assert result["reason"] == "entered"
    presses = [b for _, b in world.inputs if b]
    assert presses[0] == ["DOWN"]
    # The turn is a single frame; the walk begins only after the target arrives.
    assert presses.count(["DOWN"]) >= 2


def test_waits_without_input_until_the_condition_holds():
    api, server, m, world, emu, body = setup(lead=3, target_start=4, facing=1)
    assert request(api, "/pokebench/intercept", body)[0] == 200
    marker = start(server)
    for _ in range(STEP):
        emu.run_frame_with_buttons([marker])
    assert all(b == [] for _, b in world.inputs)
    assert receipt(api)["phase"] == "waiting"


def test_frame_budget_when_the_target_never_arrives():
    api, server, m, world, emu, body = setup(lead=0, target_start=4, facing=1)
    world.walkers.clear()
    result = run(api, server, emu, {**body, "max_frames": 40})
    assert result["reason"] == "frame budget"
    assert result["stopped"] is True
    assert coords(m, 0) == (2, 0)
    assert server.action_frames_remaining == 1


@pytest.mark.parametrize(
    "hazard",
    [
        "lock",
        "map",
        "target",
        "identity",
        "wall",
        "script",
        "moved",
        "elevation",
        "save",
        "avatar",
        "warp",
        "events",
        "trigger-pointer",
    ],
)
def test_every_frame_revalidates_controls_target_and_tile(hazard):
    api, server, m, world, emu, body = setup(lead=0, target_start=6, facing=1)
    world.walkers.clear()
    assert request(api, "/pokebench/intercept", body)[0] == 200
    marker = start(server)
    emu.run_frame_with_buttons([marker])
    if hazard == "lock":
        m.put(FIELD_LOCK, b"\x01")
    if hazard == "map":
        m.put(0x02025004, bytes([0, 9]))
    if hazard == "target":
        m.put(OBJECT_EVENTS + 0x24, b"\x00")
    if hazard == "identity":
        m.put(OBJECT_EVENTS + 0x24 + 8, b"\x07")
    if hazard == "wall":
        tile(m, 2, 1, 0x3400)
    if hazard == "script":
        m.put(0x08501002, b"\x01")
        m.put(0x0850100C, struct.pack("<I", 0x08502000))
        m.put(0x08502000, struct.pack("<hhBxHH2xI", 2, 1, 3, 0x4000, 0, 0x08503000))
    if hazard == "save":
        m.put(0x03005D8C, struct.pack("<I", 0))
    if hazard == "avatar":
        m.put(0x02037590 + 5, bytes([16]))
    if hazard == "warp":
        m.put(0x08501001, b"\x01")
        m.put(0x08501008, struct.pack("<I", 0x08504000))
        m.put(0x08504000, struct.pack("<hhBBBB", 2, 1, 0, 0, 9, 0))
    if hazard == "events":
        m.put(0x02037318 + 4, struct.pack("<I", 0))
    if hazard == "trigger-pointer":
        m.put(0x08501002, b"\x01")
        m.put(0x0850100C, struct.pack("<I", 0))
    if hazard == "elevation":
        m.put(OBJECT_EVENTS + 0xB, b"\x44")
    if hazard == "moved":
        m.put(OBJECT_EVENTS + 0x10, struct.pack("<hh", 4 + 7, 0 + 7))
    if hazard in ("wall", "script", "warp", "events", "trigger-pointer"):
        world.walkers[1] = 6
        for _ in range(3 * STEP):
            emu.run_frame_with_buttons([marker])
            if receipt(api)["stopped"]:
                break
    else:
        emu.run_frame_with_buttons([marker])
    result = receipt(api)
    assert result["stopped"] is True
    assert result["reason"] != "entered"
    assert coords(m, 0) != (2, 1)
    assert all(b == [] for _, b in world.inputs)


def test_other_queue_input_interrupts_a_started_intercept():
    api, server, m, world, emu, body = setup(lead=0, target_start=4, facing=1)
    world.walkers.clear()
    assert request(api, "/pokebench/intercept", body)[0] == 200
    emu.run_frame_with_buttons([start(server)])
    emu.run_frame_with_buttons(["A"])
    assert receipt(api)["reason"] == "queue interrupted"


def test_queue_busy_duplicate_unknown_and_cancel():
    api, server, m, world, emu, body = setup()
    server.current_action = "A"
    assert request(api, "/pokebench/intercept", body)[0] == 409
    server.current_action = None
    assert request(api, "/pokebench/intercept", body)[0] == 200
    assert request(api, "/pokebench/intercept", {**body, "id": "other"})[0] == 409
    server.action_queue.clear()
    assert request(api, "/pokebench/intercept/pin/cancel", {})[0] == 200
    assert receipt(api)["reason"] == "cancelled"
    assert request(api, "/pokebench/intercept", body)[0] == 409
    assert get(api, "/pokebench/intercept/nope")[0] == 404
    assert request(api, "/pokebench/intercept/nope/cancel", {})[0] == 404
    with pytest.raises(ValueError):
        emu.run_frame_with_buttons([PREFIX + "nope"])


@pytest.mark.parametrize(
    "change",
    [
        {"wait": {"x": 0, "y": 0}},
        {"approach": {"x": 0, "y": 0}},
        {"approach": {"x": 2, "y": 0}},
        {"map_id": [1, 999]},
        {"id": "bad:marker"},
        {"elevation": 0},
        {"max_frames": MAX_FRAMES + 1},
        {"held_buttons": ["B"]},
    ],
)
def test_request_geometry_and_bounds_are_validated(change):
    api, server, m, world, emu, body = setup()
    assert request(api, "/pokebench/intercept", {**body, **change})[0] == 422


def test_no_input_while_the_player_is_still_moving():
    api, server, m, world, emu, body = setup(lead=0, target_start=4, facing=4)
    world.walkers.clear()
    m.put(OBJECT_EVENTS, b"\x41")
    world.player_busy = 6
    assert request(api, "/pokebench/intercept", body)[0] == 200
    marker = start(server)
    for _ in range(5):
        emu.run_frame_with_buttons([marker])
    assert all(b == [] for _, b in world.inputs)
    assert receipt(api)["stopped"] is False


SWITCH = "moving-npc-intercept-v1"


def test_switch_is_a_default_off_server_feature():
    from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


@pytest.mark.parametrize("enabled", [True, False])
def test_travel_installs_the_intercept_route_only_when_on(enabled):
    from pokebench_env.travel import install_travel

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            pass

    api = FastAPI()
    server = SimpleNamespace(
        action_queue=[], action_frames_remaining=0, current_action=None, release_frames_remaining=0
    )
    install_travel(api, Emulator, server, fixture().read, intercept=enabled)
    paths = {getattr(route, "path", None) for route in api.routes}
    assert ("/pokebench/intercept" in paths) is enabled


def test_a_step_the_game_refuses_ends_as_blocked():
    api, server, m, world, emu, body = setup(lead=0, target_start=6, facing=1)
    world.refuse = True
    result = run(api, server, emu, body)
    assert result["reason"] == "blocked"
    assert coords(m, 0) == (2, 0)


def test_cancel_after_a_stop_keeps_the_original_reason():
    api, server, m, world, emu, body = setup(lead=0, target_start=4, facing=1)
    world.walkers.clear()
    run(api, server, emu, {**body, "max_frames": 5})
    assert request(api, "/pokebench/intercept/pin/cancel", {})[0] == 200
    assert receipt(api)["reason"] == "frame budget"


def watch_body(**change):
    return {
        "id": "look",
        "map_id": [1, 0],
        "target_local_id": 1,
        "target_slot": 1,
        "max_frames": MAX_FRAMES,
        **change,
    }


def watch(api, server, emu, body, frames=MAX_FRAMES + 2):
    assert request(api, "/pokebench/intercept/watch", body)[0] == 200
    marker = start(server)
    for _ in range(frames):
        emu.run_frame_with_buttons([marker])
        if receipt(api, body["id"])["stopped"]:
            break
    return receipt(api, body["id"])


def test_watch_records_each_one_tile_step_until_the_walk_repeats_without_input():
    api, server, m, world, emu, body = setup(lead=3, target_start=0)
    result = watch(api, server, emu, watch_body())
    assert result["reason"] == "loop closed"
    steps = [(e["from"]["x"], e["from"]["y"], e["to"]["x"], e["to"]["y"]) for e in result["edges"]]
    assert steps == [(*RING[i], *RING[(i + 1) % 8]) for i in range(8)]
    assert all(b == [] for _, b in world.inputs)
    assert result["frames"] <= 9 * STEP + 1


def test_watch_stops_when_the_target_stands_still_or_jumps():
    api, server, m, world, emu, body = setup(lead=0, target_start=0)
    world.walkers.clear()
    assert watch(api, server, emu, watch_body())["reason"] == "target still"
    api, server, m, world, emu, body = setup(lead=0, target_start=0)
    world.walkers.clear()
    assert request(api, "/pokebench/intercept/watch", watch_body())[0] == 200
    marker = start(server)
    emu.run_frame_with_buttons([marker])
    m.put(OBJECT_EVENTS + 0x24 + 0x10, struct.pack("<hh", 3 + 7, 3 + 7))
    emu.run_frame_with_buttons([marker])
    assert receipt(api, "look")["reason"] == "target jumped"


@pytest.mark.parametrize("hazard", ["lock", "target", "map", "budget"])
def test_watch_stops_on_lost_control_target_or_budget(hazard):
    api, server, m, world, emu, body = setup(lead=0, target_start=0)
    change = {"max_frames": 3} if hazard == "budget" else {}
    assert request(api, "/pokebench/intercept/watch", watch_body(**change))[0] == 200
    marker = start(server)
    emu.run_frame_with_buttons([marker])
    if hazard == "lock":
        m.put(FIELD_LOCK, b"\x01")
    if hazard == "target":
        m.put(OBJECT_EVENTS + 0x24, b"\x00")
    if hazard == "map":
        m.put(0x02025004, bytes([0, 9]))
    for _ in range(5):
        emu.run_frame_with_buttons([marker])
    result = receipt(api, "look")
    assert result["stopped"] is True
    assert (
        result["reason"]
        == {
            "lock": "field input unavailable",
            "target": "target left",
            "map": "map changed",
            "budget": "frame budget",
        }[hazard]
    )


def test_watch_shares_the_input_queue_admission():
    api, server, m, world, emu, body = setup()
    assert request(api, "/pokebench/intercept/watch", watch_body())[0] == 200
    assert request(api, "/pokebench/intercept", body)[0] == 409
    assert request(api, "/pokebench/intercept/watch", watch_body(id="again"))[0] == 409
    assert request(api, "/pokebench/intercept/watch", watch_body(target_slot=16))[0] == 422
