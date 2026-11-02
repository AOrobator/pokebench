import sys
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pokebench_env.map_observation import MapObservation, build_observation  # noqa: E402
from pokebench_env.map_observation_types import MapElement  # noqa: E402
from pokebench_env.readout import (  # noqa: E402
    SERVER_FEATURES,
    _step_on_pad,
    features_off_from_env,
    format_readout,
)
from pokebench_env.world import InteractionTarget  # noqa: E402
from tests.env.pocket import pocket_state  # noqa: E402


def observation(*elements):
    return cast(MapObservation, SimpleNamespace(elements=list(elements)))


def pad(x=12, y=12, state="floor_up", kind="warp", edge=None):
    return SimpleNamespace(kind=kind, state=state, edge=edge, x=x, y=y)


def target(x=12, y=12, destination=(25, 4, 7)):
    return InteractionTarget(
        "warp",
        x,
        y,
        3,
        "movement; activation depends on metatile (see local map)",
        destination=destination,
        name="Warp to map 4/1",
    )


def test_the_switch_is_known_to_the_server():
    # An id the server does not know is dropped from the run's switch list, so the pad label and the
    # agent-side tool would disagree about which run they belong to.
    assert "warp-target-navigation-v1" in SERVER_FEATURES


def test_a_floor_up_pad_is_recognised_on_its_own_tile():
    assert _step_on_pad(observation(pad()), target()) is True


def test_a_floor_down_hole_is_not_a_pad():
    # 0x68 holes are already traversable and already work as exits; enrolling them would widen the
    # change past the Lavaridge gym for no gain.
    assert _step_on_pad(observation(pad(state="floor_down")), target()) is False


def test_a_pad_on_another_tile_does_not_label_this_warp():
    assert _step_on_pad(observation(pad(x=4, y=16)), target()) is False


def test_no_observation_means_no_label():
    assert _step_on_pad(None, target()) is False


def test_the_pad_label_names_the_mechanic_and_withholds_the_destination():
    raw = target()
    labelled = replace(
        raw, name="Warp (step-on pad)", activation="step onto tile", destination=None
    ).text(named=True)
    assert "destination map" in raw.text()
    assert "destination" not in labelled
    assert "Warp (step-on pad)" in labelled
    assert "step onto tile" in labelled


def readout_state():
    """A pocket state whose observation carries a floor-up pad and whose targets carry its warp."""
    state = pocket_state()
    warp = InteractionTarget(
        "warp",
        8,
        6,
        3,
        "movement; activation depends on metatile (see local map)",
        destination=(25, 4, 2),
        name="Warp to map 4/1",
    )
    observation = build_observation(
        state.nearby, state.map_id, (MapElement("warp", 8, 6, "floor_up"),)
    )
    return replace(state, map_observation=observation, interaction_targets=(warp,))


def test_the_readout_labels_the_pad_with_its_mechanic_and_no_destination():
    text = format_readout(readout_state(), frozenset())
    assert "Warp (step-on pad)" in text
    assert "step onto tile" in text
    assert "destination map" not in text


def test_the_readout_is_unchanged_when_the_switch_is_off():
    on = format_readout(readout_state(), frozenset())
    off = format_readout(readout_state(), frozenset({"warp-target-navigation-v1"}))
    assert off != on
    assert "Warp (step-on pad)" not in off
    assert "destination map" in off


def test_the_switch_defaults_off_on_the_server():
    # The agent's play preset merges the switch OFF unless the recipe says otherwise, so the server
    # must default to OFF too or the two halves disagree about the same run.
    assert "warp-target-navigation-v1" in features_off_from_env({})
