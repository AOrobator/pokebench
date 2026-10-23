"""Restore source cartridge time for the vendor load frame, then advance on host time."""

import math
import time
from collections.abc import Callable, Mapping
from typing import Protocol


class RTC(Protocol):
    override: int
    value: int


class ClockNative(Protocol):
    rtc: RTC


class ClockCore(Protocol):
    _core: ClockNative


class ClockEmulator(Protocol):
    core: ClockCore | None

    load_state: Callable[..., None]


def restored_epoch(env: Mapping[str, str]) -> int | None:
    value = env.get("POKEBENCH_RESTORE_RTC_MS")
    if value is None:
        return None
    if not value.isdecimal() or not 1 <= int(value) <= 9_007_199_254_740_991:
        raise ValueError("invalid restored RTC epoch")
    return int(value)


def install_restored_clock(
    emulator: type[ClockEmulator],
    epoch_ms: int,
    *,
    fixed_mode: int,
    wall_offset_mode: int,
    now: Callable[[], float] = time.time,
) -> None:
    if type(epoch_ms) is not int or epoch_ms < 1:
        raise ValueError("invalid restored RTC epoch")
    load = emulator.load_state

    def restored_load(
        self: ClockEmulator, path: str | None = None, state_bytes: bytes | None = None
    ) -> None:
        if self.core is None:
            raise ValueError("restored RTC requires an initialized native core")
        rtc = self.core._core.rtc
        rtc.override, rtc.value = fixed_mode, epoch_ms
        load(self, path=path, state_bytes=state_bytes)
        # mGBA divides the signed offset by 1000 with truncation. Whole seconds
        # preserve the source second even for a negative wall-clock offset.
        rtc.override = wall_offset_mode
        rtc.value = (epoch_ms // 1000 - math.floor(now())) * 1000

    emulator.load_state = restored_load
