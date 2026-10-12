"""Typed client for the continual-harness game server."""

import base64
import binascii
import json
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from io import BytesIO
from typing import TypeVar

from PIL import Image, UnidentifiedImageError

Transport = Callable[[str, str, object | None], object]

GBA_WIDTH, GBA_HEIGHT = 240, 160

T = TypeVar("T")


class ClientError(RuntimeError):
    pass


class Button(StrEnum):
    A = "A"
    B = "B"
    START = "START"
    SELECT = "SELECT"
    UP = "UP"
    DOWN = "DOWN"
    LEFT = "LEFT"
    RIGHT = "RIGHT"


@dataclass(frozen=True)
class GameState:
    location: str
    x: int
    y: int
    in_battle: bool
    badges: int
    money: int
    step: int


@dataclass(frozen=True)
class Screenshot:
    png: bytes
    width: int
    height: int
    step: int


@dataclass(frozen=True)
class Milestone:
    name: str
    completed: bool
    timestamp: float | None


def _obj(value: object, where: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ClientError(f"{where}: expected an object, got {type(value).__name__}")
    return value


def _typed(value: object, kind: type[T], where: str) -> T:
    if not isinstance(value, kind) or (kind is int and isinstance(value, bool)):
        raise ClientError(f"{where}: expected {kind.__name__}, got {value!r}")
    return value


def _png_size(data: bytes) -> tuple[int, int]:
    try:
        with Image.open(BytesIO(data), formats=["PNG"]) as image:
            image.load()
            return image.size
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise ClientError(f"screenshot is not a decodable PNG: {exc}") from exc


class GameClient:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def healthy(self) -> bool:
        body = _obj(self._transport("GET", "/health", None), "/health")
        return body.get("status") == "healthy"

    def state(self) -> GameState:
        body = _obj(self._transport("GET", "/state", None), "/state")
        player = _obj(body.get("player"), "/state.player")
        position = _obj(player.get("position"), "/state.player.position")
        game = _obj(body.get("game"), "/state.game")
        badges = _typed(game.get("badges"), list, "/state.game.badges")
        return GameState(
            location=_typed(player.get("location"), str, "/state.player.location"),
            x=_typed(position.get("x"), int, "/state.player.position.x"),
            y=_typed(position.get("y"), int, "/state.player.position.y"),
            in_battle=_typed(game.get("is_in_battle"), bool, "/state.game.is_in_battle"),
            badges=len(badges),
            money=_typed(game.get("money"), int, "/state.game.money"),
            step=_typed(body.get("step_number"), int, "/state.step_number"),
        )

    def screenshot(self) -> Screenshot:
        body = _obj(self._transport("GET", "/screenshot", None), "/screenshot")
        encoded = _typed(body.get("screenshot_base64"), str, "/screenshot.screenshot_base64")
        try:
            data = base64.b64decode(encoded, validate=True)
        except binascii.Error as exc:
            raise ClientError(f"/screenshot.screenshot_base64: {exc}") from exc
        width, height = _png_size(data)
        if (width, height) != (GBA_WIDTH, GBA_HEIGHT):
            raise ClientError(f"screenshot is {width}x{height}, expected 240x160")
        step = _typed(body.get("step_number"), int, "/screenshot.step_number")
        return Screenshot(png=data, width=width, height=height, step=step)

    def press(self, buttons: Sequence[Button]) -> None:
        if not buttons:
            raise ClientError("press needs at least one button")
        try:
            names = [Button(button).value for button in buttons]
        except ValueError as exc:
            raise ClientError(f"press: {exc}") from exc
        body = _obj(self._transport("POST", "/action", {"buttons": names}), "/action")
        if body.get("status") != "success":
            raise ClientError(f"/action failed: {body.get('message', body)}")

    def milestones(self) -> list[Milestone]:
        body = _obj(self._transport("GET", "/milestones", None), "/milestones")
        entries = _typed(body.get("milestones"), list, "/milestones.milestones")
        result = []
        for index, raw in enumerate(entries):
            entry = _obj(raw, f"/milestones[{index}]")
            timestamp = entry.get("timestamp")
            if timestamp is not None and (
                isinstance(timestamp, bool) or not isinstance(timestamp, int | float)
            ):
                raise ClientError(f"/milestones[{index}].timestamp: got {timestamp!r}")
            result.append(
                Milestone(
                    name=_typed(entry.get("name"), str, f"/milestones[{index}].name"),
                    completed=_typed(
                        entry.get("completed"), bool, f"/milestones[{index}].completed"
                    ),
                    timestamp=float(timestamp) if timestamp is not None else None,
                )
            )
        return result


def http_transport(base_url: str, timeout: float = 30.0) -> Transport:
    def transport(method: str, path: str, body: object | None) -> object:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(  # noqa: S310 - base_url is operator config (http only)
            f"{base_url}{path}",
            data=data,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
                return json.loads(response.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ClientError(f"{method} {base_url}{path} failed: {exc}") from exc

    return transport
