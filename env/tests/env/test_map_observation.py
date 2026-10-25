from pokebench_env.live_map import FullMap, MapTile
from pokebench_env.map_observation import build_observation, element_label, render_observation
from pokebench_env.map_observation_types import MapElement


def test_distinct_semantics_and_occupants_share_one_current_contract():
    shown = FullMap(3, 1, ("@W.",), (
        MapTile(0, 0, 0, 0, 0), MapTile(1, 0, 0, 0, 0), MapTile(2, 0, 0, 0, 0)
    ), (), ((1, 0, 1, 1),))
    elements = (
        MapElement("switch", 0, 0, color="blue"),
        MapElement("switch", 1, 0, color="green"),
        MapElement("arrow", 2, 0, direction="east", color="blue"),
    )
    observation = build_observation(shown, (1, 1), elements)
    text = render_observation(shown, observation)
    assert "blue switch" in text and "green switch" in text and "blue arrow east" in text
    assert "@" in text and "W" in text
    assert "(0,0)" in text and "(1,0)" in text
    assert len({element_label(e) for e in elements}) == 3
    assert shown.rows == ("@W.",)
    assert observation.json()["version"] == 1


def test_edges_are_separate_from_cell_occupancy_and_clipped_to_view():
    shown = FullMap(2, 1, ("..",), (MapTile(0, 0, 0, 0, 0), MapTile(1, 0, 0, 0, 0)), (), ())
    elements = (MapElement("rotating_gate", 0, 0, state="arm", group="gate:0", edge=(0, 0, 1, 0)),
                MapElement("switch", 20, 20, color="red"))
    observation = build_observation(shown, (12, 1), elements)
    assert len(observation.elements) == 1
    text = render_observation(shown, observation)
    assert "edge (0,0)-(1,0)" in text
    assert "red switch" not in text
