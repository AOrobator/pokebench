import sys
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import cast

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pokebench_env.map_observation import MapObservation  # noqa: E402
from pokebench_env.readout import SERVER_FEATURES, _step_on_pad  # noqa: E402
from pokebench_env.world import InteractionTarget  # noqa: E402


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
