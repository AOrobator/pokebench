"""GYM is printed on the exterior and in PetalburgCity_Text_ThisIsGymSign.

The popup only names the city; keep the building kind without exposing a leader or route.
"""

import pytest

from pokebench_env.exit_labels import destination_name


@pytest.mark.parametrize("city", ["PETALBURG CITY", "RUSTBORO CITY", "DEWFORD TOWN"])
def test_gym_suffix_survives_popup_name(city: str) -> None:
    assert destination_name(city + " GYM", city, enabled=True) == city + " GYM"
    assert destination_name(city + " GYM", city, enabled=False) == city


@pytest.mark.parametrize(
    "internal,popup",
    [
        (None, None),
        ("ROUTE104", "ROUTE 104"),
        ("RUSTBORO CITY HOUSE1", "RUSTBORO CITY"),
        ("GYM HOUSE", "HOUSE"),
    ],
)
def test_other_destinations_unchanged(internal: str | None, popup: str | None) -> None:
    assert destination_name(internal, popup, enabled=True) == popup


def test_unknown_popup_and_existing_gym_label() -> None:
    assert destination_name("RUSTBORO CITY GYM", None, enabled=True) is None
    assert (
        destination_name("RUSTBORO CITY GYM", "RUSTBORO CITY GYM", enabled=True)
        == "RUSTBORO CITY GYM"
    )


def test_registered_default_off() -> None:
    from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

    assert "gym-door-label-v1" in SERVER_FEATURES
    assert "gym-door-label-v1" in features_off_from_env({})


@pytest.mark.parametrize("sections", [False, True])
def test_production_native_petalburg_door(sections: bool) -> None:
    from pokebench_env import rerender
    from pokebench_env.readout import SERVER_FEATURES
    from tests.env.test_readout_truth_fixes import BY_KEY, FixtureMemory, maps, operator_rom

    frame = BY_KEY["dc5a-raw00010618"]
    read = FixtureMemory(frame, operator_rom())
    on = {
        "ram-state-v1",
        "live-map-v1",
        "world-targets-v1",
        "world-destinations-v1",
        "named-warp-destinations-v1",
        "exit-labels-v2",
    }
    if sections:
        on.add("exit-labels-v3")
    off = frozenset(SERVER_FEATURES) - on
    before = rerender.read_state(read, maps(), active_ui=True, off=off)
    after = rerender.read_state(read, maps(), active_ui=True, off=off - {"gym-door-label-v1"})
    assert before.exit_labels is not None and after.exit_labels is not None
    assert before.exit_labels.name_map()[(8, 1)] == "PETALBURG CITY"
    assert after.exit_labels.name_map()[(8, 1)] == "PETALBURG CITY GYM"
    text = rerender.render(after, off - {"gym-door-label-v1"})
    assert "PETALBURG CITY GYM (map 8/1)" in text
    if sections:
        assert after.exit_sections is not None
        assert "PETALBURG CITY GYM" in str(after.exit_sections)
    # Disabling only the new flag restores the complete previous observation bytes.
    again = rerender.read_state(read, maps(), active_ui=True, off=off)
    assert rerender.render(again, off) == rerender.render(before, off)
