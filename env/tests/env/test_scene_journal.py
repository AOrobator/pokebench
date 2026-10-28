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


def test_frame_hook_calls_original_step_before_recording_and_exposes_cursor_errors():
    from fastapi import FastAPI
    from test_view import get

    from pokebench_env.scene_journal import install_scene_journal

    m = field()

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            actor(m, 1, 9, 20, 21)

    api = FastAPI()
    journal = install_scene_journal(api, Emulator, m.read, lambda: "png")
    Emulator().run_frame_with_buttons(["B"])
    assert journal.frame == 1
    assert any("object 9" in e["text"] for e in journal.entries)
    assert get(api, "/pokebench/scene/events", b"after=0")[0] == 200
    assert get(api, "/pokebench/scene/events", b"after=999")[0] == 409


def test_serve_factory_switch_and_frozen_screenshot_adapter(monkeypatch):
    import types

    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_view import get

    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.serve import run

    class Shot(BaseModel):
        screenshot_base64: str = "frozen image"

    for enabled, frozen in [(False, False), (True, True), (True, False)]:
        m = field()
        actor(m, 1, 9, 20, 21)

        class Emulator:
            def run_frame_with_buttons(self, buttons):
                pass

        api = FastAPI()
        monkeypatch.setenv(
            "POKEBENCH_FEATURES_OFF",
            ",".join(f for f in SERVER_FEATURES if not enabled or f != "cutscene-journal-v1"),
        )
        shot = (lambda: lambda: Shot()) if frozen else (lambda: Shot())
        run(
            [],
            types.SimpleNamespace(run=lambda *a, **kw: None),
            lambda: Emulator().run_frame_with_buttons([]),
            observation=(api, shot, m.read, MapNames({})),
            frames=Emulator,
        )
        response = get(api, "/pokebench/scene/events")
        assert response[0] == (200 if enabled else 404)
        if enabled:
            import json

            assert any(e.get("image") == "frozen image" for e in json.loads(response[2])["entries"])


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


def test_safe_capture_retains_bounded_incident_window_and_persists_off_frame_hook(
    monkeypatch, tmp_path
):
    import json

    import pokebench_env.scene_journal as module
    from pokebench_env.raw_ram import load_raw_ram

    idle = True
    monkeypatch.setattr(module, "main_loop_idle", lambda read: idle)
    journal = SceneJournal(safe_capture=True, raw_capture=raw_sample)
    m = field()
    for _ in range(3):
        journal.advance(m.read)
    idle = False
    for _ in range(20):
        journal.advance(m.read)
    idle = True
    journal.advance(m.read)
    journal.advance(m.read)
    first = journal.snapshot(0)["coverage"]
    assert first["diagnostic_samples"] == 8
    assert first["diagnostic_omitted_samples"] == 16
    assert not list(tmp_path.iterdir())
    journal.persist_diagnostics(tmp_path)
    manifest = json.loads((tmp_path / "current.json").read_text())
    assert manifest["samples"] == 8 and manifest["retained_windows"] == 2
    assert manifest["omitted_samples"] == 16
    index = tmp_path / manifest["directory"] / "index.jsonl"
    receipts = [json.loads(line) for line in index.read_text().splitlines()]
    assert len(receipts) == 8
    for receipt in receipts:
        archived = load_raw_ram(index.parent / receipt["path"], receipt["sha256"])
        assert archived.metadata["frame"] == receipt["frame"]
    # Ordinary frames do not overwrite the incident after it has recovered.
    for _ in range(20):
        journal.advance(m.read)
    journal.persist_diagnostics(tmp_path)
    assert json.loads((tmp_path / "current.json").read_text()) == manifest
    for _ in range(3):
        idle = False
        journal.advance(m.read)
        idle = True
        journal.advance(m.read)
        journal.advance(m.read)
        journal.persist_diagnostics(tmp_path)
    assert len(list(tmp_path.glob("window-*"))) == 2


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


def test_safe_capture_production_server_factory_and_endpoint(monkeypatch, tmp_path):
    import json
    import types

    from fastapi import FastAPI
    from pydantic import BaseModel
    from test_view import get

    import pokebench_env.scene_journal as module
    from pokebench_env.game_state import MapNames
    from pokebench_env.readout import SERVER_FEATURES
    from pokebench_env.serve import run

    server = tmp_path / "server"
    server.mkdir()
    monkeypatch.chdir(server)
    idle = False
    monkeypatch.setattr(module, "main_loop_idle", lambda read: idle)
    monkeypatch.setenv(
        "POKEBENCH_FEATURES_OFF",
        ",".join(
            f
            for f in SERVER_FEATURES
            if f not in {"cutscene-journal-v1", "scene-journal-safe-capture-v1"}
        ),
    )

    class Shot(BaseModel):
        screenshot_base64: str = "image"

    class Emulator:
        def run_frame_with_buttons(self, buttons):
            pass

    def step():
        nonlocal idle
        emulator = Emulator()
        emulator.run_frame_with_buttons([])
        idle = True
        emulator.run_frame_with_buttons([])

    api = FastAPI()
    run(
        [],
        types.SimpleNamespace(run=lambda *a, **kw: None),
        step,
        observation=(api, lambda: Shot(), field().read, MapNames({})),
        frames=Emulator,
        scene_raw_capture=raw_sample,
    )
    status, _, body = get(api, "/pokebench/scene/events")
    assert status == 200
    reply = json.loads(body)
    assert reply["errors"] == 0
    assert reply["coverage"]["deferred_frames"] == 1
    assert reply["coverage"]["safe_frames"] == 1
    assert reply["coverage"]["persisted_revision"] > 0
    assert (tmp_path / "scene-diagnostics/current.json").exists()


def test_diagnostic_writer_is_outside_frame_lock_and_retries_failed_publication(
    monkeypatch, tmp_path
):
    import threading

    import pokebench_env.raw_ram as raw
    import pokebench_env.scene_journal as module

    idle = False
    monkeypatch.setattr(module, "main_loop_idle", lambda read: idle)
    journal = SceneJournal(safe_capture=True, raw_capture=raw_sample)
    m = field()
    journal.advance(m.read)
    idle = True
    journal.advance(m.read)
    original = module.persist_diagnostic_window

    def concurrent_writer(directory, revision, samples, omitted):
        done = threading.Event()
        thread = threading.Thread(target=lambda: (journal.advance(m.read), done.set()))
        thread.start()
        assert done.wait(5), "diagnostic persistence held the frame journal lock"
        thread.join()
        return original(directory, revision, samples, omitted)

    monkeypatch.setattr(module, "persist_diagnostic_window", concurrent_writer)
    replace = raw.os.replace

    def fail_once(source, destination):
        raise OSError("disk publication failed")

    monkeypatch.setattr(raw.os, "replace", fail_once)
    journal.persist_diagnostics(tmp_path)
    assert journal.snapshot(0)["coverage"]["diagnostic_error"] == "disk publication failed"
    assert journal.persisted_revision == 0
    monkeypatch.setattr(raw.os, "replace", replace)
    journal.persist_diagnostics(tmp_path)
    assert journal.snapshot(0)["coverage"]["diagnostic_error"] is None
    assert journal.persisted_revision > 0


def test_diagnostic_window_bounds_and_revision_integrity(tmp_path):
    from dataclasses import replace

    import pytest

    from pokebench_env.raw_ram import persist_diagnostic_window

    for revision, samples, omitted in [
        (0, (raw_sample(1),), 0),
        (1, (), 0),
        (1, (raw_sample(1),) * 9, 0),
        (1, (raw_sample(1),), -1),
    ]:
        with pytest.raises(ValueError, match="bounds"):
            persist_diagnostic_window(tmp_path, revision, samples, omitted)
    sample = raw_sample(1)
    first = persist_diagnostic_window(tmp_path, 1, (sample,))
    assert persist_diagnostic_window(tmp_path, 1, (sample,)) == first
    with pytest.raises(ValueError, match="different evidence"):
        persist_diagnostic_window(tmp_path, 1, (replace(sample, frame=500),))
    assert not list(tmp_path.glob(".window-*"))
    with pytest.raises(ValueError, match="native raw"):
        SceneJournal(safe_capture=True)


def test_repeated_failed_publications_stay_bounded_and_recover(monkeypatch, tmp_path):
    import json

    import pokebench_env.raw_ram as raw
    import pokebench_env.scene_journal as module

    monkeypatch.setattr(module, "main_loop_idle", lambda read: False)
    journal = SceneJournal(safe_capture=True, raw_capture=raw_sample)
    journal.advance(field().read)
    journal.persist_diagnostics(tmp_path)
    published = json.loads((tmp_path / "current.json").read_text())
    replace = raw.os.replace

    def fail_publication(source, destination):
        raise OSError("disk publication failed")

    monkeypatch.setattr(raw.os, "replace", fail_publication)
    for _ in range(4):
        journal.advance(field().read)
        journal.persist_diagnostics(tmp_path)
        assert journal.diagnostic_error == "disk publication failed"
        assert journal.persisted_revision == published["revision"]
        assert json.loads((tmp_path / "current.json").read_text()) == published
        windows = list(tmp_path.glob("window-*"))
        assert {window.name for window in windows} == {published["directory"]}, windows
        assert (tmp_path / published["directory"] / "window.json").exists()
    monkeypatch.setattr(raw.os, "replace", replace)
    journal.persist_diagnostics(tmp_path)
    assert journal.diagnostic_error is None
    assert journal.persisted_revision == journal.diagnostic_revision
    assert len(list(tmp_path.glob("window-*"))) == 2


def test_failed_retention_refuses_new_window_and_preserves_published_pointer(monkeypatch, tmp_path):
    import json

    import pytest

    import pokebench_env.raw_ram as raw

    for revision in (1, 2):
        raw.persist_diagnostic_window(tmp_path, revision, (raw_sample(revision),))
    published = json.loads((tmp_path / "current.json").read_text())
    original = raw.shutil.rmtree

    def fail_old_window(path, *args, **kwargs):
        if str(path).endswith("window-000000000001"):
            raise OSError("retention cleanup failed")
        return original(path, *args, **kwargs)

    monkeypatch.setattr(raw.shutil, "rmtree", fail_old_window)
    for revision in (3, 4):
        with pytest.raises(OSError, match="retention cleanup failed"):
            raw.persist_diagnostic_window(tmp_path, revision, (raw_sample(revision),))
        assert json.loads((tmp_path / "current.json").read_text()) == published
        assert len(list(tmp_path.glob("window-*"))) == 2
    monkeypatch.setattr(raw.shutil, "rmtree", original)
    raw.persist_diagnostic_window(tmp_path, 5, (raw_sample(5),))
    assert json.loads((tmp_path / "current.json").read_text())["revision"] == 5
    assert len(list(tmp_path.glob("window-*"))) == 2


def test_failed_rollback_keeps_current_window_during_next_admission(monkeypatch, tmp_path):
    import json

    import pytest

    import pokebench_env.raw_ram as raw

    published = raw.persist_diagnostic_window(tmp_path, 1, (raw_sample(1),))
    original_remove, original_replace = raw.shutil.rmtree, raw.os.replace

    def fail_new_window(path, *args, **kwargs):
        if str(path).endswith("window-000000000002"):
            raise OSError("rollback cleanup failed")
        return original_remove(path, *args, **kwargs)

    def fail_publication(source, destination):
        raise OSError("disk publication failed")

    monkeypatch.setattr(raw.shutil, "rmtree", fail_new_window)
    monkeypatch.setattr(raw.os, "replace", fail_publication)
    with pytest.raises(OSError, match="cleanup failed"):
        raw.persist_diagnostic_window(tmp_path, 2, (raw_sample(2),))
    monkeypatch.setattr(raw.shutil, "rmtree", original_remove)
    with pytest.raises(OSError, match="disk publication failed"):
        raw.persist_diagnostic_window(tmp_path, 3, (raw_sample(3),))
    assert json.loads((tmp_path / "current.json").read_text()) == published
    assert (tmp_path / published["directory"]).is_dir()
    assert len(list(tmp_path.glob("window-*"))) == 1
    monkeypatch.setattr(raw.os, "replace", original_replace)
    raw.persist_diagnostic_window(tmp_path, 4, (raw_sample(4),))
    assert len(list(tmp_path.glob("window-*"))) == 2


def test_post_publication_close_failure_never_removes_published_window(monkeypatch, tmp_path):
    import json
    from contextlib import contextmanager

    import pytest

    import pokebench_env.raw_ram as raw

    raw.persist_diagnostic_window(tmp_path, 1, (raw_sample(1),))
    temporary = raw.tempfile.NamedTemporaryFile

    @contextmanager
    def close_failure(*args, **kwargs):
        with temporary(*args, **kwargs) as file:
            yield file
        raise OSError("pointer file close failed")

    monkeypatch.setattr(raw.tempfile, "NamedTemporaryFile", close_failure)
    with pytest.raises(OSError, match="pointer file close failed"):
        raw.persist_diagnostic_window(tmp_path, 2, (raw_sample(2),))
    current = json.loads((tmp_path / "current.json").read_text())
    assert current["revision"] == 2
    assert (tmp_path / current["directory"] / "window.json").exists()
    assert len(list(tmp_path.glob("window-*"))) == 2
    assert not list(tmp_path.glob(".current-*"))


def test_failed_temporary_pointer_cleanup_blocks_growth_until_recovered(monkeypatch, tmp_path):
    import json
    from pathlib import Path

    import pytest

    import pokebench_env.raw_ram as raw

    published = raw.persist_diagnostic_window(tmp_path, 1, (raw_sample(1),))
    original_unlink, original_replace = Path.unlink, raw.os.replace

    def fail_unlink(path, *args, **kwargs):
        if path.name.startswith(".current-"):
            raise OSError("pointer cleanup blocked")
        return original_unlink(path, *args, **kwargs)

    def fail_publication(source, destination):
        raise OSError("disk publication failed")

    monkeypatch.setattr(Path, "unlink", fail_unlink)
    monkeypatch.setattr(raw.os, "replace", fail_publication)
    for revision in (2, 3, 4):
        with pytest.raises(OSError, match="pointer cleanup blocked"):
            raw.persist_diagnostic_window(tmp_path, revision, (raw_sample(revision),))
        assert len(list(tmp_path.glob(".current-*"))) == 1
        assert json.loads((tmp_path / "current.json").read_text()) == published
    monkeypatch.setattr(Path, "unlink", original_unlink)
    monkeypatch.setattr(raw.os, "replace", original_replace)
    raw.persist_diagnostic_window(tmp_path, 5, (raw_sample(5),))
    assert not list(tmp_path.glob(".current-*"))
    assert len(list(tmp_path.glob("window-*"))) == 2


def test_failed_staging_cleanup_blocks_growth_until_recovered(monkeypatch, tmp_path):
    import json
    from pathlib import Path

    import pytest

    import pokebench_env.raw_ram as raw

    published = raw.persist_diagnostic_window(tmp_path, 1, (raw_sample(1),))
    original_remove, original_capture = raw.shutil.rmtree, raw._persist_capture

    def fail_staging(path, *args, **kwargs):
        if Path(path).name.startswith(".window-"):
            raise OSError("staging cleanup blocked")
        return original_remove(path, *args, **kwargs)

    def fail_capture(*args):
        raise OSError("archive write failed")

    monkeypatch.setattr(raw.shutil, "rmtree", fail_staging)
    monkeypatch.setattr(raw, "_persist_capture", fail_capture)
    for revision in (2, 3, 4):
        with pytest.raises(OSError, match="staging cleanup blocked"):
            raw.persist_diagnostic_window(tmp_path, revision, (raw_sample(revision),))
        assert len(list(tmp_path.glob(".window-*"))) == 1
        assert json.loads((tmp_path / "current.json").read_text()) == published
    monkeypatch.setattr(raw.shutil, "rmtree", original_remove)
    monkeypatch.setattr(raw, "_persist_capture", original_capture)
    raw.persist_diagnostic_window(tmp_path, 5, (raw_sample(5),))
    assert not list(tmp_path.glob(".window-*"))
    assert len(list(tmp_path.glob("window-*"))) == 2
