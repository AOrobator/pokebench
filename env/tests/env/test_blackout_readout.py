"""blackout-readout-v1: a whiteout is said once in the readout.

The recorded CB2_WhiteOut frame (show T768, raw-ram behind state 19097) is in
test_readout_truth.py; these cases drive gMain.callback2 frame by frame.
"""

import json
import struct
import types
from dataclasses import replace

import pytest
from fastapi import FastAPI

from pokebench_env.blackout_readout import (
    CB2_WHITE_OUT,
    SWITCH,
    WHITING_OUT,
    Whiteout,
    WhiteoutLatch,
    install_whiteout_latch,
    whiteout_line,
)
from pokebench_env.game_screen import GMAIN
from pokebench_env.game_state import read_game_state
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from tests.env.test_feature_switches import _Shot
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, SB2, game
from tests.env.test_view import get

LINE = (
    "Whited out: your party had no usable Pokémon left, so the game took you back to "
    "LITTLEROOT TOWN (the last place you healed), healed your party and halved your money: "
    "₽3000 → ₽1500."
)


def set_money(m, value: int) -> None:  # type: ignore[no-untyped-def]
    m.put(SB1 + 0x490, struct.pack("<I", value ^ 0x1234))


def callback(m, cb2: int) -> None:  # type: ignore[no-untyped-def]
    m.put(GMAIN + 4, struct.pack("<I", cb2))


def test_latch_keeps_the_money_of_the_first_whiteout_frame_and_reports_once() -> None:
    m = game(OVERWORLD)
    latch = WhiteoutLatch(m.read)
    field = read_game_state(m.read, MAPS)
    latch.on_frame()
    assert latch.take(field) is None
    callback(m, CB2_WHITE_OUT)
    latch.on_frame()
    set_money(m, 1500)  # DoWhiteOut runs on the last CB2_WhiteOut frame
    latch.on_frame()
    whiting = read_game_state(m.read, MAPS)
    assert whiting.screen != "overworld" and latch.take(whiting) is None, "still whiting out"
    callback(m, OVERWORLD[1])
    latch.on_frame()
    assert latch.take(replace(field, screen="battle")) is None
    assert latch.take(replace(field, in_battle=True)) is None
    assert latch.take(replace(field, position=None)) is None
    assert latch.take(field) == Whiteout(3000)
    assert latch.take(field) is None


def test_unreadable_save_pointers_keep_the_money_unknown() -> None:
    m = game(OVERWORLD)
    m.put(0x03005D8C, struct.pack("<II", 0, SB2))
    callback(m, CB2_WHITE_OUT)
    latch = WhiteoutLatch(m.read)
    latch.on_frame()
    m.put(0x03005D8C, struct.pack("<II", SB1, 0))
    callback(m, OVERWORLD[1])
    latch.on_frame()
    field = read_game_state(game(OVERWORLD).read, MAPS)
    event = latch.take(field)
    assert event == Whiteout(None)
    assert whiteout_line(event, field).endswith("healed your party and halved your money.")
    assert "the last place you healed (the last" in whiteout_line(
        event, replace(field, location=None)
    )


def test_readout_lines_need_the_switch() -> None:
    m = game(OVERWORLD)
    set_money(m, 1500)
    field = read_game_state(m.read, MAPS)
    lines = format_readout(field, whiteout=Whiteout(3000)).split("\n")
    assert LINE in lines
    assert lines.index(LINE) == lines.index("Play time: 1:02:03") + 1
    assert LINE not in format_readout(field, frozenset({SWITCH}), whiteout=Whiteout(3000))
    assert WHITING_OUT not in format_readout(field)
    whiting = replace(field, blackout_active=True)
    assert WHITING_OUT in format_readout(whiting).split("\n")
    assert WHITING_OUT not in format_readout(whiting, frozenset({SWITCH}))


def test_frame_hook_runs_after_every_emulated_frame() -> None:
    order: list[str] = []

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            order.append(f"frame {buttons}")

    class Spy(WhiteoutLatch):
        def on_frame(self) -> None:
            order.append("latch")

    install_whiteout_latch(Emulator, Spy(game(OVERWORLD).read))
    Emulator().run_frame_with_buttons(["A"])
    assert order == ["frame ['A']", "latch"]


@pytest.mark.parametrize(("off", "shown"), [("", True), (SWITCH, False)])
def test_production_run_reports_the_whiteout_once(
    monkeypatch: pytest.MonkeyPatch, off: str, shown: bool
) -> None:
    from pokebench_env.serve import run

    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", off)
    m = game(OVERWORLD)
    m.put(0x05000000, b"\x1f\x00")  # a lit palette: the frame settle captures at once
    script = iter([CB2_WHITE_OUT, CB2_WHITE_OUT, OVERWORLD[1]])

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            cb2 = next(script)
            callback(m, cb2)
            if cb2 == OVERWORLD[1]:
                set_money(m, 1500)

    app = FastAPI()
    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(app, lambda: _Shot(), m.read, MAPS),
        frames=Emulator,
    )
    for _ in range(3):
        Emulator().run_frame_with_buttons([])
    texts = [json.loads(get(app, "/pokebench/observation")[2])["state_text"] for _ in range(2)]
    assert (LINE in texts[0].split("\n")) is shown
    assert LINE not in texts[1]


def test_an_observation_that_fails_keeps_the_whiteout_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from pokebench_env.observation import install_observation

    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    m = game(OVERWORLD)
    set_money(m, 1500)
    latch = WhiteoutLatch(m.read)
    callback(m, CB2_WHITE_OUT)
    m.put(SB1 + 0x490, struct.pack("<I", 3000 ^ 0x1234))
    latch.on_frame()
    set_money(m, 1500)
    callback(m, OVERWORLD[1])
    latch.on_frame()
    shots = iter(["", "iVBORw0KGgo="])

    class Shot:
        def model_dump(self) -> dict[str, object]:
            return {"screenshot_base64": next(shots)}

    app = FastAPI()
    install_observation(app, lambda: Shot(), m.read, MAPS, whiteout=latch)
    status, _, _ = get(app, "/pokebench/observation")
    assert status == 503
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200 and LINE in json.loads(body)["state_text"].split("\n")


def test_the_latch_sees_a_frame_before_a_settle_capture_on_that_frame(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import threading

    from pokebench_env.serve import run

    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "")
    m = game(OVERWORLD)  # palette black: an observation waits for the screen to settle
    lock = threading.Lock()

    def whiteout() -> None:
        callback(m, CB2_WHITE_OUT)

    def back_on_the_field() -> None:
        callback(m, OVERWORLD[1])
        set_money(m, 1500)
        m.put(0x05000000, b"\x1f\x00")

    frames = iter([whiteout, back_on_the_field])

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            next(frames)()

    app = FastAPI()
    run(
        [],
        uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
        vendor_main=lambda: None,
        observation=(app, lambda: _Shot(), m.read, MAPS, lock),
        frames=Emulator,
    )
    with lock:
        Emulator().run_frame_with_buttons([])
    result: dict[str, object] = {}
    thread = threading.Thread(
        target=lambda: result.update(r=get(app, "/pokebench/observation")), daemon=True
    )
    thread.start()
    thread.join(0.2)
    assert thread.is_alive(), "waiting for the screen to settle"
    with lock:
        Emulator().run_frame_with_buttons([])
    thread.join(5)
    status, _, body = result["r"]  # type: ignore[misc]
    assert status == 200
    assert LINE in json.loads(body)["state_text"].split("\n")


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
