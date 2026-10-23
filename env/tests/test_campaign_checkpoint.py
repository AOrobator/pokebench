import pytest
from pokebench_env.campaign_checkpoint import native_schedule, check_replay_regions


def test_native_schedule_uses_load_frame_not_first_observation_latency():
    entries = [{"frame": 1, "buttons": []}, {"frame": 456, "buttons": ["A"]}]
    assert native_schedule(entries, loaded_frame=8850) == {8852: [], 9307: ["A"]}


def test_schedule_refuses_missing_initial_input_bad_buttons_and_nonmonotone():
    for entries in [[], [{"frame": 1, "buttons": ["PRIVATE"]}], [{"frame": 2, "buttons": []}, {"frame": 1, "buttons": []}]]:
        with pytest.raises(ValueError):
            native_schedule(entries, loaded_frame=8850)


def test_region_equality_never_falls_back_to_a_similar_party():
    assert check_replay_regions({"ewram": b"a", "iwram": b"b"}, {"ewram": b"a", "iwram": b"b"}) == {"ewram": True, "iwram": True}
    with pytest.raises(ValueError):
        check_replay_regions({"ewram": b"a"}, {})
    assert check_replay_regions({"ewram": b"a"}, {"ewram": b"b"}) == {"ewram": False}
