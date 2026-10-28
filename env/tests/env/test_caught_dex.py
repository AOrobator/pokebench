import os
import struct
import threading
import types

import pytest
from fastapi import FastAPI

from pokebench_env import battle_text as bt
from pokebench_env.battle_text import wait_phase
from pokebench_env.caught_dex import read_caught_dex_ui
from pokebench_env.game_screen import read_screen
from pokebench_env.game_state import MapNames
from pokebench_env.ui_state import read_active_ui
from tests.env.test_menus import put_task
from tests.env.test_ui_state import Memory


def page(fn: int = 0x080C0089) -> Memory:
    memory = Memory()
    memory.put(0x030022C4, struct.pack("<I", 0x08038421))
    memory.put(0x030026F9, b"\2")
    put_task(memory, 0, fn, [6, 263])
    return memory


def test_registration_is_owned_by_battle_task_not_standalone_dex() -> None:
    memory = page()
    ui = read_caught_dex_ui(memory.read)
    assert ui is not None and ui.ready is True
    assert ui.phase == "pokedex_caught_entry"
    assert ui.selected == "POKéDEX registration completed."
    assert ui.controls == "A or B closes the registration page"
    assert wait_phase(memory.read, caught_dex=True) == "screen"
    assert wait_phase(memory.read) == "busy"
    assert read_active_ui(memory.read, read_screen(memory.read), caught_dex=True) == ui


def test_initializing_and_invalid_owners_are_not_ready() -> None:
    memory = page(0x080BFE39)
    assert read_caught_dex_ui(memory.read).ready is False
    assert wait_phase(memory.read, caught_dex=True) == "busy"
    memory = page()
    put_task(memory, 1, 0x080C0089, [6, 263])
    assert read_caught_dex_ui(memory.read).ready is None
    memory = page()
    put_task(memory, 0, 0x080C0089, [6, 0])
    assert read_caught_dex_ui(memory.read).ready is None
    memory.put(0x030022C4, struct.pack("<I", 0x080BB775))
    assert read_caught_dex_ui(memory.read) is None


def test_archived_task_is_read_without_a_standalone_pokedex_heap() -> None:
    import json
    from pathlib import Path

    from tests.env.test_battle_text import Archived

    fixture = json.loads((Path(__file__).parent / "fixtures/caught-dex-c6c2-5393.json").read_text())
    memory = Archived(fixture["memory"])
    ui = read_caught_dex_ui(memory.read)
    assert ui is not None and ui.ready is True
    assert ui.details == {"national_dex_number": 263, "owner_task": 0}
    assert wait_phase(memory.read, caught_dex=True) == "screen"


def test_production_state_factory_honours_switch(monkeypatch) -> None:
    from pokebench_env import rerender
    from pokebench_env.game_state import MapNames

    seen = []
    monkeypatch.setattr(
        rerender,
        "read_game_state",
        lambda *args, **kwargs: seen.append(kwargs["caught_dex_enabled"]),
    )
    rerender.read_state(
        page().read, MapNames({}), active_ui=True, off=frozenset({"caught-dex-input-v1"})
    )
    rerender.read_state(page().read, MapNames({}), active_ui=True, off=frozenset())
    assert seen == [False, True]


@pytest.mark.parametrize("delayed_worker", [False, True])
def test_wait_returns_page_immediately_and_on_frame(delayed_worker: bool) -> None:
    import threading

    from pokebench_env.battle_text import BattleWait

    memory = page()
    wait = BattleWait(memory.read, caught_dex=True)
    assert wait.wait(lambda: "page", threading.Lock()) == ("page", "screen", 0)
    memory = page(0x080BFE39)
    wait = BattleWait(memory.read, caught_dex=True)
    result = []
    from contextlib import contextmanager

    registered = threading.Event()
    lock = threading.Lock()

    @contextmanager
    def memory_lock():
        with lock:
            yield
        # BattleWait appends its waiter before releasing the memory lock.
        registered.set()

    release_worker = threading.Event()

    def worker() -> None:
        if delayed_worker:
            assert release_worker.wait(5)
        result.append(wait.wait(lambda: "page", memory_lock()))

    thread = threading.Thread(target=worker)
    thread.start()
    if delayed_worker:
        assert not registered.is_set()
        release_worker.set()
    assert registered.wait(5), "waiter did not register"
    put_task(memory, 0, 0x080C0089, [6, 263])
    wait.on_frame()
    thread.join(2)
    assert result == [("page", "screen", 1)]


def test_production_battle_wait_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from test_observation import Shot

    from pokebench_env import serve

    made: list[bool] = []

    class Capture(bt.BattleWait):
        def __init__(self, read: bt.ReadMemory, **options: bool) -> None:
            made.append(options["caught_dex"])
            super().__init__(read, **options)

    monkeypatch.setattr(serve, "BattleWait", Capture)

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            pass

    for off in ("caught-dex-input-v1", ""):
        monkeypatch.setenv(
            "POKEBENCH_FEATURES_OFF", ",".join(filter(None, [off, "scene-journal-safe-capture-v1"]))
        )
        app = FastAPI()
        serve.run(
            [],
            uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
            vendor_main=lambda: None,
            observation=(app, Shot, page().read, MapNames({}), threading.Lock()),
            pause=(app, types.SimpleNamespace(step_environment=lambda actions: None)),
            frames=Emulator,
            battle_text=(app, Emulator, page().read),
        )
    assert made == [False, True]


@pytest.mark.parametrize("expanded", [False, True])
def test_native_archive_through_production_decoder_and_renderer(expanded: bool) -> None:
    from pathlib import Path

    from pokebench_env.raw_ram import load_raw_ram
    from pokebench_env.readout import features_off_from_env
    from pokebench_env.rerender import read_state, render
    from pokebench_env.rom import resolve_rom

    read = load_raw_ram(
        Path(__file__).parent / "fixtures/caught-dex-raw-5393.json.gz",
        "19a7c10abc2f23ba6ea9946f7b4131c90f321fa74f74f03aba7f348a3066bdf4",
        rom=resolve_rom(os.environ).read_bytes(),
    )
    off = features_off_from_env({})
    if expanded:
        off -= {"expanded-menu-battle-information-v1", "battle-details-v2"}
    before = read_state(read, MapNames({}), active_ui=True, off=off)
    assert before.battle.text_phase == "busy"
    assert before.active_ui.phase == "battle_resolving"
    assert "A or B closes the registration page" not in render(before, off)
    on = off - {"caught-dex-input-v1"}
    after = read_state(read, MapNames({}), active_ui=True, off=on)
    assert after.battle.text_phase == "screen"
    assert after.active_ui.phase == "pokedex_caught_entry"
    assert after.active_ui.ready is True
    text = render(after, on)
    assert "Interface: pokedex_caught_entry; input ready" in text
    assert "A or B closes the registration page" in text
    assert "resolving (no input until the game asks)" not in text
    if expanded:
        assert "Battle details: WILD single · turn 3 · A or B closes the registration page" in text

    # Source-owned display task must remain busy even if stale battle text exists.
    def displaying(address: int, length: int) -> bytes:
        raw = read(address, length)
        if address == 0x03005E00 and length == 640:
            return struct.pack("<I", 0x080BFE39) + raw[4:]
        return raw

    transition = read_state(displaying, MapNames({}), active_ui=True, off=on)
    assert transition.battle.text_phase == "busy"
    assert transition.active_ui.phase == "pokedex_caught_transition"
    assert transition.active_ui.ready is False
    assert "input ready;" not in render(transition, on)
