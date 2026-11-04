"""bike-register-v1 and bike-auto-mount-v1: bike state, SELECT registration and SELECT toggles."""

import struct
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from test_running import fixture

from pokebench_env.bike import (
    KEY_ITEMS,
    MARKER_FRAMES,
    REGISTER_FRAMES,
    REGISTER_PREFIX,
    REGISTERED,
    TOGGLE_PREFIX,
    BikeState,
    MenuView,
    RegisterRequest,
    ToggleRequest,
    bike_line,
    install_bike,
    read_bike,
    read_view,
    register_step,
)
from pokebench_env.game_state import GameState
from pokebench_env.running import FIELD_LOCK, MAP_HEADER, OBJECT_EVENTS, PLAYER_AVATAR

SAVE = 0x02025000
MACH, ACRO = 259, 272
ITEMFINDER = 261


def memory(keys=(ITEMFINDER, MACH), registered=0, cycling=True):
    m = fixture()
    raw = bytearray(4 * 30)
    for i, item in enumerate(keys):
        struct.pack_into("<HH", raw, 4 * i, item, 1)
    m.put(SAVE + KEY_ITEMS, bytes(raw))
    m.put(SAVE + REGISTERED, struct.pack("<H", registered))
    m.put(MAP_HEADER + 0x1A, bytes([4 | int(cycling)]))
    return m


def test_read_bike_reports_owned_bikes_registration_riding_and_cycling():
    m = memory(registered=MACH)
    assert read_bike(m.read) == BikeState((MACH,), MACH, None, True)
    m.put(PLAYER_AVATAR, b"\x04")
    assert read_bike(m.read) == BikeState((MACH,), MACH, "ACRO BIKE", True)
    m.put(PLAYER_AVATAR, b"\x02")
    assert read_bike(m.read).riding == "MACH BIKE"
    assert read_bike(memory(keys=(ITEMFINDER,), cycling=False).read) == BikeState(
        (), 0, None, False
    )
    assert read_bike(memory().read).json() == {
        "owned": [MACH],
        "registered": 0,
        "riding": None,
        "allow_cycling": True,
    }


def test_read_bike_is_none_without_a_valid_save():
    m = memory()
    m.put(0x03005D8C, struct.pack("<I", 0x01000000))
    assert read_bike(m.read) is None
    m = memory()
    assert read_bike(lambda a, n: b"" if a == MAP_HEADER else m.read(a, n)) is None


@pytest.mark.parametrize(
    "state,register,mount,line",
    [
        (None, True, True, None),
        (BikeState((MACH,), 0, None, True), True, True, None),
        (BikeState((MACH,), MACH, None, True), True, True, "Bike: MACH BIKE registered to SELECT"),
        (
            BikeState((ACRO,), ACRO, "ACRO BIKE", True),
            True,
            True,
            "Bike: ACRO BIKE registered to SELECT; riding it",
        ),
        (
            BikeState((ACRO,), ACRO, "ACRO BIKE", True),
            True,
            False,
            "Bike: ACRO BIKE registered to SELECT",
        ),
        (BikeState((ACRO,), ACRO, "ACRO BIKE", True), False, True, "Bike: riding the ACRO BIKE"),
        (BikeState((MACH,), MACH, None, True), False, True, None),
        (BikeState((MACH,), ITEMFINDER, None, True), True, False, None),
    ],
)
def test_bike_line(state, register, mount, line):
    assert bike_line(state, register=register, mount=mount) == line


START = ("POKEDEX", "POKEMON", "BAG", "POKENAV", "PLAYER", "SAVE", "OPTIONS", "EXIT")
CONTEXT = ("USE", "REGISTER", "EMPTY", "CANCEL")
KEYS = [ITEMFINDER, MACH]


@pytest.mark.parametrize(
    "view,registered,step",
    [
        (MenuView("field", False), 0, "START"),
        (MenuView("field", False), MACH, "done"),
        (MenuView("start_menu", False, index=2, options=START), 0, "wait"),
        (MenuView("start_menu", True, index=4, options=START), 0, "UP"),
        (MenuView("start_menu", True, index=0, options=START), 0, "DOWN"),
        (MenuView("start_menu", True, index=2, options=START), 0, "A"),
        (MenuView("start_menu", True, index=2, options=START), MACH, "B"),
        (
            MenuView("start_menu", True, index=0, options=("POKEMON", "EXIT")),
            0,
            "abort: the START menu has no BAG",
        ),
        (MenuView("bag_menu", True, pocket=3, index=0, item=135), 0, "RIGHT"),
        (MenuView("bag_menu", True, pocket=0, index=0, item=13), 0, "LEFT"),
        (MenuView("bag_menu", True, pocket=1, index=0, item=4), 0, "LEFT"),
        (MenuView("bag_menu", True, pocket=2, index=0, item=300), 0, "RIGHT"),
        (MenuView("bag_menu", True, pocket=4, index=0, item=ITEMFINDER), 0, "DOWN"),
        (MenuView("bag_menu", True, pocket=4, index=2, item=None), 0, "UP"),
        (MenuView("bag_menu", True, pocket=4, index=1, item=MACH), 0, "A"),
        (MenuView("bag_menu", True, pocket=4, index=1, item=MACH), MACH, "B"),
        (MenuView("bag_menu", True, pocket=None), 0, "abort: the bag pocket is unreadable"),
        (
            MenuView("bag_menu", True, pocket=4, index=None, item=ITEMFINDER),
            0,
            "abort: the KEY ITEMS cursor is unreadable",
        ),
        (MenuView("bag_context_menu", True, index=0, item=MACH, options=CONTEXT), 0, "RIGHT"),
        (MenuView("bag_context_menu", True, index=3, item=MACH, options=CONTEXT), 0, "UP"),
        (
            MenuView(
                "bag_context_menu",
                True,
                index=2,
                item=MACH,
                options=("USE", "TOSS", "REGISTER", "CANCEL"),
            ),
            0,
            "A",
        ),
        (
            MenuView(
                "bag_context_menu",
                True,
                index=1,
                item=MACH,
                options=("USE", "TOSS", "REGISTER", "CANCEL"),
            ),
            0,
            "LEFT",
        ),
        (
            MenuView(
                "bag_context_menu",
                True,
                index=0,
                item=MACH,
                options=("USE", "TOSS", "REGISTER", "CANCEL"),
            ),
            0,
            "DOWN",
        ),
        (MenuView("bag_context_menu", True, index=1, item=MACH, options=CONTEXT), 0, "A"),
        (MenuView("bag_context_menu", True, index=1, item=ITEMFINDER, options=CONTEXT), 0, "B"),
        (MenuView("bag_context_menu", True, index=1, item=MACH, options=CONTEXT), MACH, "B"),
        (
            MenuView("bag_context_menu", True, index=0, item=MACH, options=("USE", "CANCEL")),
            0,
            "abort: the bike's menu has no REGISTER",
        ),
        (MenuView("party_menu", True), 0, "abort: unexpected screen party_menu"),
    ],
)
def test_register_step(view, registered, step):
    assert register_step(view, MACH, registered, KEYS) == step


def test_register_step_refuses_a_bike_not_in_key_items():
    view = MenuView("bag_menu", True, pocket=4, index=0, item=ITEMFINDER)
    assert register_step(view, ACRO, 0, KEYS) == "abort: the bike is not in KEY ITEMS"


class Game:
    """A fake of the screens registration walks through, answering one press per frame."""

    def __init__(self, m, *, start=START, context=CONTEXT, fade=12, context_item=None):
        self.m, self.start, self.context, self.fade = m, start, context, fade
        self.context_item = context_item
        self.screen, self.timer, self.cursor, self.pocket, self.row = "field", 0, 2, 3, 0
        self.frames = 0
        self.leaving_start = self.locking = False

    def view(self, _read):
        # The game locks field controls for as long as a menu is open or fading.
        if self.screen != "field" or self.timer:
            self.m.put(FIELD_LOCK, b"\x01")
            self.locking = True
        elif self.locking:
            self.m.put(FIELD_LOCK, b"\x00")
            self.locking = False
        if self.timer and self.screen == "bag" and self.leaving_start:
            # The START menu is gone while the overworld still owns the frame and the bag fades in.
            return MenuView("field", False)
        if self.timer:
            return MenuView(f"screen {self.screen}", False)
        if self.screen == "field":
            return MenuView("field", False)
        if self.screen == "start":
            return MenuView(
                "start_menu",
                True,
                index=self.cursor,
                options=self.start,
                selected=self.start[self.cursor],
            )
        if self.screen == "bag":
            item = KEYS[self.row] if self.pocket == 4 and self.row < len(KEYS) else 135
            return MenuView("bag_menu", True, pocket=self.pocket, index=self.row, item=item)
        item = self.context_item or KEYS[self.row]
        return MenuView(
            "bag_context_menu", True, index=self.cursor, item=item, options=self.context
        )

    def go(self, screen, delay=0):
        self.screen, self.timer = screen, delay

    def frame(self, buttons):
        self.frames += 1
        if self.timer:
            self.timer -= 1
            if not self.timer:
                self.leaving_start = False
            return
        if not buttons:
            return
        (b,) = buttons
        if self.screen == "field" and b == "START":
            self.go("start", 2)
            self.cursor = 2
        elif self.screen == "start":
            if b in ("UP", "DOWN"):
                self.cursor = (self.cursor + (1 if b == "DOWN" else -1)) % len(self.start)
            elif b == "A" and self.start[self.cursor] == "BAG":
                self.go("bag", self.fade)
                self.leaving_start = True
            elif b == "B":
                self.go("field", 2)
        elif self.screen == "bag":
            if b in ("LEFT", "RIGHT"):
                self.pocket = (self.pocket + (1 if b == "RIGHT" else -1)) % 5
                self.row = 0
                self.timer = 4
            elif b in ("UP", "DOWN"):
                self.row = max(0, self.row + (1 if b == "DOWN" else -1))
            elif b == "A":
                self.go("context")
                self.cursor = 0
            elif b == "B":
                self.go("start", self.fade)
                self.cursor = 2
        elif self.screen == "context":
            if b == "RIGHT":
                self.cursor |= 1
            elif b == "LEFT":
                self.cursor &= 2
            elif b == "DOWN":
                self.cursor |= 2
            elif b == "UP":
                self.cursor &= 1
            elif b == "A" and self.context[self.cursor] == "REGISTER":
                self.m.put(SAVE + REGISTERED, struct.pack("<H", KEYS[self.row]))
                self.go("bag", 2)
            elif b == "B":
                self.go("bag", 2)


def server():
    return SimpleNamespace(
        action_queue=[], action_frames_remaining=0, current_action=None, release_frames_remaining=0
    )


def install(m, game=None, *, register=True, toggle=True, applied=None):
    applied = [] if applied is None else applied

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)
            if game is not None:
                game.frame(buttons)

    api, queue = FastAPI(), server()
    view = game.view if game is not None else read_view
    install_bike(api, Emulator, queue, m.read, register=register, toggle=toggle, view=view)
    return api, queue, Emulator(), applied


def run(api, queue, emu, frames=REGISTER_FRAMES):
    marker = queue.action_queue[0]["button"]
    queue.current_action = marker
    for _ in range(frames):
        if not queue.action_queue or queue.action_queue[0]["button"] != marker:
            break
        emu.run_frame_with_buttons([marker])
        if queue.action_frames_remaining == 1:
            break


def route(api, path, method="POST"):
    """The route's own function: these tests call it in memory, without HTTP or an event loop."""
    return next(
        r.endpoint
        for r in api.routes
        if getattr(r, "path", None) == path and method in getattr(r, "methods", ())
    )


def register(api, item=MACH, identity="r"):
    return route(api, "/pokebench/bike/register")(RegisterRequest(id=identity, item=item))


def receipt(api, identity="r"):
    return route(api, "/pokebench/bike/{identity}", "GET")(identity)


def cancel(api, identity="r"):
    return route(api, "/pokebench/bike/{identity}/cancel")(identity)


def test_registration_walks_the_menus_with_real_presses_and_reads_the_item_back():
    m = memory()
    game = Game(m)
    api, queue, emu, applied = install(m, game)
    register(api)
    assert len(queue.action_queue) == -(-REGISTER_FRAMES // MARKER_FRAMES)
    run(api, queue, emu)
    r = receipt(api)
    assert r["reason"] == "registered", r
    assert r["presses"] == ["START", "A", "RIGHT", "DOWN", "A", "RIGHT", "A", "B", "B"]
    assert struct.unpack("<H", m.read(SAVE + REGISTERED, 2))[0] == MACH
    assert game.screen == "field"
    assert all(len(b) <= 1 for b in applied)
    assert queue.action_queue == []


def test_an_already_registered_bike_presses_nothing():
    m = memory(registered=MACH)
    api, queue, emu, applied = install(m, Game(m))
    register(api)
    run(api, queue, emu)
    assert receipt(api)["reason"] == "registered"
    assert receipt(api)["presses"] == []


def test_a_start_menu_without_the_bag_closes_and_reports():
    m = memory()
    game = Game(m, start=("POKEMON", "SAVE", "EXIT"))
    game.cursor = 0
    api, queue, emu, _ = install(m, game)
    register(api)
    game.start = ("POKEMON", "SAVE", "EXIT")
    run(api, queue, emu)
    r = receipt(api)
    assert r["reason"] == "the START menu has no BAG"
    assert r["presses"][-1] == "B"
    assert game.screen == "field"


def test_a_menu_that_never_answers_backs_out():
    m = memory()
    game = Game(m, context=("USE", "REGISTER", "EMPTY", "CANCEL"))
    original = game.frame

    def deaf(buttons):
        if game.screen == "context" and buttons == ["A"]:
            return
        original(buttons)

    game.frame = deaf
    api, queue, emu, _ = install(m, game)
    register(api)
    run(api, queue, emu)
    r = receipt(api)
    assert r["reason"] == "no response to A on bag_context_menu"
    assert game.screen == "field"


def test_a_screen_that_never_takes_input_stops():
    m = memory()
    game = Game(m, fade=10_000)
    api, queue, emu, _ = install(m, game)
    register(api)
    run(api, queue, emu)
    assert receipt(api)["reason"] == "stuck on the field with controls locked"


def test_menus_closed_by_something_else_end_the_attempt():
    m = memory()
    game = Game(m)
    original = game.frame

    def closer(buttons):
        original(buttons)
        if game.screen == "bag" and not game.timer:
            game.go("field")

    game.frame = closer
    api, queue, emu, _ = install(m, game)
    register(api)
    run(api, queue, emu)
    assert receipt(api)["reason"] == "the menus closed before the bike was registered"


def test_a_locked_field_never_opens_the_menu():
    m = memory()
    m.put(FIELD_LOCK, b"\x01")
    api, queue, emu, applied = install(m, Game(m))
    register(api)
    run(api, queue, emu)
    assert receipt(api)["reason"] == "field input unavailable"
    assert all(b == [] for b in applied)


def test_an_unreadable_save_stops_without_input():
    m = memory()
    m.put(0x03005D8C, struct.pack("<I", 0x01000000))
    api, queue, emu, applied = install(m, Game(m))
    register(api)
    run(api, queue, emu)
    assert receipt(api)["reason"] == "native validation unavailable"


def test_registration_frame_budget():
    m = memory()
    game = Game(m, start=("POKEMON", "SAVE", "BAG"))
    original = game.frame

    def wrapping(buttons):
        # A cursor that wraps back before it ever reaches BAG answers every press, forever.
        original(buttons)
        if game.screen == "start" and game.cursor == 2:
            game.cursor = 0

    game.frame = wrapping
    api, queue, emu, _ = install(m, game)
    register(api)
    game.start = ("POKEMON", "SAVE", "BAG")
    run(api, queue, emu, frames=REGISTER_FRAMES + 5)
    r = receipt(api)
    assert r["reason"] == "frame budget"
    assert r["frames"] == REGISTER_FRAMES


def status(call):
    with pytest.raises(HTTPException) as refused:
        call()
    return refused.value.status_code


def test_admission_identity_and_cancel():
    m = memory()
    api, queue, emu, _ = install(m, Game(m))
    register(api)
    assert status(lambda: register(api)) == 409
    toggle_route = route(api, "/pokebench/bike/toggle")
    assert status(lambda: toggle_route(ToggleRequest(id="t", ride=True))) == 409
    with pytest.raises(ValidationError):
        RegisterRequest(id="x", item=13)
    with pytest.raises(ValidationError):
        RegisterRequest(id="bad:id", item=MACH)
    assert status(lambda: receipt(api, "unknown")) == 404
    assert status(lambda: cancel(api, "unknown")) == 404
    with pytest.raises(ValueError, match="private bike action"):
        emu.run_frame_with_buttons([REGISTER_PREFIX + "unknown"])
    with pytest.raises(ValueError, match="private bike action"):
        emu.run_frame_with_buttons([TOGGLE_PREFIX + "r"])
    cancelled = cancel(api)
    assert cancelled["reason"] == "cancelled" and cancelled["stopped"] is True
    assert queue.action_queue == []
    assert cancel(api)["reason"] == "cancelled"


def test_busy_queue_refuses_and_foreign_input_interrupts():
    m = memory()
    api, queue, emu, applied = install(m, Game(m))
    queue.action_queue.append({"button": "A"})
    assert status(lambda: register(api)) == 409
    queue.action_queue.clear()
    register(api)
    marker = queue.action_queue[0]["button"]
    queue.current_action = marker
    emu.run_frame_with_buttons([marker])
    emu.run_frame_with_buttons([])
    assert receipt(api)["stopped"] is False
    emu.run_frame_with_buttons(["A"])
    assert receipt(api)["reason"] == "queue interrupted"
    assert applied[-1] == ["A"]


def paths(api):
    return {getattr(r, "path", None) for r in api.routes}


def test_switches_install_only_their_routes():
    m = memory()
    assert "/pokebench/bike/register" not in paths(install(m, register=False, toggle=True)[0])
    assert "/pokebench/bike/toggle" not in paths(install(m, register=True, toggle=False)[0])


def test_retained_receipts_are_bounded():
    m = memory(registered=MACH)
    api, queue, emu, _ = install(m, Game(m))
    for i in range(70):
        register(api, identity=f"r{i}")
        run(api, queue, emu)
        queue.action_queue.clear()
        queue.current_action, queue.action_frames_remaining = None, 0
    assert status(lambda: receipt(api, "r0")) == 404
    assert receipt(api, "r69")["reason"] == "registered"


class Rider:
    """SELECT gets on or off after a locked hand-off, or prints a refusal that B closes."""

    def __init__(self, m, *, refuse=False, lock=20):
        self.m, self.refuse, self.lock, self.timer, self.message = m, refuse, lock, 0, False

    def frame(self, buttons):
        if self.timer:
            self.timer -= 1
            if not self.timer:
                self.m.put(FIELD_LOCK, b"\x00")
            return
        if buttons == ["SELECT"]:
            self.m.put(FIELD_LOCK, b"\x01")
            if self.refuse:
                self.message = True
                return
            flags = self.m.read(PLAYER_AVATAR, 1)[0]
            self.m.put(PLAYER_AVATAR, b"\x01" if flags & 0x06 else b"\x02")
            self.timer = self.lock
        elif buttons == ["B"] and self.message:
            self.message = False
            self.timer = 3


def toggle(m, ride=True, **rider):
    game = Rider(m, **rider)
    applied = []

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            applied.append(buttons)
            game.frame(buttons)

    api, queue = FastAPI(), server()
    install_bike(api, Emulator, queue, m.read, register=True, toggle=True)
    route(api, "/pokebench/bike/toggle")(ToggleRequest(id="r", ride=ride))
    run(api, queue, Emulator(), frames=200)
    return receipt(api), applied


def test_select_gets_on_and_waits_for_the_field_to_free():
    r, applied = toggle(memory(registered=MACH))
    assert r["reason"] == "riding"
    assert r["presses"] == ["SELECT"]
    assert 20 <= r["frames"] <= 30
    assert sum(bool(b) for b in applied) == 1


def test_select_gets_off():
    m = memory(registered=MACH)
    m.put(PLAYER_AVATAR, b"\x02")
    r, _ = toggle(m, ride=False)
    assert r["reason"] == "on foot"
    assert m.read(PLAYER_AVATAR, 1) == b"\x01"


def test_a_refusal_message_is_closed_with_one_b():
    r, applied = toggle(memory(registered=MACH), refuse=True)
    assert r["reason"] == "refused"
    assert r["presses"] == ["SELECT", "B"]
    assert r["frames"] < 120


@pytest.mark.parametrize(
    "change,reason",
    [
        (lambda m: m.put(PLAYER_AVATAR, b"\x02"), "already riding"),
        (
            lambda m: m.put(SAVE + REGISTERED, struct.pack("<H", ITEMFINDER)),
            "no bike registered to SELECT",
        ),
        (lambda m: m.put(MAP_HEADER + 0x1A, b"\x04"), "this map does not allow cycling"),
        (lambda m: m.put(OBJECT_EVENTS + 0x1E, b"\x0a"), "this tile does not allow cycling"),
        (lambda m: m.put(FIELD_LOCK, b"\x01"), "field input unavailable"),
        (lambda m: m.put(PLAYER_AVATAR, b"\x08"), "field input unavailable"),
        (
            lambda m: m.put(0x03005D8C, struct.pack("<I", 0x01000000)),
            "field input unavailable",
        ),
    ],
)
def test_select_is_never_pressed_when_the_game_would_refuse(change, reason):
    m = memory(registered=MACH)
    change(m)
    r, applied = toggle(m)
    assert r["reason"] == reason
    assert r["presses"] == []
    assert all(b == [] for b in applied)


def test_a_refused_get_off_is_closed_and_never_reported_as_on_foot():
    m = memory(registered=MACH)
    m.put(PLAYER_AVATAR, b"\x02")
    r, _ = toggle(m, ride=False, refuse=True)
    assert r["reason"] == "refused"
    assert r["presses"] == ["SELECT", "B"]
    assert m.read(PLAYER_AVATAR, 1) == b"\x02"


def test_a_locked_field_while_riding_is_not_already_on_foot():
    m = memory(registered=MACH)
    m.put(PLAYER_AVATAR, b"\x02")
    m.put(FIELD_LOCK, b"\x01")
    r, applied = toggle(m, ride=False)
    assert r["reason"] == "field input unavailable"
    assert all(b == [] for b in applied)


def test_already_on_foot_presses_nothing():
    r, applied = toggle(memory(registered=MACH), ride=False)
    assert r["reason"] == "already on foot"


def test_read_view_maps_the_menu_readout(monkeypatch):
    from pokebench_env import menus
    from pokebench_env.ui_state import ActiveUi

    m = memory()
    assert read_view(m.read) == MenuView("field", False)
    m.put(0x030022C4, struct.pack("<I", 0x081AAD5D))
    monkeypatch.setattr(
        menus,
        "read_menu_family",
        lambda *_a, **_k: ActiveUi(
            "bag_menu",
            "MACH BIKE",
            True,
            "",
            details={
                "pocket": "KEY ITEMS",
                "list_item_id": 1,
                "selected_index": 1,
                "item_id": MACH,
            },
        ),
    )
    assert read_view(m.read) == MenuView("bag_menu", True, 4, 1, MACH, "MACH BIKE", ())
    monkeypatch.setattr(
        menus,
        "read_menu_family",
        lambda *_a, **_k: ActiveUi(
            "bag_context_menu",
            "USE",
            True,
            "",
            details={"selected_index": 0, "item_id": MACH, "options": list(CONTEXT)},
        ),
    )
    assert read_view(m.read).options == CONTEXT
    monkeypatch.setattr(menus, "read_menu_family", lambda *_a, **_k: None)
    assert read_view(m.read) == MenuView("screen 0x81aad5d", False)

    def broken(*_a, **_k):
        raise ValueError("torn")

    monkeypatch.setattr(menus, "read_menu_family", broken)
    assert read_view(m.read) == MenuView("unreadable", False)


@pytest.mark.parametrize("switch", ["bike-register-v1", "bike-auto-mount-v1"])
def test_switches_are_default_off_server_features(switch):
    from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

    assert switch in SERVER_FEATURES
    assert switch in features_off_from_env({})


@pytest.mark.parametrize("registered,toggled", [(True, False), (False, True), (False, False)])
def test_travel_installs_the_bike_routes_only_when_on(registered, toggled):
    from pokebench_env.travel import install_travel

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            pass

    api = FastAPI()
    install_travel(
        api, Emulator, server(), memory().read, bike_register=registered, bike_toggle=toggled
    )
    assert ("/pokebench/bike/register" in paths(api)) is registered
    assert ("/pokebench/bike/toggle" in paths(api)) is toggled
    assert ("/pokebench/bike/{identity}" in paths(api)) is (registered or toggled)


def field_state():
    return GameState(
        screen="overworld",
        started=True,
        name="A",
        location="ROUTE113",
        map_id=(0, 28),
        position=(99, 8),
        facing="left",
        in_battle=False,
        party=(),
        money=3000,
        badges=(),
        play_time=(0, 28, 20),
        field_controls_locked=False,
    )


def readout(state, on):
    from pokebench_env.readout import SERVER_FEATURES, format_readout

    return format_readout(state, off=frozenset(SERVER_FEATURES) - {"ram-state-v1", *on})


def test_readout_line_and_state_json_only_with_a_switch():
    from dataclasses import replace

    from pokebench_env.readout import state_json

    plain = field_state()
    ridden = replace(plain, bike=BikeState((MACH,), MACH, "MACH BIKE", True))
    assert readout(ridden, set()) == readout(plain, set())
    assert "Bike:" not in readout(plain, {"bike-register-v1", "bike-auto-mount-v1"})
    assert "Bike: MACH BIKE registered to SELECT; riding it\n" in readout(
        ridden, {"bike-register-v1", "bike-auto-mount-v1"}
    )
    assert "Bike: MACH BIKE registered to SELECT\n" in readout(ridden, {"bike-register-v1"})
    assert "bike" not in state_json(plain)
    assert state_json(ridden)["bike"] == {
        "owned": [MACH],
        "registered": MACH,
        "riding": "MACH BIKE",
        "allow_cycling": True,
    }


@pytest.mark.parametrize("off_both", [True, False])
def test_read_state_asks_for_the_bike_only_with_a_switch(monkeypatch, off_both):
    from pokebench_env import rerender
    from pokebench_env.readout import SERVER_FEATURES

    seen = {}

    def stub(*_args, **kwargs):
        seen.update(kwargs)
        return field_state()

    monkeypatch.setattr(rerender, "read_game_state", stub)
    off = frozenset(SERVER_FEATURES) - (set() if off_both else {"bike-auto-mount-v1"})
    rerender.read_state(memory().read, None, active_ui=False, off=off)
    assert seen["bike_enabled"] is not off_both


def test_the_game_state_factory_reads_the_bike():
    from pokebench_env.game_state import read_bike_state

    assert read_bike_state(memory(registered=MACH).read) == BikeState((MACH,), MACH, None, True)
