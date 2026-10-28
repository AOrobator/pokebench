"""caught-nickname-prompt-v1: the post-catch nickname YES/NO box is an open battle question.

The fixture is read-only raw RAM from 2026-10-20T16-14-34_qwen36-gpu1_c6c2 (raw-ram 5834, turn
406), cut to the addresses the readers use. Cmd_trygivecaughtmonnick (battle script opcode 0xF3,
BattleScript_SuccessBallThrow) waits in its input state (gBattleCommunication[0] == 1) with the
cursor on NO. The thrown ball is a turn action, so its script runs under RunTurnActionsFunctions
with gCurrentActionFuncId == B_ACTION_EXEC_SCRIPT, not under the battle script runners, and
gBattleOutcome is still 0. The run sat on this box from 4:58 PM with the readout saying
"controller_busy" and every A dropped.
"""

import json
import threading
import types
from pathlib import Path

import pytest
from fastapi import FastAPI

from pokebench_env import battle_text as bt
from pokebench_env import rerender
from pokebench_env.battle_message_waiting import RESOLVING, input_clause
from pokebench_env.battle_state import OUTCOME, read_battle_state
from pokebench_env.caught_nickname import ACTION_FUNC, EXEC_SCRIPT, RUN_TURN_ACTIONS, SWITCH
from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

FIXTURE = json.loads((Path(__file__).parent / "fixtures/nickname-box-c6c2-5834.json").read_text())
NICKNAME = bt.BattlePrompt("nickname_caught", True, "NO")


class Archived:
    def __init__(self, memory: dict[str, str]) -> None:
        self.regions = {int(k, 16): bytearray.fromhex(v) for k, v in memory.items()}

    def read(self, address: int, length: int) -> bytes:
        for base, data in self.regions.items():
            if base <= address and address + length <= base + len(data):
                return bytes(data[address - base : address - base + length])
        raise ValueError(f"outside fixture: {address:#x}")

    def put(self, address: int, value: int) -> None:
        for base, data in self.regions.items():
            if base <= address < base + len(data):
                data[address - base] = value
                return
        raise ValueError(f"outside fixture: {address:#x}")


def box() -> Archived:
    return Archived(FIXTURE["frames"][0]["memory"])


def test_the_recorded_box_runs_under_run_turn_actions_with_a_script_action() -> None:
    read = box().read
    assert int.from_bytes(read(bt.MAIN_FUNC, 4), "little") == RUN_TURN_ACTIONS
    assert read(OUTCOME, 1)[0] == 0
    assert read(ACTION_FUNC, 1)[0] == EXEC_SCRIPT
    script = int.from_bytes(read(bt.SCRIPT_PC, 4), "little")
    assert read(script, 1)[0] == 0xF3
    assert read(bt.COMMUNICATION, 2) == b"\x01\x01"


def test_off_reads_the_box_as_a_busy_battle_as_before() -> None:
    read = box().read
    assert bt.read_battle_prompt(read) is None
    assert bt.battle_text_phase(read) == "busy"
    assert bt.wait_phase(read) == "busy"
    battle = read_battle_state(read)
    assert (battle.prompt, battle.text_phase) == (None, "busy")
    assert input_clause(battle) == RESOLVING


def test_on_reads_the_open_nickname_question_with_its_cursor() -> None:
    read = box().read
    assert bt.read_battle_prompt(read, turn_action_script=True) == NICKNAME
    assert bt.battle_text_phase(read, turn_action_script=True) == "prompt"
    assert bt.wait_phase(read, turn_action_script=True) == "prompt"
    battle = read_battle_state(read, turn_action_prompt=True)
    assert (battle.prompt, battle.text_phase) == (NICKNAME, "prompt")
    assert input_clause(battle) == (
        "battle YES/NO box open (nickname the caught Pokémon), cursor on NO — "
        "UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO"
    )


def test_on_ignores_run_turn_actions_when_it_is_not_running_a_script() -> None:
    memory = box()
    memory.put(ACTION_FUNC, 12)  # B_ACTION_FINISHED
    assert bt.read_battle_prompt(memory.read, turn_action_script=True) is None
    assert bt.battle_text_phase(memory.read, turn_action_script=True) == "busy"


def test_the_switch_is_a_server_feature_off_by_default() -> None:
    assert SWITCH == "caught-nickname-prompt-v1"
    assert SWITCH in SERVER_FEATURES
    assert SWITCH in features_off_from_env({})


def test_production_state_read_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[bool] = []

    def capture(read: object, maps: object, **options: object) -> None:
        seen.append(bool(options["caught_nickname_enabled"]))

    monkeypatch.setattr(rerender, "read_game_state", capture)
    rerender.read_state(box().read, MapNames({}), active_ui=True, off=frozenset({SWITCH}))
    rerender.read_state(box().read, MapNames({}), active_ui=True, off=frozenset())
    assert seen == [False, True]


def test_production_battle_wait_honours_the_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    from test_observation import Shot

    from pokebench_env import serve

    made: list[bool] = []

    class Capture(bt.BattleWait):
        def __init__(self, read: bt.ReadMemory, **options: bool) -> None:
            made.append(options["turn_action_script"])
            super().__init__(read, **options)

    monkeypatch.setattr(serve, "BattleWait", Capture)

    class Emulator:
        def run_frame_with_buttons(self, buttons: list[str]) -> None:
            pass

    for off in (SWITCH, ""):
        monkeypatch.setenv(
            "POKEBENCH_FEATURES_OFF", ",".join(filter(None, [off, "scene-journal-safe-capture-v1"]))
        )
        app = FastAPI()
        serve.run(
            [],
            uvicorn=types.SimpleNamespace(run=lambda *a, **k: None),
            vendor_main=lambda: None,
            observation=(app, Shot, box().read, MapNames({}), threading.Lock()),
            pause=(app, types.SimpleNamespace(step_environment=lambda actions: None)),
            frames=Emulator,
            battle_text=(app, Emulator, box().read),
        )
    assert made == [False, True]


def test_the_battle_wait_ends_on_the_box_only_with_the_switch() -> None:
    read = box().read
    on = bt.BattleWait(read, turn_action_script=True)
    assert on.wait(lambda: "now", threading.Lock()) == ("now", "prompt", 0)
    off = bt.BattleWait(read)
    result: dict[str, object] = {}
    thread = threading.Thread(
        target=lambda: result.update(r=off.wait(lambda: "late", threading.Lock(), bound_frames=1)),
        daemon=True,
    )
    thread.start()
    thread.join(0.1)
    assert thread.is_alive()
    off.on_frame()
    thread.join(5)
    assert result["r"] == ("late", "bound", 1)
