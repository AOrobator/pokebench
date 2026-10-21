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


def test_wait_returns_page_immediately_and_on_frame() -> None:
    import threading

    from pokebench_env.battle_text import BattleWait

    memory = page()
    wait = BattleWait(memory.read, caught_dex=True)
    assert wait.wait(lambda: "page", threading.Lock()) == ("page", "screen", 0)
    memory = page(0x080BFE39)
    wait = BattleWait(memory.read, caught_dex=True)
    result = []
    thread = threading.Thread(
        target=lambda: result.append(wait.wait(lambda: "page", threading.Lock()))
    )
    thread.start()
    # The memory lock synchronizes waiter registration before the transition.
    import time

    for _ in range(100):
        with wait._lock:
            if wait._waiters:
                break
        time.sleep(0.001)
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
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
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
