"""Separate blocked exit facts from choices without inferring a route."""

from pokebench_env.readout import SERVER_FEATURES, features_off_from_env

ID = "available-exits-presentation-v1"


def test_registered_server_switch_default_off():
    assert ID in SERVER_FEATURES
    assert ID in features_off_from_env({})
