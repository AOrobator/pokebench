import struct

import pytest
from pydantic import ValidationError
from test_live_map import loaded

from pokebench_env.game_state import MapNames
from pokebench_env.readout import SERVER_FEATURES
from pokebench_env.strides import (
    SURF_FLOOR,
    SURFING,
    Point,
    Stride,
    StrideRequest,
    floor_of,
    native_refuses,
)
from pokebench_env.topology import Connection, read_topology


def request(**extra: object) -> StrideRequest:
    return StrideRequest(
        id="s",
        map_id=[0, 33],
        origin=Point(x=18, y=9),
        path=[Point(x=19, y=9)],
        elevation=1,
        automatic_running=False,
        **extra,
    )


def test_the_switch_reaches_the_server():
    assert "surf-navigation-v1" in SERVER_FEATURES


def test_surf_floor_is_plain_surfable_water_only():
    assert SURF_FLOOR == frozenset({0x10, 0x11, 0x12, 0x14, 0x15})
    assert floor_of(request(surfing=True)) == SURF_FLOOR
    assert floor_of(request()) == frozenset({0})
    assert floor_of(request(tall_grass=True)) == frozenset({0, 2})


def test_a_surfing_stride_may_not_also_cross_grass():
    with pytest.raises(ValidationError):
        request(surfing=True, tall_grass=True)


def test_receipt_shows_surfing_only_when_asked():
    assert "surfing" not in Stride(request()).receipt()
    assert Stride(request(surfing=True)).receipt()["surfing"] is True


@pytest.mark.parametrize(
    ("reason", "flags", "surfing", "refused"),
    [
        ("permitted", 1, False, False),
        ("not_on_foot", 8, False, True),
        ("not_on_foot", SURFING, True, False),
        ("not_on_foot", 2, True, True),
        ("not_on_foot", None, True, True),
        ("permitted", 1, True, True),
        ("battle", SURFING, True, True),
        ("forced_or_transitioning", SURFING, True, True),
        ("field_controls_locked", SURFING, True, True),
        ("no_running_shoes", 1, False, False),
    ],
)
def test_native_refusal(reason, flags, surfing, refused):
    assert native_refuses(reason, flags, surfing=surfing) is refused


def test_connection_json_carries_water_edges_only_when_read():
    plain = Connection("NORTH", 0, (0, 34), "ROUTE 119", ((1, 0),))
    assert "water_edges" not in plain.json()
    wet = Connection("NORTH", 0, (0, 34), "ROUTE 119", ((1, 0),), ((2, 0),))
    assert wet.json()["water_edges"] == [{"x": 2, "y": 0}]


def test_read_topology_reads_water_edges_only_when_asked():
    m = loaded()
    m.put(0x02037324, struct.pack("<I", 0x0200A000))
    m.put(0x0200A000, struct.pack("<iI", 1, 0x0200B000))
    m.put(0x0200B000, struct.pack("<B3xiBB2x", 2, -3, 0, 16))
    off = read_topology(m.read, MapNames({(0, 16): "ROUTE 101"}))
    assert off is not None and off.connections[0].water_edges is None
