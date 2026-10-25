"""429f archived native Cmd_trygivecaughtmonnick YES/NO, no emulator input."""

import os
from dataclasses import asdict
from functools import cache
from pathlib import Path

import pytest

from pokebench_env import battle_text as bt
from pokebench_env.game_state import MapNames
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.readout import features_off_from_env
from pokebench_env.rerender import read_state, render
from pokebench_env.rom import resolve_rom

ID = "caught-nickname-prompt-v2"
V1 = "caught-nickname-prompt-v1"
ARCHIVES = [
    (4973, "e507c3f291dad853bac915d5a1ef6d76a6235653e9a6383e95599de39d3d50a8", "YES"),
    (4987, "e076bbb03a69065737a0bf788fbf148393fcd81cd9da50775b50cdf84d30afcb", "NO"),
    (7852, "63fddb50ecea8e2207f6a2be027b3625813525cf250bc476a7413707b537445c", "YES"),
]


@cache
def rom():
    return resolve_rom(os.environ).read_bytes()


def archive(number=4973, digest=ARCHIVES[0][1]):
    return cached_archive(number, digest)


@cache
def cached_archive(number, digest):
    return load_raw_ram(
        Path(__file__).parent / f"fixtures/astra-429f-{number}.json.gz",
        digest,
        rom=rom(),
    )


def switches():
    return features_off_from_env({}) - {
        V1,
        "expanded-menu-battle-information-v1",
        "battle-details-v2",
    }


@pytest.mark.parametrize("number,digest,selected", ARCHIVES)
def test_native_prompt_has_one_coherent_state_and_model_readout(number, digest, selected):
    read = archive(number, digest)
    off = switches() | {ID}
    before = read_state(read, MapNames({}), active_ui=True, off=off)
    after = read_state(read, MapNames({}), active_ui=True, off=off - {ID})
    assert before.active_ui.phase == "battle_resolving"
    assert before.battle.text_phase == "prompt"
    assert after.active_ui.phase == "battle_yes_no"
    assert after.active_ui.ready is True
    assert after.active_ui.selected == selected
    assert after.active_ui.details == {"prompt_kind": "nickname_caught"}
    text = render(after, off - {ID})
    assert f"Menu: battle_yes_no; selected {selected}" in text
    assert f"Interface: battle_yes_no; input ready; selected {selected}" in text
    assert "B answers NO" in text
    assert "controller_busy" not in text
    assert "input not ready" not in text
    left, right = asdict(before), asdict(after)
    left.pop("active_ui")
    right.pop("active_ui")
    assert left == right
    assert bt.wait_phase(read, turn_action_script=True) == "prompt"


@pytest.mark.parametrize(
    "address,value",
    [
        (bt.COMMUNICATION, b"\x00"),
        (bt.COMMUNICATION, b"\x02"),
        (bt.COMMUNICATION + 1, b"\x02"),
        (bt.MAIN_FUNC, bytes(4)),
        (0x02024083, b"\x0c"),
        (0x030022C4, bytes(4)),
    ],
)
def test_unready_invalid_or_wrong_owner_does_not_claim_input(address, value):
    read = archive()

    def patched(start, length):
        raw = bytearray(read(start, length))
        for index, byte in enumerate(value):
            if start <= address + index < start + length:
                raw[address + index - start] = byte
        return bytes(raw)

    off = switches() | {ID}
    assert read_state(patched, MapNames({}), active_ui=True, off=off) == read_state(
        patched,
        MapNames({}),
        active_ui=True,
        off=off - {ID},
    )


def test_v2_cannot_enable_prompt_recognition_without_v1():
    read = archive()
    off = switches() | {V1, ID}
    assert read_state(read, MapNames({}), active_ui=True, off=off) == read_state(
        read,
        MapNames({}),
        active_ui=True,
        off=off - {ID},
    )


def test_server_defaults_keep_omitted_v2_off():
    assert ID in features_off_from_env({})


def test_unrelated_ready_battle_question_retains_its_original_owner():
    read = archive()
    script = int.from_bytes(read(bt.SCRIPT_PC, 4), "little")

    def patched(start, length):
        raw = bytearray(read(start, length))
        if start <= script < start + length:
            raw[script - start] = 0x67  # Cmd_yesnobox, not Cmd_trygivecaughtmonnick.
        return bytes(raw)

    off = switches() | {ID}
    before = read_state(patched, MapNames({}), active_ui=True, off=off)
    assert before.battle.prompt.kind == "yes_no"
    assert before.battle.prompt.ready is True
    assert before == read_state(patched, MapNames({}), active_ui=True, off=off - {ID})
