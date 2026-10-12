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
        "Screen: naming\nDialog: none\nMenu: none\nGame not started"
    )
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
    assert calls == [0x030022C0, 0x030026F9, 0x0203CD92, 0x02039F94]
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
