"""Queued travel chords guarded by native running permission each actual frame."""

from typing import Literal, Protocol, TypedDict

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field

from pokebench_env.action_history import FrameEmulator
from pokebench_env.game_screen import ReadMemory
from pokebench_env.running import read_running_permission

PREFIX = "@POKEBENCH_RUN:"
DIRECTIONS = frozenset(("UP", "DOWN", "LEFT", "RIGHT"))


class QueuedTravel(TypedDict):
    button: str
    speed: str
    hold_frames: int
    release_frames: int


class TravelServer(Protocol):
    action_queue: list[QueuedTravel]


class TravelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    buttons: list[Literal["UP", "DOWN", "LEFT", "RIGHT"]] = Field(min_length=1, max_length=8)
    hold_frames: int = Field(ge=1, le=255)
    release_frames: int = Field(ge=1, le=255)
    automatic_running: Literal[True]


def install_travel(
    api: FastAPI,
    emulator: type[FrameEmulator],
    server: TravelServer,
    read: ReadMemory,
    *,
    safe_strides: bool = False,
    intercept: bool = False,
    bike_register: bool = False,
    bike_toggle: bool = False,
) -> None:
    # Each queued direction carries its own marker. Concurrent ordinary actions
    # cannot inherit an ambient modifier; release frames remain empty inputs.
    original = emulator.run_frame_with_buttons

    def step(self: FrameEmulator, buttons: list[str]) -> None:
        actual = list(buttons)
        marked = len(buttons) == 1 and buttons[0].startswith(PREFIX)
        if marked:
            direction = buttons[0][len(PREFIX) :]
            if direction not in DIRECTIONS:
                raise ValueError("invalid private travel direction")
            actual = [direction]
            native = read_running_permission(read)
            if native.permitted is True and native.controllable is True:
                actual.append("B")
        original(self, actual)

    emulator.run_frame_with_buttons = step

    @api.post("/pokebench/travel")
    def travel(body: TravelRequest) -> dict[str, object]:
        server.action_queue.extend(
            {
                "button": PREFIX + direction,
                "speed": "fast",
                "hold_frames": body.hold_frames,
                "release_frames": body.release_frames,
            }
            for direction in body.buttons
        )
        return {"status": "success", "actions_added": len(body.buttons)}

    if safe_strides:
        from typing import cast

        from pokebench_env.strides import QueuedStride, install_strides

        install_strides(api, emulator, cast(QueuedStride, server), read)

    if intercept:
        from typing import cast

        from pokebench_env.intercept import QueuedIntercept, install_intercept

        install_intercept(api, emulator, cast(QueuedIntercept, server), read)

    if bike_register or bike_toggle:
        from typing import cast

        from pokebench_env.bike import QueuedBike, install_bike

        install_bike(
            api,
            emulator,
            cast(QueuedBike, server),
            read,
            register=bike_register,
            toggle=bike_toggle,
        )
