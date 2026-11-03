"""Frame-owned step into a walking object's path (moving-npc-intercept-v1).

pret731ad5bf event_object_movement.c MoveNextDirectionInSequence: a walk-sequence
object whose next tile collides walks in place instead, so a player who steps onto
that tile pins it. DoesObjectCollideWithObjectAt tests current and previous
coordinates, so the entered tile must be clear of both for every object. The window
between a leading walker and the selected one lasts about one step (16 frames),
which only a per-frame owner can hit.
"""

import struct
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from typing import Protocol

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from pokebench_env.action_history import FrameEmulator
from pokebench_env.game_screen import ReadMemory
from pokebench_env.live_map import MAP_HEADER, MAP_OFFSET, read_local_map
from pokebench_env.running import OBJECT_EVENTS, PLAYER_AVATAR, SAVE1, read_running_permission
from pokebench_env.world_context import read_world_context, rom_pointer

PREFIX = "@POKEBENCH_INTERCEPT:"
MAX_FRAMES = 480
# A blocked step leaves the player on the wait tile; give up after this many idle frames.
BLOCKED_FRAMES = 24
TALL_GRASS = 0x02
DELTAS = {(0, -1): "UP", (0, 1): "DOWN", (-1, 0): "LEFT", (1, 0): "RIGHT"}
# include/constants/event_objects.h DIR_SOUTH, DIR_NORTH, DIR_WEST, DIR_EAST.
FACING = {"DOWN": 1, "UP": 2, "LEFT": 3, "RIGHT": 4}
UNAVAILABLE = (
    "battle",
    "external_owner",
    "field_controls_locked",
    "unavailable",
    "forced_or_transitioning",
    "not_on_foot",
)


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    x: int = Field(ge=0, le=255)
    y: int = Field(ge=0, le=255)

    def pair(self) -> tuple[int, int]:
        return self.x, self.y


def _delta(a: Point, b: Point) -> tuple[int, int]:
    return b.x - a.x, b.y - a.y


class InterceptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9-]+$")
    map_id: list[int] = Field(min_length=2, max_length=2)
    wait: Point
    enter: Point
    approach: Point
    target_local_id: int = Field(ge=1, le=255)
    target_slot: int = Field(ge=0, le=15)
    elevation: int = Field(ge=1, le=14)
    max_frames: int = Field(ge=1, le=MAX_FRAMES)

    @model_validator(mode="after")
    def geometry(self) -> "InterceptRequest":
        if any(not 0 <= v <= 255 for v in self.map_id):
            raise ValueError("invalid map identity")
        if _delta(self.wait, self.enter) not in DELTAS:
            raise ValueError("the wait tile must be next to the entered tile")
        if _delta(self.approach, self.enter) not in DELTAS:
            raise ValueError("the approach tile must be next to the entered tile")
        if self.approach == self.wait:
            raise ValueError("the approach tile cannot be the wait tile")
        return self


class QueuedIntercept(Protocol):
    action_queue: list[dict[str, object]]
    action_frames_remaining: int
    current_action: str | None
    release_frames_remaining: int


@dataclass
class Intercept:
    request: InterceptRequest
    frames: int = 0
    idle: int = 0
    phase: str = "queued"
    reason: str = "queued"
    stopped: bool = False

    def receipt(self) -> dict[str, object]:
        return {
            **self.request.model_dump(),
            "frames": self.frames,
            "phase": self.phase,
            "reason": self.reason,
            "stopped": self.stopped,
        }


def _objects(read: ReadMemory) -> list[bytes]:
    raw = read(OBJECT_EVENTS, 16 * 0x24)
    return [raw[i * 0x24 : (i + 1) * 0x24] for i in range(16)]


def _coords(body: bytes, offset: int) -> tuple[int, int]:
    x, y = struct.unpack_from("<hh", body, offset)
    return x - MAP_OFFSET, y - MAP_OFFSET


def _moving(body: bytes) -> bool:
    return bool(body[0] & 2 or (body[0] & 0x40 and not body[0] & 0x80))


def _enterable(
    read: ReadMemory,
    save: int,
    position: tuple[int, int],
    enter: tuple[int, int],
    map_id: tuple[int, int],
    elevation: int,
) -> bool:
    local = read_local_map(read, position, map_id, radius=1)
    if local is None:
        return False
    points = {(t.x, t.y): t for t in local.tiles}
    tile = points.get(enter)
    if (
        tile is None
        or tile.collision != 0
        or tile.behavior not in (0, TALL_GRASS)
        or tile.elevation != elevation
    ):
        return False
    if any((x, y) in (position, enter) for x, y, _, _ in local.warps):
        return False
    events = int.from_bytes(read(MAP_HEADER + 4, 4), "little")
    if not rom_pointer(events):
        return False
    header = read(events, 16)
    if len(header) != 16:
        return False
    for count, offset in ((header[1], 8), (header[2], 12)):
        if count and not rom_pointer(int.from_bytes(header[offset : offset + 4], "little")):
            return False
    context = read_world_context(read, position, map_id, save, lambda _: "")
    return (
        context is not None
        and not any((t.x, t.y) in (position, enter) for t in context.triggers)
        and context.dialogue is None
    )


def install_intercept(
    api: FastAPI, emulator: type[FrameEmulator], server: QueuedIntercept, read: ReadMemory
) -> None:
    inner = emulator.run_frame_with_buttons
    retained: OrderedDict[str, Intercept] = OrderedDict()
    admission = Lock()
    active: Intercept | None = None

    def stop(s: Intercept, reason: str) -> list[str]:
        s.reason, s.stopped = reason, True
        if server.current_action == PREFIX + s.request.id:
            server.action_frames_remaining = min(server.action_frames_remaining, 1)
        return []

    def advance(s: Intercept) -> list[str]:
        s.frames += 1
        if s.frames > s.request.max_frames:
            return stop(s, "frame budget")
        try:
            r = s.request
            native = read_running_permission(read)
            save = int.from_bytes(read(SAVE1, 4), "little")
            if not 0x02000000 <= save <= 0x02040000 - 0x159C:
                return stop(s, "native validation unavailable")
            if list(read(save + 4, 2)) != r.map_id:
                return stop(s, "map changed")
            if native.controllable is None or native.reason in UNAVAILABLE:
                return stop(s, "field input unavailable")
            index = read(PLAYER_AVATAR + 5, 1)[0]
            bodies = _objects(read)
            if index >= 16 or not bodies[index][0] & 1 or not bodies[index][2] & 1:
                return stop(s, "native validation unavailable")
            player = bodies[index]
            position = _coords(player, 0x10)
            target = bodies[r.target_slot]
            if (
                not target[0] & 1
                or target[2] & 1
                or target[8] != r.target_local_id
                or [target[10], target[9]] != r.map_id
            ):
                return stop(s, "target left")
            direction = DELTAS[_delta(r.wait, r.enter)]
            if position == r.enter.pair():
                if _moving(player):
                    return []
                s.phase = "entered"
                return stop(s, "entered")
            if position != r.wait.pair():
                return stop(s, "left the wait tile")
            if s.phase == "stepping":
                if _moving(player):
                    return [direction]
                s.idle += 1
                if s.idle > BLOCKED_FRAMES:
                    return stop(s, "blocked")
                return [direction]
            if _moving(player) or native.controllable is not True:
                return []
            if player[0xB] & 15 != r.elevation:
                return stop(s, "field input or elevation changed")
            if player[0x18] & 15 != FACING[direction]:
                s.phase = "facing"
                # One frame turns a player whose facing differs (PlayerTurnInPlace) without
                # walking; the turn finishes before the field takes input again.
                return [direction]
            s.phase = "waiting"
            if _coords(target, 0x10) != r.approach.pair():
                return []
            enter = r.enter.pair()
            if any(
                i != index and body[0] & 1 and enter in (_coords(body, 0x10), _coords(body, 0x14))
                for i, body in enumerate(bodies)
            ):
                return []
            if not _enterable(read, save, position, enter, (r.map_id[0], r.map_id[1]), r.elevation):
                return stop(s, "entered tile changed or unsafe")
            s.phase = "stepping"
            return [direction]
        except (ValueError, OSError, IndexError, KeyError, struct.error):
            return stop(s, "native validation unavailable")

    def step(self: FrameEmulator, buttons: list[str]) -> None:
        if len(buttons) == 1 and buttons[0].startswith(PREFIX):
            s = retained.get(buttons[0][len(PREFIX) :])
            if s is None:
                raise ValueError("unrecognized private intercept")
            inner(self, [] if s.stopped else advance(s))
        else:
            if active is not None and not active.stopped and active.phase != "queued":
                stop(active, "queue interrupted")
            inner(self, buttons)

    emulator.run_frame_with_buttons = step

    @api.post("/pokebench/intercept")
    def submit(body: InterceptRequest) -> dict[str, object]:
        nonlocal active
        with admission:
            if body.id in retained:
                raise HTTPException(409, "duplicate intercept id")
            if (
                server.action_queue
                or server.current_action is not None
                or server.action_frames_remaining
                or server.release_frames_remaining
                or (active is not None and not active.stopped)
            ):
                raise HTTPException(409, "game input queue busy")
            active = Intercept(body)
            retained[body.id] = active
            while len(retained) > 64:
                retained.popitem(last=False)
            server.action_queue.append(
                {
                    "button": PREFIX + body.id,
                    "speed": "fast",
                    "hold_frames": body.max_frames + 1,
                    "release_frames": 8,
                }
            )
        return {"status": "success", "actions_added": 1}

    @api.get("/pokebench/intercept/{identity}")
    def receipt(identity: str) -> dict[str, object]:
        s = retained.get(identity)
        if s is None:
            raise HTTPException(404, "unknown intercept")
        return s.receipt()

    @api.post("/pokebench/intercept/{identity}/cancel")
    def cancel(identity: str) -> dict[str, object]:
        with admission:
            s = retained.get(identity)
            if s is None:
                raise HTTPException(404, "unknown intercept")
            if not s.stopped:
                stop(s, "cancelled")
            return s.receipt()
