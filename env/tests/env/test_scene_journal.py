import struct

from pokebench_env.scene_journal import SceneJournal, read_scene
from tests.env.test_game_state import Memory


def field():
    m = Memory()
    m.put(0x030022C4, struct.pack('<I', 0x08085E5D))
    m.put(0x03000F2C, b'\x01')
    m.put(0x03005D8C, struct.pack('<I', 0x02025000))
    m.put(0x02025004, bytes([3, 0]))
    m.put(0x02021FC4, b'\xff')
    return m


def actor(m, slot, local, x, y, graphics=23, visible=True):
    body = bytearray(0x24)
    body[0] = 1
    body[4] = slot
    body[5] = graphics
    body[8:11] = bytes([local, 3, 0])
    struct.pack_into('<hh', body, 0x10, x+7, y+7)
    m.put(0x02037350+slot*0x24, body)
    sprite = bytearray(0x44)
    struct.pack_into('<HH', sprite, 0, 70, 100)
    sprite[0x3e] = 1 if visible else 5
    m.put(0x02020630+slot*0x44, sprite)


def test_transient_actor_and_silent_motion_survive_between_observations():
    m = field()
    j = SceneJournal(capacity=8)
    j.advance(m.read)
    actor(m, 1, 10, 20, 21, 77)
    j.advance(m.read)
    actor(m, 1, 10, 21, 21, 77)
    j.advance(m.read)
    m.put(0x02037350+0x24, bytes(0x24))
    j.advance(m.read)
    lines = [e['text'] for e in j.snapshot(0)['entries']]
    assert any('object 10' in s and 'appeared' in s for s in lines), lines
    assert any('(20,21) -> (21,21)' in s for s in lines), lines
    assert any('object 10' in s and 'left view' in s for s in lines), lines


def test_reader_excludes_invisible_and_offscreen_sprites():
    m = field()
    actor(m, 1, 9, 20, 21, visible=False)
    assert read_scene(m.read).actors == ()
    actor(m, 1, 9, 20, 21)
    assert read_scene(m.read).actors[0].local_id == 9
    m.put(0x02020630+0x44+2, struct.pack('<H', 250))
    assert read_scene(m.read).actors == ()


def test_ring_gap_is_explicit_and_cursors_never_silently_reset():
    m = field()
    j = SceneJournal(capacity=2)
    for x in range(4):
        actor(m, 1, 9, x, 21)
        j.advance(m.read)
    s = j.snapshot(0)
    assert s['first_id'] > 1
    assert len(s['entries']) == 2
    assert j.snapshot(s['last_id'])['entries'] == []
