import json
import struct

import pytest
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from test_view import get

from pokebench_env.game_state import MapNames
from pokebench_env.observation import install_observation

NAMING = struct.pack("<II", 0, 0x080E4F59)


class Shot(BaseModel):
    screenshot_base64: object = "iVBORw0KGgo="
    step_number: int = 12


def memory(address: int, length: int) -> bytes:
    if address == 0x030022C0:
        return NAMING
    return bytes(length)


def app_with(get_screenshot) -> FastAPI:
    app = FastAPI()
    install_observation(app, get_screenshot, memory, MapNames({}))
    return app


def good_shot() -> Shot:
    return Shot()


def test_observation_is_the_readout_the_frame_and_the_typed_state() -> None:
    status, _, body = get(app_with(good_shot), "/pokebench/observation")
    assert status == 200
    payload = json.loads(body)
    assert payload["state_text"].startswith(
        "Screen: naming\nDialog: none\n"
        "Menu: unavailable (active owner not verified)\n"
        "Interface: unsupported; input unavailable"
    )
    assert "STATE COVERAGE ERROR: callback2 0x080E4F59" in payload["state_text"]
    assert "Game not started" in payload["state_text"]
    assert payload["screenshot_base64"] == "iVBORw0KGgo="
    assert payload["state"]["screen"] == "naming"
    assert payload["state"]["started"] is False


def test_state_route_returns_the_typed_state_without_a_frame() -> None:
    status, _, body = get(app_with(good_shot), "/pokebench/state")
    assert status == 200
    assert json.loads(body)["location"] is None


@pytest.mark.parametrize("screenshot", [None, "", 7])
def test_observation_without_a_frame_is_unavailable(screenshot: object) -> None:
    def bad_shot() -> Shot:
        return Shot(screenshot_base64=screenshot)

    status, _, body = get(app_with(bad_shot), "/pokebench/observation")
    assert status == 503
    assert json.loads(body) == {"detail": "no screenshot available"}


def test_observation_passes_vendor_http_errors_through() -> None:
    def failing() -> Shot:
        raise HTTPException(status_code=400, detail="Emulator not initialized")

    status, _, body = get(app_with(failing), "/pokebench/observation")
    assert status == 400
    assert json.loads(body) == {"detail": "Emulator not initialized"}


@pytest.mark.parametrize("path", ["/pokebench/state", "/pokebench/observation"])
def test_entire_ram_read_uses_the_existing_frame_memory_lock(path: str) -> None:
    import threading

    lock = threading.Lock()
    calls = []

    def locked_read(address: int, length: int) -> bytes:
        assert lock.locked(), "RAM read raced with the frame owner"
        calls.append(address)
        return memory(address, length)

    app = FastAPI()
    install_observation(app, good_shot, locked_read, MapNames({}), lock)
    status, _, body = get(app, path)
    assert status == 200, body
    assert calls == [
        0x030022C0,
        0x030026F9,
        0x0203CD92,
        0x03005E00,
        0x03005E00,
        0x02039F94,
        0x02039F94,
        0x02037595,
        0x02037350,
        0x02039F94,
        *([0x02037FD4 + 7] if path == "/pokebench/observation" else []),
    ]
    assert not lock.locked()


def test_ram_read_failure_is_not_converted_to_zero_filled_state() -> None:
    def broken_read(address: int, length: int) -> bytes:
        raise RuntimeError("native memory unavailable")

    app = FastAPI()
    install_observation(app, good_shot, broken_read, MapNames({}))
    with pytest.raises(RuntimeError, match="native memory unavailable"):
        get(app, "/pokebench/state")


def test_frame_and_ram_share_one_lock_during_a_transition() -> None:
    import threading

    lock = threading.Lock()
    frame = {"version": "naming"}

    def screenshot() -> Shot:
        if not lock.locked():
            frame["version"] = "next frame"
        assert lock.locked()
        return Shot(screenshot_base64=frame["version"])

    def read(address: int, length: int) -> bytes:
        assert lock.locked()
        assert frame["version"] == "naming"
        return memory(address, length)

    app = FastAPI()
    install_observation(app, screenshot, read, MapNames({}), lock)
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200
    payload = json.loads(body)
    assert payload["screenshot_base64"] == payload["state"]["screen"] == "naming"
    assert not lock.locked()


def test_native_frame_adapter_without_video_is_unavailable() -> None:
    from types import SimpleNamespace

    from pokebench_env.serve import native_screenshot

    with pytest.raises(HTTPException, match="no screenshot available"):
        native_screenshot(SimpleNamespace(get_screenshot=lambda: None))


@pytest.mark.parametrize(
    "behavior,guidance",
    [
        (0x65, "directional exit: stand on tile, then press DOWN"),
        (0x69, "door: approach from below and press UP toward door"),
        (0x00, "activation unknown"),
    ],
)
def test_live_warp_activation_reaches_model_text_and_recorded_state(behavior, guidance) -> None:
    from test_game_state import MAPS, OVERWORLD, SB1, game
    from test_live_map import loaded

    m = loaded()
    m.cells.update(game(OVERWORLD).cells)
    m.put(SB1, struct.pack("<hhbb", 1, 1, 0, 9))
    m.put(0x02037350 + 0x10, struct.pack("<hh", 8, 8))
    m.put(0x02007000, struct.pack("<H", behavior))
    app = FastAPI()
    install_observation(app, good_shot, m.read, MAPS)
    status, _, body = get(app, "/pokebench/observation")
    assert status == 200, body
    payload = json.loads(body)
    expected = f"(0,1) -> map 0/9 [{guidance}]"
    assert expected in payload["state_text"], payload
    assert expected in payload["state"]["local_map"], payload
    assert payload["state"]["local_map"] in payload["state_text"], payload
    qualification = "movement; activation depends on metatile (see local map)"
    warps = [
        target for target in payload["state"]["interaction_targets"] if target["kind"] == "warp"
    ]
    assert len(warps) == 1, warps
    assert warps[0]["activation"] == qualification, warps
    assert f"warp at (0,1), elevation 0; {qualification}; conditional" in payload["state_text"], (
        payload
    )


def test_active_ui_off_hides_typed_state_and_model_text(monkeypatch) -> None:
    monkeypatch.setenv("POKEBENCH_ACTIVE_UI", "0")
    status, _, body = get(app_with(good_shot), "/pokebench/observation")
    payload = json.loads(body)
    assert status == 200 and payload["state"]["active_ui"] is None
    assert (
        "Interface:" not in payload["state_text"]
        and "STATE COVERAGE ERROR" not in payload["state_text"]
    )
    status, _, body = get(app_with(good_shot), "/pokebench/state")
    assert status == 200 and json.loads(body)["active_ui"] is None


def test_raw_archive_precedes_decode_and_shares_frame_lock(tmp_path, monkeypatch):
    import threading

    from test_raw_ram import reader

    import pokebench_env.rerender as rerender_module
    from pokebench_env.raw_ram import RawRamArchive, load_raw_ram

    lock = threading.Lock()
    archive = RawRamArchive(tmp_path, "a" * 40)
    read = reader()
    original_pair = archive.pair

    def pair(receipt, decoded, screenshot):
        assert lock.locked(), "OFF-path raw pairing left the frame lock"
        original_pair(receipt, decoded, screenshot)

    monkeypatch.setattr(archive, "pair", pair)

    def capture():
        assert lock.locked()
        return archive.capture(read, 42)

    app = FastAPI()
    observe = install_observation(
        app, good_shot, memory, MapNames({}), lock, raw_capture=capture, raw_archive=archive
    )
    payload = observe()
    assert payload["raw_ram"]["frame"] == 42
    paired = json.loads((tmp_path / "observations.jsonl").read_text())
    assert paired["state"] == payload["state"]
    assert paired["screenshot_sha256"] is not None

    def failed_decode(*args, **kwargs):
        raise ValueError("decoder defect")

    monkeypatch.setattr(rerender_module, "read_game_state", failed_decode)
    with pytest.raises(ValueError, match="decoder defect"):
        observe()
    receipts = [json.loads(line) for line in (tmp_path / "index.jsonl").read_text().splitlines()]
    assert len(receipts) == 2
    assert (
        load_raw_ram(tmp_path / receipts[1]["path"], receipts[1]["sha256"])(0x02000001, 3)
        == b"\x01\x02\x03"
    )


@pytest.mark.parametrize("with_whiteout", [False, True])
def test_blocked_persistence_never_holds_frame_lock_or_png_work(
    tmp_path, monkeypatch, with_whiteout
):
    import threading
    from concurrent.futures import ThreadPoolExecutor
    from types import SimpleNamespace

    from PIL import Image

    import pokebench_env.raw_ram as raw_module
    from pokebench_env.blackout_readout import WhiteoutLatch
    from pokebench_env.memory_reader import SnapshotMemoryReader
    from pokebench_env.menus import PALETTE_FADE
    from pokebench_env.raw_ram import REGIONS, RawRamArchive, digest
    from pokebench_env.screen_settle import FrameSettle
    from pokebench_env.serve import frozen_native_screenshot

    lock = threading.Lock()
    entered = threading.Event()
    release = threading.Event()
    original = raw_module._persist_capture
    region_data = {address: bytearray(size) for _, address, size in REGIONS}
    naming_offset = 0x030022C0 - 0x03000000
    region_data[0x03000000][naming_offset : naming_offset + len(NAMING)] = NAMING
    source_image = Image.new("RGB", (2, 1), (12, 34, 56))

    def blocked(directory, frozen):
        region_data[0x03000000][naming_offset : naming_offset + len(NAMING)] = bytes(len(NAMING))
        source_image.paste((200, 10, 20), (0, 0, 2, 1))
        entered.set()
        assert release.wait(10)
        return original(directory, frozen)

    monkeypatch.setattr(raw_module, "_persist_capture", blocked)
    executor = ThreadPoolExecutor(max_workers=1)
    archive = RawRamArchive(tmp_path, "a" * 40, executor=executor, queue_size=1)

    class View:
        def __getitem__(self, span):
            for base, data in region_data.items():
                if base <= span.start and span.stop <= base + len(data):
                    return bytes(data[span.start - base : span.stop - base])
            return bytes(span.stop - span.start)

    core = SimpleNamespace(
        memory=SimpleNamespace(u8=View()),
        cpu=SimpleNamespace(gprs=[0] * 16, cpsr=SimpleNamespace(packed=0)),
    )

    def raw_region(address, size):
        return bytes(region_data[address][:size])

    raw = SnapshotMemoryReader(lambda: core, raw_region)
    snapshot_calls = 0
    transitioning = True

    def atomic_memory(address, length):
        if address == PALETTE_FADE + 7:
            return bytes([0x80 if transitioning else 0])
        if address == 0x05000000:
            return b"\x01" + bytes(length - 1)
        return memory(address, length)

    settle = FrameSettle(atomic_memory)

    def raw_snapshot(reservation):
        nonlocal snapshot_calls
        snapshot_calls += 1
        return archive.snapshot(reservation, raw, 42)

    def screenshot_snapshot():
        assert lock.locked(), "framebuffer copy must share the atomic frame lock"
        deferred = frozen_native_screenshot(SimpleNamespace(get_screenshot=lambda: source_image))

        def verified_encode():
            assert not lock.locked(), "PNG encoding held the emulator frame lock"
            return deferred()

        return verified_encode

    app = FastAPI()
    observe = install_observation(
        app,
        screenshot_snapshot,
        atomic_memory,
        MapNames({}),
        lock,
        raw_archive=archive,
        raw_snapshot=raw_snapshot,
        raw_rom=bytes(4),
        whiteout=WhiteoutLatch(memory) if with_whiteout else None,
        settle=settle,
    )
    result = []
    request = threading.Thread(target=lambda: result.append(observe()))
    request.start()
    for _ in range(100):
        with settle._lock:
            if settle._waiters:
                break
        threading.Event().wait(0.005)
    else:
        pytest.fail("observation did not register its frame waiter")
    transitioning = False

    def run_frame_callback():
        with lock:
            settle.on_frame()

    frame_callback = threading.Thread(target=run_frame_callback)
    frame_callback.start()
    frame_callback.join(0.2)
    assert not frame_callback.is_alive(), "frame callback retained persistence work"
    assert entered.wait(2), "persistence worker did not start"
    assert lock.acquire(timeout=0.2), "blocked fsync/compression retained the frame lock"
    lock.release()
    assert request.is_alive(), "request should retain synchronous durability semantics"
    second_result = []
    second = threading.Thread(target=lambda: second_result.append(observe()))
    second.start()
    second.join(0.1)
    assert second.is_alive() and snapshot_calls == 1, (
        "a full persistence queue must block before the frame callback"
    )
    release.set()
    request.join(2)
    second.join(2)
    assert not request.is_alive() and not second.is_alive()
    assert result[0]["raw_ram"]["frame"] == 42
    assert result[0]["state"]["screen"] == "naming"
    import base64
    from io import BytesIO

    screenshot = str(result[0]["screenshot_base64"])
    assert Image.open(BytesIO(base64.b64decode(screenshot))).getpixel((0, 0)) == (12, 34, 56)
    assert second_result[0]["raw_ram"]["sequence"] == 1
    pairs = [
        json.loads(line) for line in (tmp_path / "observations.jsonl").read_text().splitlines()
    ]
    assert len(pairs) == 2
    first = next(pair for pair in pairs if pair["raw_ram"]["sequence"] == 0)
    assert first["state"]["screen"] == "naming"
    assert first["screenshot_sha256"] == digest(base64.b64decode(screenshot))
    executor.shutdown()
