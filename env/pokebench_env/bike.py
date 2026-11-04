"""The bike: ownership, the SELECT registration, riding, and the frame-owned steps that change them.

bike-register-v1 registers an owned bike to SELECT through the game's own menus, one real button
at a time: START, BAG, the KEY ITEMS pocket, the bike, REGISTER (item_menu.c ItemMenu_Register
sets SaveBlock1.registeredItem). bike-auto-mount-v1 presses SELECT to get on or off
(field_control_avatar.c: pressedSelectButton -> UseRegisteredKeyItemOnField; item_use.c
ItemUseOutOfBattle_Bike). Every wait is counted in emulated frames on native state.
"""

import struct
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from threading import Lock
from typing import Protocol

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from pokebench_env.action_history import FrameEmulator
from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.running import (
    MAP_HEADER,
    NO_RUNNING_TILES,
    PLAYER_AVATAR,
    SAVE1,
    RunningPermission,
    read_running_permission,
)

REGISTER_SWITCH = "bike-register-v1"
MOUNT_SWITCH = "bike-auto-mount-v1"
REGISTER_PREFIX = "@POKEBENCH_BIKE_REGISTER:"
TOGGLE_PREFIX = "@POKEBENCH_BIKE_TOGGLE:"
# include/constants/items.h
BIKES = {259: "MACH BIKE", 272: "ACRO BIKE"}
# include/global.h SaveBlock1: registeredItem, bagPocket_KeyItems (30 slots of id, quantity).
REGISTERED = 0x496
KEY_ITEMS, KEY_SLOTS = 0x5D8, 30
MACH_FLAG, ACRO_FLAG, WATER_FLAGS = 1 << 1, 1 << 2, (1 << 3) | (1 << 4)
OVERWORLD_CB2 = 0x08085E5D
# bag-pocket-truth-v1's pocket order (include/constants/item.h); KEY ITEMS is pocket 4.
POCKETS = ("ITEMS", "POKE BALLS", "TMS HMS", "BERRIES", "KEY ITEMS")
KEY_POCKET = 4
# Registration: START menu, about 55 frames of bag fade, pocket slides, and the way back.
REGISTER_FRAMES = 1200
# One SELECT: the bike mounts in about 21 frames.
TOGGLE_FRAMES = 120
# A press the menu does not answer within this many frames is pressed again, at most PRESS_TRIES
# times in all (a list can drop the press made on the frame its pocket slide ends).
RESPONSE_FRAMES = 30
PRESS_TRIES = 3
# A screen that stays without input this long (the bag fades in over about 55) ends the attempt.
STILL_FRAMES = 150
MARKER_FRAMES = 240


@dataclass(frozen=True)
class BikeState:
    owned: tuple[int, ...]
    registered: int
    riding: str | None
    allow_cycling: bool

    def json(self) -> dict[str, object]:
        return {**asdict(self), "owned": list(self.owned)}


def _save1(read: ReadMemory) -> int:
    save = int.from_bytes(read(SAVE1, 4), "little")
    if not 0x02000000 <= save <= 0x02040000 - (KEY_ITEMS + 4 * KEY_SLOTS):
        raise ValueError("unavailable save pointer")
    return save


def key_items(read: ReadMemory, save: int) -> list[int]:
    raw = read(save + KEY_ITEMS, 4 * KEY_SLOTS)
    ids = [struct.unpack_from("<H", raw, 4 * i)[0] for i in range(KEY_SLOTS)]
    return [i for i in ids if i]


def read_bike(read: ReadMemory) -> BikeState | None:
    try:
        save = _save1(read)
        owned = tuple(i for i in key_items(read, save) if i in BIKES)
        registered = struct.unpack("<H", read(save + REGISTERED, 2))[0]
        flags = read(PLAYER_AVATAR, 1)[0]
        header = read(MAP_HEADER, 0x1C)
        if len(header) != 0x1C:
            raise ValueError("unavailable map header")
    except (ValueError, IndexError, struct.error):
        return None
    riding = "MACH BIKE" if flags & MACH_FLAG else "ACRO BIKE" if flags & ACRO_FLAG else None
    return BikeState(owned, registered, riding, bool(header[0x1A] & 1))


def bike_line(bike: BikeState | None, *, register: bool, mount: bool) -> str | None:
    """One bounded readout line: the bike on SELECT, and whether the player rides it."""
    if bike is None:
        return None
    on_select = BIKES.get(bike.registered) if register else None
    riding = bike.riding if mount else None
    if on_select is None and riding is None:
        return None
    if on_select is None:
        return f"Bike: riding the {riding}"
    return f"Bike: {on_select} registered to SELECT" + ("; riding it" if riding else "")


@dataclass(frozen=True)
class MenuView:
    """What the registration reads from the screen each frame."""

    phase: str
    ready: bool
    pocket: int | None = None
    index: int | None = None
    item: int | None = None
    selected: str | None = None
    options: tuple[str, ...] = ()


def read_view(read: ReadMemory) -> MenuView:
    from pokebench_env.menus import read_menu_family

    callback = int.from_bytes(read(GMAIN + 4, 4), "little")
    try:
        ui = read_menu_family(read, callback, truth=True, bag_pocket_truth=True)
    except ValueError:
        return MenuView("unreadable", False)
    if ui is None:
        return MenuView("field" if callback == OVERWORLD_CB2 else f"screen {callback:#x}", False)
    d = ui.details or {}
    pocket = d.get("pocket")
    index = d.get("list_item_id", d.get("selected_index"))
    item = d.get("item_id")
    options = d.get("options")
    return MenuView(
        ui.phase,
        bool(ui.ready),
        POCKETS.index(pocket) if isinstance(pocket, str) and pocket in POCKETS else None,
        index if isinstance(index, int) else None,
        item if isinstance(item, int) else None,
        ui.selected,
        tuple(o for o in options if isinstance(o, str)) if isinstance(options, list) else (),
    )


def _field_free(native: RunningPermission) -> bool:
    return native.controllable is True and native.reason not in (
        "battle",
        "external_owner",
        "field_controls_locked",
        "unavailable",
    )


def _toward(current: int, target: int, less: str, more: str) -> str:
    return more if target > current else less


def register_step(view: MenuView, item: int, registered: int, keys: list[int]) -> str:
    """The one button that moves registration on from this screen, or a verdict.

    Returns a button, "wait", "done" or "abort: reason".
    """
    finished = registered == item
    if view.phase == "field":
        return "done" if finished else "START"
    if not view.ready:
        return "wait"
    if view.phase == "start_menu":
        if finished:
            return "B"
        if "BAG" not in view.options or view.index is None:
            return "abort: the START menu has no BAG"
        target = view.options.index("BAG")
        return "A" if view.index == target else _toward(view.index, target, "UP", "DOWN")
    if view.phase == "bag_menu":
        if finished:
            return "B"
        if view.pocket is None:
            return "abort: the bag pocket is unreadable"
        if view.pocket != KEY_POCKET:
            # The pockets wrap; take the shorter way to KEY ITEMS.
            return "RIGHT" if (KEY_POCKET - view.pocket) % len(POCKETS) <= 2 else "LEFT"
        if item not in keys:
            return "abort: the bike is not in KEY ITEMS"
        if view.item == item:
            return "A"
        if view.index is None:
            return "abort: the KEY ITEMS cursor is unreadable"
        return _toward(view.index, keys.index(item), "UP", "DOWN")
    if view.phase == "bag_context_menu":
        if finished or view.item != item:
            return "B"
        if "REGISTER" not in view.options or view.index is None:
            return "abort: the bike's menu has no REGISTER"
        # The KEY ITEMS action menu is two columns: USE REGISTER / (empty) CANCEL.
        target = view.options.index("REGISTER")
        if view.index == target:
            return "A"
        if view.index % 2 != target % 2:
            return _toward(view.index % 2, target % 2, "LEFT", "RIGHT")
        return _toward(view.index // 2, target // 2, "UP", "DOWN")
    return f"abort: unexpected screen {view.phase}"


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9-]+$")
    item: int

    def model_post_init(self, _context: object) -> None:
        if self.item not in BIKES:
            raise ValueError("not a bike")


class ToggleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9-]+$")
    ride: bool


@dataclass
class Owned:
    """A frame-owned bike action: its request, frame count, presses and terminal reason."""

    request: RegisterRequest | ToggleRequest
    budget: int
    frames: int = 0
    presses: list[str] = field(default_factory=list)
    reason: str = "queued"
    stopped: bool = False
    # The screen a press was made on, until the screen answers it.
    pending: MenuView | None = None
    pending_frames: int = 0
    tries: int = 0
    # A registration that has gone wrong closes the START menu and the bag before stopping.
    closing: str | None = None
    opened: bool = False
    # Frames in a row on a screen that takes no input.
    still: int = 0

    def receipt(self) -> dict[str, object]:
        return {
            **self.request.model_dump(),
            "frames": self.frames,
            "presses": self.presses,
            "reason": self.reason,
            "stopped": self.stopped,
        }


class QueuedBike(Protocol):
    action_queue: list[dict[str, object]]
    action_frames_remaining: int
    current_action: str | None
    release_frames_remaining: int


def install_bike(
    api: FastAPI,
    emulator: type[FrameEmulator],
    server: QueuedBike,
    read: ReadMemory,
    *,
    register: bool,
    toggle: bool,
    view: Callable[[ReadMemory], MenuView] = read_view,
) -> None:
    original = emulator.run_frame_with_buttons
    retained: OrderedDict[str, Owned] = OrderedDict()
    admission = Lock()
    active: Owned | None = None

    def marker(s: Owned) -> str:
        prefix = REGISTER_PREFIX if isinstance(s.request, RegisterRequest) else TOGGLE_PREFIX
        return prefix + s.request.id

    def stop(s: Owned, reason: str) -> list[str]:
        s.reason, s.stopped = reason, True
        own = marker(s)
        server.action_queue[:] = [a for a in server.action_queue if a.get("button") != own]
        if server.current_action == own:
            server.action_frames_remaining = min(server.action_frames_remaining, 1)
        return []

    def press(s: Owned, button: str, screen: MenuView, *, again: bool = False) -> list[str]:
        s.presses.append(button)
        s.pending, s.pending_frames = screen, 0
        s.tries = s.tries + 1 if again else 1
        return [button]

    def answered(s: Owned, screen: MenuView) -> bool | str:
        """True once the screen answers the press; a button to press again; False to wait."""
        if s.pending is None:
            return True
        if screen != s.pending:
            s.pending = None
            return True
        s.pending_frames += 1
        if s.pending_frames > RESPONSE_FRAMES:
            last = s.presses[-1]
            if s.tries < PRESS_TRIES:
                return last
            s.pending = None
            s.closing = s.closing or f"no response to {last} on {screen.phase}"
        return False

    def registration(s: Owned, item: int) -> list[str]:
        save = _save1(read)
        registered = struct.unpack("<H", read(save + REGISTERED, 2))[0]
        screen = view(read)
        answer = answered(s, screen)
        if isinstance(answer, str):
            return press(s, answer, screen, again=True)
        if not answer:
            return []
        native = read_running_permission(read)
        # The overworld also owns the frames while a menu fades out, with field controls locked.
        on_field = screen.phase == "field" and _field_free(native)
        if s.closing is not None:
            # Back out to the field with B; never press anything else once something went wrong.
            if on_field:
                return stop(s, s.closing)
            if not screen.ready:
                s.still += 1
                return stop(s, s.closing) if s.still > STILL_FRAMES else []
            s.still = 0
            if screen.phase in ("start_menu", "bag_menu", "bag_context_menu"):
                return press(s, "B", screen)
            return stop(s, s.closing)
        if screen.phase == "field" and not on_field and not s.opened:
            return stop(s, "field input unavailable")
        if screen.ready or on_field:
            s.still = 0
        else:
            s.still += 1
            if s.still > STILL_FRAMES:
                where = (
                    "the field with controls locked" if screen.phase == "field" else screen.phase
                )
                return stop(s, f"stuck on {where}")
            return []
        if on_field and s.opened and registered != item:
            return stop(s, "the menus closed before the bike was registered")
        step = register_step(screen, item, registered, key_items(read, save))
        if step == "done":
            return stop(s, "registered")
        if step == "wait":
            return []
        if step.startswith("abort: "):
            s.closing = step[len("abort: ") :]
            return registration(s, item)
        if step == "START":
            s.opened = True
        return press(s, step, screen)

    def toggling(s: Owned, ride: bool) -> list[str]:
        native = read_running_permission(read)
        # Read directly: the permission leaves avatar_flags unread while the field is locked,
        # which is exactly when SELECT is being handled.
        flags = read(PLAYER_AVATAR, 1)[0]
        riding = bool(flags & (MACH_FLAG | ACRO_FLAG))
        screen = MenuView("field" if _field_free(native) else native.reason, _field_free(native))
        if s.closing is not None:
            # The game printed why it refused; one B closes that message.
            if s.presses[-1] != "B":
                return press(s, "B", screen)
            return stop(s, s.closing) if screen.ready else []
        if s.pending is not None:
            if riding == ride:
                s.pending = None
            else:
                s.pending_frames += 1
                if s.pending_frames > RESPONSE_FRAMES:
                    s.pending, s.closing = None, "refused"
                return []
        if s.presses:
            return stop(s, "riding" if ride else "on foot") if screen.ready else []
        if riding == ride:
            return stop(s, "already riding" if ride else "already on foot")
        if not screen.ready or flags & WATER_FLAGS:
            return stop(s, "field input unavailable")
        bike = read_bike(read)
        if bike is None or bike.registered not in bike.owned:
            return stop(s, "no bike registered to SELECT")
        if ride and not bike.allow_cycling:
            return stop(s, "this map does not allow cycling")
        # bike.c IsBikingDisallowedByPlayer: the tile underfoot must allow running.
        if ride and native.metatile in NO_RUNNING_TILES:
            return stop(s, "this tile does not allow cycling")
        return press(s, "SELECT", screen)

    def advance(s: Owned) -> list[str]:
        s.frames += 1
        if s.frames >= s.budget:
            return stop(s, "frame budget")
        try:
            if isinstance(s.request, RegisterRequest):
                return registration(s, s.request.item)
            return toggling(s, s.request.ride)
        except (ValueError, OSError, IndexError, struct.error):
            return stop(s, "native validation unavailable")

    def step(self: FrameEmulator, buttons: list[str]) -> None:
        nonlocal active
        if len(buttons) == 1 and buttons[0].startswith((REGISTER_PREFIX, TOGGLE_PREFIX)):
            name = buttons[0].split(":", 1)[1]
            s = retained.get(name)
            if s is None or marker(s) != buttons[0]:
                raise ValueError("unrecognized private bike action")
            original(self, [] if s.stopped else advance(s))
        else:
            # The empty release frame between this action's own queued markers is not foreign input.
            if buttons and active is not None and not active.stopped and active.frames:
                stop(active, "queue interrupted")
            original(self, buttons)

    emulator.run_frame_with_buttons = step

    def admit(s: Owned) -> dict[str, object]:
        nonlocal active
        with admission:
            if s.request.id in retained:
                raise HTTPException(409, "duplicate bike action id")
            if (
                server.action_queue
                or server.current_action is not None
                or server.action_frames_remaining
                or server.release_frames_remaining
                or (active is not None and not active.stopped)
            ):
                raise HTTPException(409, "game input queue busy")
            active = s
            retained[s.request.id] = s
            while len(retained) > 64:
                retained.popitem(last=False)
            own = marker(s)
            for _ in range(-(-s.budget // MARKER_FRAMES)):
                server.action_queue.append(
                    {
                        "button": own,
                        "speed": "fast",
                        "hold_frames": MARKER_FRAMES,
                        "release_frames": 1,
                    }
                )
        return {"status": "success", "actions_added": 1}

    def lookup(identity: str) -> Owned:
        s = retained.get(identity)
        if s is None:
            raise HTTPException(404, "unknown bike action")
        return s

    if register:

        @api.post("/pokebench/bike/register")
        def submit_register(body: RegisterRequest) -> dict[str, object]:
            return admit(Owned(body, REGISTER_FRAMES))

    if toggle:

        @api.post("/pokebench/bike/toggle")
        def submit_toggle(body: ToggleRequest) -> dict[str, object]:
            return admit(Owned(body, TOGGLE_FRAMES))

    @api.get("/pokebench/bike/{identity}")
    def receipt(identity: str) -> dict[str, object]:
        return lookup(identity).receipt()

    @api.post("/pokebench/bike/{identity}/cancel")
    def cancel(identity: str) -> dict[str, object]:
        with admission:
            s = lookup(identity)
            if not s.stopped:
                stop(s, "cancelled")
            return s.receipt()
