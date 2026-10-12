import struct

import pytest
from test_live_map import loaded, obj

from pokebench_env.world import read_targets


def events():
    m = loaded()
    m.put(0x02002000, bytes([1, 1, 1, 2]) + struct.pack('<IIII', 0x08001000, 0x02009000, 0x08002000, 0x08003000))
    body = bytearray(24)
    body[0] = 2
    struct.pack_into('<I', body, 16, 0x08004000)
    m.put(0x08001000, body)
    m.put(0x08002000, struct.pack('<hhBxHH2xI', 4, 4, 3, 0x4001, 1, 0x08005000))
    m.put(0x08003000, struct.pack('<HHBB2xI', 3, 1, 0, 1, 0x08006000) + struct.pack('<HHBB2xI', 4, 1, 0, 7, 0x00100001))
    return m


def test_all_events_use_world_coordinates_and_live_object_positions():
    m = events()
    obj(m, 1, 4, 3)
    targets = read_targets(m.read, (1, 0))
    assert targets is not None
    assert [(t.kind, t.x, t.y) for t in targets] == [
        ('object', 4, 3), ('warp', 0, 1), ('coordinate_trigger', 4, 4),
        ('background', 3, 1), ('hidden_item', 4, 1),
    ]
    assert targets[3].facing == 'up'
    assert targets[0].availability == 'conditional'
    assert targets[2].activation == 'step'
    assert targets[4].availability == 'conditional'


def test_null_script_decoration_is_a_live_object_not_an_interaction_target():
    m = events()
    m.put(0x08001010, bytes(4))
    assert all(t.kind != 'object' for t in read_targets(m.read, (1, 0)))


@pytest.mark.parametrize('address', [0x0203731C, 0x02002004, 0x02002008, 0x0200200C, 0x02002010])
def test_invalid_event_pointer_returns_unavailable_not_empty(address):
    m = events()
    m.put(address, bytes(4))
    assert read_targets(m.read, (1, 0)) is None


def test_background_unknown_kind_is_not_assumed_to_be_sign():
    m = events()
    m.put(0x08003005, b'\x09')
    assert read_targets(m.read, (1, 0))[3].kind == 'background_unknown'
