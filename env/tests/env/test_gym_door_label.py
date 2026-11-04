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
