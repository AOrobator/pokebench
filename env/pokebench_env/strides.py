"""Frame-owned execution of an explicit, bounded, plain-floor (optionally tall-grass) corridor."""

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

PREFIX = "@POKEBENCH_STRIDE:"
MAX_FRAMES = 224
MAX_TILES = 8
# MB_TALL_GRASS: grass the game lets the player run through (long grass is a different behavior).
TALL_GRASS = 0x02
DELTAS = {(0, -1): "UP", (0, 1): "DOWN", (-1, 0): "LEFT", (1, 0): "RIGHT"}


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    x: int = Field(ge=0, le=255)
    y: int = Field(ge=0, le=255)

    def pair(self) -> tuple[int, int]:
        return self.x, self.y


class StrideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9-]+$")
    map_id: list[int] = Field(min_length=2, max_length=2)
    origin: Point
    path: list[Point] = Field(min_length=1, max_length=MAX_TILES)
    elevation: int = Field(ge=1, le=14)
    automatic_running: bool
    # grass-strides-v1: the corridor may include tall grass; absent means plain floor only.
    tall_grass: bool = False

    @model_validator(mode="after")
    def corridor(self) -> "StrideRequest":
        if any(not 0 <= v <= 255 for v in self.map_id):
            raise ValueError("invalid map identity")
        previous = self.origin
        delta = (self.path[0].x - previous.x, self.path[0].y - previous.y)
        if delta not in DELTAS:
            raise ValueError("stride must be cardinal and contiguous")
        for tile in self.path:
            if (tile.x - previous.x, tile.y - previous.y) != delta:
                raise ValueError("stride must stop before a bend")
            previous = tile
        return self


class QueuedStride(Protocol):
    action_queue: list[dict[str, object]]
    action_frames_remaining: int
    current_action: str | None
    release_frames_remaining: int


@dataclass
class Stride:
    request: StrideRequest
    completed: int = 0
    frames: int = 0
    idle: int = 0
    reason: str = "queued"
    stopped: bool = False
    started: bool = False

    def receipt(self) -> dict[str, object]:
        return {
            **self.request.model_dump(exclude=None if self.request.tall_grass else {"tall_grass"}),
            "completed": self.completed,
            "frames": self.frames,
            "reason": self.reason,
            "stopped": self.stopped,
        }


def _player(read: ReadMemory) -> tuple[int, tuple[int, int], tuple[int, int], bytes]:
    save = int.from_bytes(read(SAVE1, 4), "little")
    if not 0x02000000 <= save <= 0x02040000 - 0x159C:
        raise ValueError("unavailable save pointer")
    index = read(PLAYER_AVATAR + 5, 1)[0]
    if index >= 16:
        raise ValueError("unavailable player object")
    obj = read(OBJECT_EVENTS + index * 0x24, 0x24)
    if len(obj) != 0x24 or not obj[0] & 1 or not obj[2] & 1:
        raise ValueError("unavailable player object")
    x, y = struct.unpack_from("<hh", obj, 0x10)
    group, number = read(save + 4, 2)
    return save, (group, number), (x - MAP_OFFSET, y - MAP_OFFSET), obj


def _safe_next(
    read: ReadMemory, s: Stride, save: int, position: tuple[int, int], map_id: tuple[int, int]
) -> bool:
    target = s.request.path[s.completed].pair()
    local = read_local_map(read, position, map_id, radius=1)
    if local is None:
        return False
    points = {(t.x, t.y): t for t in local.tiles}
    floor = (0, TALL_GRASS) if s.request.tall_grass else (0,)
    for p in (position, target):
        t = points.get(p)
        if (
            t is None
            or t.collision != 0
            or t.behavior not in floor
            or t.elevation != s.request.elevation
        ):
            return False
    if any((x, y) == target for _, x, y in local.objects):
        return False
    if any((x, y) in (position, target) for x, y, _, _ in local.warps):
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
        and not any((t.x, t.y) in (position, target) for t in context.triggers)
        and context.dialogue is None
    )


def install_strides(
    api: FastAPI, emulator: type[FrameEmulator], server: QueuedStride, read: ReadMemory
) -> None:
    original = emulator.run_frame_with_buttons
    retained: OrderedDict[str, Stride] = OrderedDict()
    admission = Lock()
    active: Stride | None = None

    def stop(s: Stride, reason: str) -> list[str]:
        s.reason, s.stopped = reason, True
        # End the private queue marker on the next vendor tick, then release.
        # The pinned queue otherwise holds for its entire 224-frame ceiling.
        if server.current_action == PREFIX + s.request.id:
            server.action_frames_remaining = min(server.action_frames_remaining, 1)
        return []

    def advance(s: Stride) -> list[str]:
        s.frames += 1
        if s.frames >= MAX_FRAMES:
            return stop(s, "frame budget")
        try:
            native = read_running_permission(read)
            save, map_id, position, obj = _player(read)
            if list(map_id) != s.request.map_id:
                return stop(s, "map changed")
            if native.controllable is None or native.reason in (
                "battle",
                "external_owner",
                "field_controls_locked",
                "unavailable",
                "forced_or_transitioning",
                "not_on_foot",
            ):
                return stop(s, "field input unavailable")
            moving = bool(obj[0] & 2 or (obj[0] & 0x40 and not obj[0] & 0x80))
            if not s.started:
                if position != s.request.origin.pair() or moving or native.controllable is not True:
                    return stop(s, "origin changed or not stationary")
                s.started, s.reason = True, "executing"
            expected = (
                s.request.origin.pair()
                if s.completed == 0
                else s.request.path[s.completed - 1].pair()
            )
            next_position = s.request.path[s.completed].pair()
            if position not in (expected, next_position):
                return stop(s, "left planned corridor")
            if moving:
                return []
            if position == next_position:
                s.completed += 1
                s.idle = 0
                if s.completed == len(s.request.path):
                    return stop(s, "completed")
            else:
                s.idle += 1
                if s.idle > 32:
                    return stop(s, "no movement")
            if native.controllable is not True or obj[0xB] & 15 != s.request.elevation:
                return stop(s, "field input or elevation changed")
            if not _safe_next(read, s, save, position, map_id):
                return stop(s, "corridor changed or unsafe")
            target = s.request.path[s.completed]
            direction = DELTAS[(target.x - position[0], target.y - position[1])]
            return (
                [direction, "B"]
                if s.request.automatic_running and native.permitted is True
                else [direction]
            )
        except (ValueError, OSError, IndexError, KeyError, struct.error):
            return stop(s, "native validation unavailable")

    def step(self: FrameEmulator, buttons: list[str]) -> None:
        nonlocal active
        if len(buttons) == 1 and buttons[0].startswith(PREFIX):
            s = retained.get(buttons[0][len(PREFIX) :])
            if s is None:
                raise ValueError("unrecognized private stride")
            actual = [] if s.stopped else advance(s)
            original(self, actual)
        else:
            if active is not None and not active.stopped and active.started:
                stop(active, "queue interrupted")
            original(self, buttons)

    emulator.run_frame_with_buttons = step

    @api.post("/pokebench/stride")
    def submit(body: StrideRequest) -> dict[str, object]:
        nonlocal active
        with admission:
            if body.id in retained:
                raise HTTPException(409, "duplicate stride id")
            if (
                server.action_queue
                or server.current_action is not None
                or server.action_frames_remaining
                or server.release_frames_remaining
                or (active is not None and not active.stopped)
            ):
                raise HTTPException(409, "game input queue busy")
            active = Stride(body)
            retained[body.id] = active
            while len(retained) > 64:
                retained.popitem(last=False)
            server.action_queue.append(
                {
                    "button": PREFIX + body.id,
                    "speed": "fast",
                    "hold_frames": MAX_FRAMES,
                    "release_frames": 8,
                }
            )
        return {"status": "success", "actions_added": 1}

    @api.get("/pokebench/stride/{identity}")
    def receipt(identity: str) -> dict[str, object]:
        s = retained.get(identity)
        if s is None:
            raise HTTPException(404, "unknown stride")
        return s.receipt()

    @api.post("/pokebench/stride/{identity}/cancel")
    def cancel(identity: str) -> dict[str, object]:
        with admission:
            s = retained.get(identity)
            if s is None:
                raise HTTPException(404, "unknown stride")
            if not s.stopped:
                stop(s, "cancelled")
            return s.receipt()
