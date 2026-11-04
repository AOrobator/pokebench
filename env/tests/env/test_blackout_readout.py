"""blackout-readout-v1: a whiteout is said once in the readout.

The recorded CB2_WhiteOut frame (show T768, raw-ram behind state 19097) is in
test_readout_truth.py; these cases drive gMain.callback2 frame by frame.
"""

import struct
from dataclasses import replace

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
from tests.env.test_game_state import MAPS, OVERWORLD, SB1, SB2, game

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
    assert latch.take(field, latch.mark()) is None
    callback(m, CB2_WHITE_OUT)
    latch.on_frame()
    set_money(m, 1500)  # DoWhiteOut runs on the last CB2_WhiteOut frame
    latch.on_frame()
    whiting = read_game_state(m.read, MAPS)
    assert whiting.screen != "overworld" and latch.take(whiting, latch.mark()) is None
    callback(m, OVERWORLD[1])
    latch.on_frame()
    seen = latch.mark()
    assert latch.take(replace(field, screen="battle"), seen) is None
    assert latch.take(replace(field, in_battle=True), seen) is None
    assert latch.take(replace(field, position=None), seen) is None
    assert latch.take(field, seen) == Whiteout(3000, 2)
    assert latch.take(field, seen) is None


def test_a_whiteout_that_began_after_the_snapshot_waits_for_a_later_observation() -> None:
    # Field poison (field_poison.inc EventScript_FieldWhiteOut) starts CB2_WhiteOut from
    # the field: a field state read on the frame before must not carry the line.
    m = game(OVERWORLD)
    latch = WhiteoutLatch(m.read)
    latch.on_frame()
    before, seen = read_game_state(m.read, MAPS), latch.mark()
    callback(m, CB2_WHITE_OUT)
    latch.on_frame()
    callback(m, OVERWORLD[1])
    latch.on_frame()
    assert latch.take(before, seen) is None
    after = read_game_state(m.read, MAPS)
    assert latch.take(after, latch.mark()) == Whiteout(3000, 2)


def test_whiteouts_queue_oldest_first_and_put_back_goes_first() -> None:
    m = game(OVERWORLD)
    latch = WhiteoutLatch(m.read)
    field = read_game_state(m.read, MAPS)
    for _ in range(2):  # two whiteouts before any field observation is delivered
        callback(m, CB2_WHITE_OUT)
        latch.on_frame()
        callback(m, OVERWORLD[1])
        latch.on_frame()
    first = latch.take(field, latch.mark())
    assert first == Whiteout(3000, 1)
    latch.put_back(first)
    assert latch.take(field, latch.mark()) == first
    assert latch.take(field, latch.mark()) == Whiteout(3000, 3)
    assert latch.take(field, latch.mark()) is None


def test_a_whiteout_between_snapshot_and_take_does_not_replace_the_first() -> None:
    m = game(OVERWORLD)
    latch = WhiteoutLatch(m.read)
    callback(m, CB2_WHITE_OUT)
    latch.on_frame()
    callback(m, OVERWORLD[1])
    latch.on_frame()
    snapshot, seen = read_game_state(m.read, MAPS), latch.mark()
    callback(m, CB2_WHITE_OUT)  # a second whiteout runs before the first is taken
    latch.on_frame()
    callback(m, OVERWORLD[1])
    latch.on_frame()
    assert latch.take(snapshot, seen) == Whiteout(3000, 1)
    assert latch.take(snapshot, seen) is None, "the second began after this snapshot"
    assert latch.take(snapshot, latch.mark()) == Whiteout(3000, 3)


def test_short_money_reads_keep_the_amounts_unknown() -> None:
    from pokebench_env.blackout_readout import _money

    m = game(OVERWORLD)
    assert _money(m.read) == 3000
    assert _money(lambda a, n: b"" if a == 0x03005D8C else m.read(a, n)) is None
    assert _money(lambda a, n: b"" if a == SB1 + 0x490 else m.read(a, n)) is None


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
    event = latch.take(field, latch.mark())
    assert event == Whiteout(None, 1)
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


def test_switch_is_a_default_off_server_feature() -> None:
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})
