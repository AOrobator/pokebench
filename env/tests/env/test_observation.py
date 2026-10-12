import json

import pytest
from fastapi import FastAPI, HTTPException
from test_view import get

from pokebench_env.observation import install_observation


def state(screenshot: object = "iVBORw0KGgo=") -> dict[str, object]:
    return {"player": {"location": "LITTLEROOT TOWN"}, "visual": {"screenshot_base64": screenshot}}


def app_with(get_state, formatter=lambda s: f"text for {s['player']['location']}") -> FastAPI:
    app = FastAPI()
    install_observation(app, get_state, formatter)
    return app


def test_observation_returns_formatted_text_and_frame() -> None:
    seen: list[dict[str, object]] = []

    async def get_state() -> dict[str, object]:
        return state()

    def formatter(s: dict[str, object]) -> str:
        seen.append(s)
        return "Location: LITTLEROOT TOWN"

    status, headers, body = get(app_with(get_state, formatter), "/pokebench/observation")
    assert status == 200
    assert json.loads(body) == {
        "state_text": "Location: LITTLEROOT TOWN",
        "screenshot_base64": "iVBORw0KGgo=",
    }
    assert seen == [state()]


@pytest.mark.parametrize("screenshot", [None, "", 7])
def test_observation_without_a_frame_is_unavailable(screenshot: object) -> None:
    async def get_state() -> dict[str, object]:
        return state(screenshot)

    status, _, body = get(app_with(get_state), "/pokebench/observation")
    assert status == 503
    assert json.loads(body) == {"detail": "no screenshot in game state"}


def test_observation_without_visual_section_is_unavailable() -> None:
    async def get_state() -> dict[str, object]:
        return {"player": {"location": "X"}}

    status, _, _ = get(app_with(get_state), "/pokebench/observation")
    assert status == 503


def test_observation_passes_vendor_http_errors_through() -> None:
    async def get_state() -> dict[str, object]:
        raise HTTPException(status_code=400, detail="Emulator not initialized")

    status, _, body = get(app_with(get_state), "/pokebench/observation")
    assert status == 400
    assert json.loads(body) == {"detail": "Emulator not initialized"}
