"""Separate blocked exit facts from choices without inferring a route."""

from dataclasses import replace

import pytest

from pokebench_env.exit_reach import ExitReach
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, state_json
from pokebench_env.rerender import render
from tests.env.test_exit_reach import NONE_WARPS, ROUTE104, recorded_off, state

ID = "available-exits-presentation-v1"


def test_registered_server_switch_default_off():
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})


@pytest.mark.parametrize("whole_map", [False, True])
def test_native_blocked_choices_become_facts_with_no_approach_or_arrival_advice(whole_map):
    off = frozenset(recorded_off(ROUTE104)) | {ID}
    if whole_map:
        off -= {"full-map-navigation-v1"}
    s = state(ROUTE104, 22580, list(off))
    original = state_json(s)
    before, after = render(s, off), render(s, off - {ID})
    assert "- NORTH -> RUSTBORO CITY" in before
    assert "- NORTH -> RUSTBORO CITY" not in after
    assert "- SOUTH -> ROUTE105" not in after
    assert state_json(s) == original
    assert "Unavailable from here:" in after
    facts = next(line for line in after.splitlines() if line.startswith("Unavailable from here:"))
    assert "NORTH edge" in facts and "RUSTBORO CITY" in facts
    for x, y in NONE_WARPS:
        assert f"({x},{y})" in facts
        assert f"Warp destination at ({x},{y}):" not in after
        assert not any(f"at ({x},{y}), elevation" in line for line in after.splitlines())
        assert not any(f"({x},{y}) ->" in line for line in after.splitlines())
    assert "navigate_to" not in facts and "stand on" not in facts
    assert "Warps:" in after and "(17,50)" in after
    assert render(s, off) == before


def test_unknown_reachability_remains_a_candidate_not_unavailable():
    off = frozenset(recorded_off(ROUTE104)) | {ID}
    s = state(ROUTE104, 22580, list(off))
    unknown = replace(s, exit_reach=None, surf_gate=None)
    output = render(unknown, off - {ID})
    assert "Unavailable from here:" not in output
    assert "- NORTH -> RUSTBORO CITY" in output
    assert "Warp destination at (5,18):" in output


def test_reclassification_restores_a_previously_blocked_exit_without_a_cache():
    off = frozenset(recorded_off(ROUTE104)) | {ID}
    s = state(ROUTE104, 22580, list(off))
    assert s.exit_reach is not None
    reachable = replace(
        s, exit_reach=ExitReach(s.exit_reach.width, s.exit_reach.height, s.exit_reach.foot, (), ())
    )
    assert "- NORTH -> RUSTBORO CITY" in render(reachable, off - {ID})
