import json
import struct
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from test_human import request
from test_live_map import loaded, obj, tile
from test_running import fixture
from test_view import get

from pokebench_env.intercept import MAX_FRAMES, install_intercept
from pokebench_env.running import OBJECT_EVENTS

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
