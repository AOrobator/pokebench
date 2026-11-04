import struct

from pokebench_env.scene_journal import SceneJournal, read_scene
from tests.env.test_game_state import Memory


def field():
    m = Memory()
    m.put(0x030022C4, struct.pack("<I", 0x08085E5D))
    m.put(0x03000F2C, b"\x01")
    m.put(0x03005D8C, struct.pack("<I", 0x02025000))
    m.put(0x02025004, bytes([0, 3]))
    m.put(0x02021FC4, b"\xff")
    return m


def actor(m, slot, local, x, y, graphics=23, visible=True):
    body = bytearray(0x24)
    body[0] = 1
    body[4] = slot
    body[5] = graphics
    body[8:11] = bytes([local, 3, 0])
    struct.pack_into("<hh", body, 0x10, x + 7, y + 7)
    m.put(0x02037350 + slot * 0x24, body)
    sprite = bytearray(0x44)
    struct.pack_into("<HH", sprite, 0, 70, 100)
    sprite[0x3E] = 1 if visible else 5
    m.put(0x02020630 + slot * 0x44, sprite)


def test_transient_actor_and_silent_motion_survive_between_observations():
    m = field()
    j = SceneJournal(capacity=8)
    j.advance(m.read)
    actor(m, 1, 10, 20, 21, 77)
    j.advance(m.read)
    actor(m, 1, 10, 21, 21, 77)
    j.advance(m.read)
    m.put(0x02037350 + 0x24, bytes(0x24))
    j.advance(m.read)
    lines = [e["text"] for e in j.snapshot(0)["entries"]]
    assert any("object 10" in s and "appeared" in s for s in lines), lines
    assert any("(20,21) -> (21,21)" in s for s in lines), lines
    assert any("object 10" in s and "left view" in s for s in lines), lines


def test_reader_excludes_invisible_and_offscreen_sprites():
    m = field()
    actor(m, 1, 9, 20, 21, visible=False)
    assert read_scene(m.read).actors == ()
    actor(m, 1, 9, 20, 21)
    assert read_scene(m.read).actors[0].local_id == 9
    m.put(0x02020630 + 0x44 + 2, struct.pack("<H", 250))
    assert read_scene(m.read).actors == ()


def test_ring_gap_is_explicit_and_cursors_never_silently_reset():
    m = field()
    j = SceneJournal(capacity=2)
    for x in range(4):
        actor(m, 1, 9, x, 21)
        j.advance(m.read)
    s = j.snapshot(0)
    assert s["first_id"] > 1
    assert len(s["entries"]) == 2
    assert j.snapshot(s["last_id"])["entries"] == []


def test_scene_boundaries_map_changes_and_same_graphic_people_stay_distinct():
    m = field()
    actor(m, 1, 9, 20, 21)
    actor(m, 2, 11, 21, 21)
    j = SceneJournal()
    j.advance(m.read)
    actor(m, 1, 9, 20, 20)
    j.advance(m.read)
    m.put(0x03000F2C, b"\x00")
    j.advance(m.read)
    lines = [e["text"] for e in j.snapshot(0)["entries"]]
    assert any("object 9" in s and "moved" in s for s in lines)
    assert not any("object 11" in s and "moved" in s for s in lines)
    assert lines[-1].endswith("field controls returned")
    m.put(0x03000F2C, b"\x01")
    m.put(0x02025004, bytes([0, 4]))
    j.advance(m.read)
    assert j.snapshot(0)["entries"][-1]["text"].endswith("visible objects: none")


def test_generic_visual_sampling_bounds_and_no_normal_free_field_recording():
    m = field()
    j = SceneJournal(capacity=12, visual_interval=1)
    for _ in range(8):
        j.advance(m.read, lambda: "encoded png")
    s = j.snapshot(0)
    assert sum("image" in e for e in s["entries"]) == 6
    assert s["omitted_images"] == 2
    assert sum("image" in e for e in j.entries) == 8  # snapshot never mutates the journal
    m.put(0x030022C4, struct.pack("<I", 0x08000001))
    j.advance(m.read, lambda: "cinematic png")
    assert "screen unknown" in j.entries[-1]["text"]
    m = field()
    m.put(0x03000F2C, b"\x00")
    j = SceneJournal()
    j.advance(m.read, lambda: "unused")
    assert j.snapshot(0)["entries"] == []


def test_read_failure_recovers_without_inventing_movement():
    m = field()
    actor(m, 1, 9, 20, 21)
    j = SceneJournal()
    j.advance(m.read)
    j.advance(lambda a, n: b"")
    assert j.snapshot(0)["errors"] == 1
    actor(m, 1, 9, 22, 21)
    j.advance(m.read)
    assert not any("-> (22,21)" in e["text"] for e in j.entries)
    assert any("at (22,21)" in e["text"] for e in j.entries)
    for bad in (-1, j.last_id + 1):
        import pytest

        with pytest.raises(ValueError, match="cursor"):
            j.snapshot(bad)
    with pytest.raises(ValueError, match="positive"):
        SceneJournal(capacity=0)
    m.put(0x03005D8C, bytes(4))
    j.advance(m.read)
    assert "map owner" in j.snapshot(0)["last_error"]


def test_sprite_shape_wrap_map_inactive_player_and_graphic_replacement():
    m = field()
    actor(m, 1, 9, 20, 21)
    m.put(0x02037350 + 0x24 + 2, b"\x01")
    assert read_scene(m.read).actors[0].player
    j = SceneJournal()
    j.advance(m.read)
    actor(m, 1, 9, 20, 21, graphics=77)
    j.advance(m.read)
    assert any("left view" in e["text"] for e in j.entries)
    m.put(0x02020630 + 0x44, struct.pack("<HH", 255, 511))
    assert len(read_scene(m.read).actors) == 1
    m.put(0x02020630 + 0x44, struct.pack("<H", 0xC000))
    assert read_scene(m.read).actors == ()
    actor(m, 1, 9, 20, 21)
    m.put(0x02037350 + 0x24 + 4, b"\x40")
    assert read_scene(m.read).actors == ()


def test_native_field_text_only_delivers_printed_prefix_and_keeps_event_order(monkeypatch):
    import pokebench_env.scene_journal as module
    from pokebench_env.gba_text import GBA_TEXT
    from pokebench_env.world_context import FieldMessage

    m = field()
    encode = {s: b for b, s in GBA_TEXT.items()}
    payload = bytes(encode[c] for c in "Wait! Secret!") + b"\xff"
    m.put(0x02021FC4, payload)
    message = FieldMessage("page_wait", 5, True)
    monkeypatch.setattr(module, "read_field_message", lambda read: message)
    j = SceneJournal()
    j.advance(m.read)
    assert '"Wait!"' in j.entries[-1]["text"]
    assert not any("Secret" in e["text"] for e in j.entries)
    j.advance(m.read)
    first = j.last_id
    message = FieldMessage("printing", 6, False)
    j.advance(m.read)
    j.advance(m.read)
    message = FieldMessage("page_wait", 13, True)
    actor(m, 1, 9, 20, 21)
    j.advance(m.read)
    entries = j.snapshot(first)["entries"]
    assert "appeared" in entries[0]["text"]
    assert '"Secret!"' in entries[-1]["text"]
    # Speaker remains explicitly unknown; the nearby MAN_2 is not silently assigned.
    assert "speaker not established" in entries[-1]["text"]


def test_busy_frames_and_encoder_failures_are_explicit(monkeypatch):
    import pokebench_env.scene_journal as module

    m = field()
    j = SceneJournal()
    monkeypatch.setattr(module, "main_loop_idle", lambda read: False)
    j.advance(m.read)
    assert "mid-callback" in j.snapshot(0)["last_error"]
    monkeypatch.setattr(module, "main_loop_idle", lambda read: True)

    def broken():
        raise RuntimeError("encoder failed")

    j.advance(m.read, broken)
    assert j.snapshot(0)["errors"] == 2
    assert j.snapshot(0)["last_error"] == "encoder failed"


def test_identical_text_after_message_closes_or_scene_ends_is_delivered_again(monkeypatch):
    import pokebench_env.scene_journal as module
    from pokebench_env.gba_text import GBA_TEXT
    from pokebench_env.world_context import FieldMessage

    m = field()
    encode = {s: b for b, s in GBA_TEXT.items()}
    m.put(0x02021FC4, bytes(encode[c] for c in "Wait!") + b"\xff")
    message = FieldMessage("page_wait", 5, True)
    monkeypatch.setattr(module, "read_field_message", lambda read: message)
    j = SceneJournal()
    j.advance(m.read)
    message = None
    j.advance(m.read)
    message = FieldMessage("page_wait", 5, True)
    j.advance(m.read)
    m.put(0x03000F2C, b"\x00")
    message = None
    for _ in range(3):
        j.advance(m.read)
    m.put(0x03000F2C, b"\x01")
    message = FieldMessage("page_wait", 5, True)
    j.advance(m.read)
    quotations = [e["text"] for e in j.entries if "field text" in e["text"]]
    assert len(quotations) == 3, quotations
    assert all(line.endswith('"Wait!"') for line in quotations), quotations


def raw_sample(frame):
    from pokebench_env.raw_ram import REGIONS, RawRamSnapshot

    return RawRamSnapshot(
        1,
        frame,
        frame + 100,
        frame,
        "a" * 40,
        tuple(range(16)),
        0x1F,
        tuple((name, address, size, bytes(size)) for name, address, size in REGIONS),
    )


def test_safe_capture_defers_unknown_frames_and_recovers_without_inventing_motion(monkeypatch):
    import pokebench_env.scene_journal as module

    m = field()
    actor(m, 1, 9, 20, 21)
    idle = True
    monkeypatch.setattr(module, "main_loop_idle", lambda read: idle)
    journal = SceneJournal(safe_capture=True, raw_capture=raw_sample)
    journal.advance(m.read)
    idle = False
    actor(m, 1, 9, 25, 21)
    journal.advance(m.read)
    idle = None
    journal.advance(m.read)
    assert journal.errors == 0
    assert journal.snapshot(0)["coverage"]["deferred_frames"] == 2
    idle = True
    actor(m, 1, 9, 29, 21)
    journal.advance(m.read)
    coverage = journal.snapshot(0)["coverage"]
    assert coverage["frames"] == 4 and coverage["safe_frames"] == 2
    assert coverage["recoveries"] == 1
    assert not any("(20,21) -> (29,21)" in e["text"] for e in journal.entries)


def test_safe_capture_off_is_exact_legacy_and_real_failures_are_not_deferrals(monkeypatch):
    import pokebench_env.scene_journal as module

    m = field()
    monkeypatch.setattr(module, "main_loop_idle", lambda read: False)
    old, off = (
        SceneJournal(),
        SceneJournal(
            safe_capture=False, raw_capture=lambda frame: (_ for _ in ()).throw(AssertionError())
        ),
    )
    old.advance(m.read)
    off.advance(m.read)
    assert old.snapshot(0) == off.snapshot(0)
    assert "coverage" not in off.snapshot(0)
    monkeypatch.setattr(module, "main_loop_idle", lambda read: True)
    on = SceneJournal(
        safe_capture=True,
        raw_capture=lambda frame: (_ for _ in ()).throw(OSError("native copy failed")),
    )
    on.advance(m.read)
    assert on.errors == 1 and "native copy failed" in on.last_error
    assert on.snapshot(0)["coverage"]["deferred_frames"] == 0
