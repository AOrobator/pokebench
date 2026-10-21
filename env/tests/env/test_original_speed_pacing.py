"""Explicit game-clock policy; publication and dialog activation stay separate."""

import os
import sys
import threading
from types import ModuleType, SimpleNamespace

import pytest

from pokebench_env import serve
from pokebench_env.frame_pacing import EMERALD_REALTIME_FPS
from pokebench_env.game_state import GameState
from pokebench_env.launcher import ServerSpec, server_command
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout, state_json

ID = "original-speed-pacing-v1"


class Clock:
    def __init__(self):
        self.now = 100.0
        self.sleeps = []

    def time(self):
        return self.now

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.mark.parametrize("enabled,target", [(False, EMERALD_REALTIME_FPS), (True, 80.0)])
def test_production_run_selects_explicit_deadline_clock_and_preserves_conditional_four_x(
    monkeypatch, enabled, target
):
    clock = Clock()

    class Server:
        time = clock

        def game_loop(self):
            # These are conditional vendor requests, not proof that production's
            # currently disabled natural-dialog detector ever selects 320.
            for requested in (80, 80, 80, 320, 320, 320):
                clock.now += 0.001
                self.time.sleep(1 / requested)

    server = Server()
    monkeypatch.setattr(sys, "argv", ["test"])
    cache_installs = []
    monkeypatch.setattr(
        serve,
        "install_on_demand_frame_cache",
        lambda *args, **kwargs: cache_installs.append((args, kwargs)),
    )
    serve.run(
        [],
        SimpleNamespace(run=lambda: None),
        lambda: server.game_loop(),
        frame_cache=(object(), lambda: 0),
        pacing=server,
        original_speed_pacing=enabled,
    )
    assert len(cache_installs) == 1 and cache_installs[0][1] == {}
    period = 1 / target
    assert clock.sleeps == pytest.approx(
        [period - 0.001] * 3 + [period / 4, period / 4 - 0.001, period / 4 - 0.001]
    )
    server.time.sleep(1.0)
    assert clock.sleeps[-1] == 1.0


def test_default_python_server_selection_is_off_and_transport_rejects_unknown_ids():
    assert SERVER_FEATURES[-16] == ID
    assert ID in features_off_from_env({})
    assert features_off_from_env({"POKEBENCH_FEATURES_OFF": ID}) == frozenset({ID})
    assert ID not in features_off_from_env({"POKEBENCH_FEATURES_OFF": ""})
    with pytest.raises(ValueError, match="unknown"):
        features_off_from_env({"POKEBENCH_FEATURES_OFF": ID + "-typo"})


def test_clock_policy_does_not_change_readout_bytes_or_state_shape():
    state = GameState(
        "overworld",
        True,
        "MAY",
        "PETALBURG CITY",
        (0, 9),
        (10, 10),
        "down",
        False,
        (),
        1000,
        (),
        (0, 5, 0),
    )
    before = state_json(state)
    assert format_readout(state, frozenset({ID})) == format_readout(state, frozenset())
    assert state_json(state) == before


def test_human_factory_keeps_recorded_nominal_clock_even_with_legacy_explicit_env(monkeypatch):
    clock = Clock()

    class Server:
        time = clock

        def game_loop(self):
            clock.now += 0.001
            self.time.sleep(1 / 80)

    server = Server()
    # The human launcher predates this feature and supplies an explicit OFF
    # list. Absence from that list must not accelerate recorded human play.
    monkeypatch.setenv("POKEBENCH_FEATURES_OFF", "named-interactions-v1")
    monkeypatch.setattr(sys, "argv", ["test"])
    monkeypatch.setattr(
        serve, "install_human", lambda *_args, **_kwargs: SimpleNamespace(set_paused=lambda: None)
    )
    monkeypatch.setattr(serve, "install_pause", lambda *_args, **_kwargs: None)
    serve.run(
        [],
        SimpleNamespace(run=lambda: None),
        lambda: server.game_loop(),
        pacing=server,
        original_speed_pacing=True,
        human=(object(), object(), "human-test-token"),
    )
    assert clock.sleeps == pytest.approx([1 / EMERALD_REALTIME_FPS - 0.001])
    assert ID in features_off_from_env(os.environ)


@pytest.mark.parametrize(
    "disabled,expected", [(None, False), (ID, False), ("", True), (ID + "-typo", None)]
)
def test_actual_server_main_validates_feature_transport_and_passes_explicit_clock_policy(
    monkeypatch, tmp_path, disabled, expected
):
    native = SimpleNamespace(frame_counter=0)
    vendor = SimpleNamespace(
        app=object(),
        env=SimpleNamespace(core=native),
        frame_manager=object(),
        memory_lock=threading.Lock(),
        main=lambda: None,
    )
    pokemon_package = ModuleType("pokemon_env")
    emulator_module = ModuleType("pokemon_env.emulator")
    emulator_module.EmeraldEmulator = type("FakeEmulator", (), {})
    pokemon_package.emulator = emulator_module
    server_package = ModuleType("server")
    server_package.app = vendor
    monkeypatch.setitem(sys.modules, "pokemon_env", pokemon_package)
    monkeypatch.setitem(sys.modules, "pokemon_env.emulator", emulator_module)
    monkeypatch.setitem(sys.modules, "server", server_package)
    monkeypatch.setattr(serve, "install_deadline_frame_stream", lambda *_args: None)
    monkeypatch.setattr(serve, "install_battle_journal", lambda *_args: None)
    monkeypatch.setattr(
        serve, "resolve_rom", lambda _env: SimpleNamespace(read_bytes=lambda: b"test")
    )
    monkeypatch.setattr(serve.MapNames, "load", lambda _path: object())
    monkeypatch.setattr(serve, "RawRamArchive", lambda *_args: object())
    monkeypatch.setattr(serve, "make_memory_reader", lambda _owner: object())
    monkeypatch.delenv("POKEBENCH_HUMAN_TOKEN", raising=False)
    if disabled is None:
        monkeypatch.delenv("POKEBENCH_FEATURES_OFF", raising=False)
    else:
        monkeypatch.setenv("POKEBENCH_FEATURES_OFF", disabled)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["serve", "--port", "8181", "--no-ocr"])
    calls = []
    monkeypatch.setattr(serve, "run", lambda argv, **kwargs: calls.append((argv, kwargs)))
    if expected is None:
        with pytest.raises(ValueError, match="unknown"):
            serve.main()
        assert calls == []
        return
    serve.main()
    assert calls[0][1]["original_speed_pacing"] is expected
    assert "--no-ocr" in calls[0][0]
    assert server_command(sys.executable, ServerSpec(8181, True, None))[-1] == "--no-ocr"
