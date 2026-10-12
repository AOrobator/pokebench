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


async def good_shot() -> Shot:
    return Shot()


def test_observation_is_the_readout_the_frame_and_the_typed_state() -> None:
    status, _, body = get(app_with(good_shot), "/pokebench/observation")
    assert status == 200
    payload = json.loads(body)
    assert payload["state_text"].startswith("Screen: naming\nGame not started")
    assert payload["screenshot_base64"] == "iVBORw0KGgo="
    assert payload["state"]["screen"] == "naming"
    assert payload["state"]["started"] is False


def test_state_route_returns_the_typed_state_without_a_frame() -> None:
    status, _, body = get(app_with(good_shot), "/pokebench/state")
    assert status == 200
    assert json.loads(body)["location"] is None


@pytest.mark.parametrize("screenshot", [None, "", 7])
def test_observation_without_a_frame_is_unavailable(screenshot: object) -> None:
    async def bad_shot() -> Shot:
        return Shot(screenshot_base64=screenshot)

    status, _, body = get(app_with(bad_shot), "/pokebench/observation")
    assert status == 503
    assert json.loads(body) == {"detail": "no screenshot available"}


def test_observation_passes_vendor_http_errors_through() -> None:
    async def failing() -> Shot:
        raise HTTPException(status_code=400, detail="Emulator not initialized")

    status, _, body = get(app_with(failing), "/pokebench/observation")
    assert status == 400
    assert json.loads(body) == {"detail": "Emulator not initialized"}
