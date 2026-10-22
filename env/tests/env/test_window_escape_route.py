"""window-escape-route-v1: the state carries the whole map; the readout keeps its local map."""

from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import read_state, render
from tests.env.test_feature_switches import map_memory
from tests.env.test_game_state import MAPS

ID = "window-escape-route-v1"
BASE = ("ram-state-v1", "live-map-v1", "live-player-position-v1", "bounded-navigation-v1")


def only(*on: str) -> frozenset[str]:
    return frozenset(SERVER_FEATURES) - set(on)


def state(off: frozenset[str]):
    return read_state(map_memory().read, MAPS, active_ui=False, off=off)


def test_off_sends_no_whole_map() -> None:
    off = only(*BASE)
    assert state(off).full_map is None
    assert "map_grid" not in state_json(state(off))


def test_on_sends_the_whole_map_full_map_navigation_would_and_keeps_the_readout() -> None:
    off, on, full = only(*BASE), only(*BASE, ID), only(*BASE, "full-map-navigation-v1")
    escaped = state(on)
    assert escaped.full_map is not None
    assert state_json(escaped)["map_grid"] == state_json(state(full))["map_grid"]
    assert render(escaped, on) == render(state(off), off)
    assert render(state(full), full) != render(state(off), off)


def test_default_off_and_a_known_server_switch() -> None:
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})
