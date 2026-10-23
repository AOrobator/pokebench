"""GPU-free reconstruction of recorded decisions, with byte-exact native replay proof.

The vendor loader advances one frame after load. The journal starts after that
frame; its first recorded input therefore belongs to loaded_frame + 2. Save the
predecessor of the decision frame, then qualify through that same loader step.
No state is reconstructed from RAM, and no missing emulator internals are guessed.
"""

from collections.abc import Mapping, Sequence
from typing import TypedDict

BUTTONS = frozenset({"A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT", "L", "R"})


class InputChange(TypedDict):
    frame: int
    buttons: list[str]


def native_schedule(entries: Sequence[InputChange], *, loaded_frame: int) -> dict[int, list[str]]:
    if not entries or entries[0]["frame"] != 1 or entries[0]["buttons"]:
        raise ValueError("missing initial empty native input; startup offset cannot be proved")
    if type(loaded_frame) is not int or loaded_frame < 0:
        raise ValueError("invalid loaded native frame")
    result: dict[int, list[str]] = {}
    previous = 0
    for entry in entries:
        frame, buttons = entry["frame"], entry["buttons"]
        if type(frame) is not int or frame <= previous or not set(buttons) <= BUTTONS:
            raise ValueError("invalid or nonmonotone native input journal")
        if len(buttons) != len(set(buttons)):
            raise ValueError("duplicate buttons")
        result[loaded_frame + 1 + frame] = list(buttons)
        previous = frame
    return result


def check_replay_regions(
    expected: Mapping[str, bytes], actual: Mapping[str, bytes]
) -> dict[str, bool]:
    if not expected or set(expected) != set(actual):
        raise ValueError("native replay regions missing or unexpected")
    return {name: expected[name] == actual[name] for name in expected}


class ClockSample(TypedDict):
    frame: int
    unix_ms: float


class RecordedClock:
    def __init__(self, samples: Sequence[ClockSample]) -> None:
        from math import isfinite

        if not samples or any(
            type(s["frame"]) is not int
            or s["frame"] < 0
            or not isfinite(s["unix_ms"])
            or s["unix_ms"] < 0
            for s in samples
        ):
            raise ValueError("invalid recorded clock samples")
        if any(
            b["frame"] <= a["frame"] or b["unix_ms"] < a["unix_ms"]
            for a, b in zip(samples, samples[1:], strict=False)
        ):
            raise ValueError("invalid recorded clock samples")
        self.frames = tuple(s["frame"] for s in samples)
        self.values = tuple(s["unix_ms"] for s in samples)

    def at(self, frame: int) -> int:
        from bisect import bisect_right

        i = bisect_right(self.frames, frame)
        a, b = max(0, i - 1), min(len(self.frames) - 1, i)
        if a == b:
            return int(self.values[a])
        return int(
            self.values[a]
            + (self.values[b] - self.values[a])
            * (frame - self.frames[a])
            / (self.frames[b] - self.frames[a])
        )


def wall_clock_at(frame: int, samples: Sequence[ClockSample]) -> int:
    return RecordedClock(samples).at(frame)
