from types import SimpleNamespace
from typing import cast

import pytest

from pokebench_env.continuation_clock import (
    ClockEmulator,
    install_restored_clock,
    restored_epoch,
)


def test_clock_is_opt_in_and_strict() -> None:
    assert restored_epoch({}) is None
    assert restored_epoch({"POKEBENCH_RESTORE_RTC_MS": "12345"}) == 12345
    for bad in ("-1", "0", "1.5", "nan", "9007199254740992"):
        with pytest.raises(ValueError):
            restored_epoch({"POKEBENCH_RESTORE_RTC_MS": bad})
    with pytest.raises(ValueError):
        install_restored_clock(
            cast(type[ClockEmulator], object), 0, fixed_mode=1, wall_offset_mode=2
        )


def test_native_loader_sees_fixed_source_time_then_clock_advances() -> None:
    seen: list[tuple[int, int, str | None, bytes | None]] = []

    class Emulator:
        def __init__(self) -> None:
            self.core: SimpleNamespace | None = SimpleNamespace(
                _core=SimpleNamespace(rtc=SimpleNamespace(override=0, value=0))
            )

        def load_state(self, path: str | None = None, state_bytes: bytes | None = None) -> None:
            assert self.core is not None
            rtc = self.core._core.rtc
            seen.append((rtc.override, rtc.value, path, state_bytes))

    install_restored_clock(
        cast(type[ClockEmulator], Emulator),
        12345,
        fixed_mode=1,
        wall_offset_mode=2,
        now=lambda: 1000.9,
    )
    emu = Emulator()
    emu.load_state("checkpoint", b"save")
    assert seen == [(1, 12345, "checkpoint", b"save")]
    assert emu.core is not None
    rtc = emu.core._core.rtc
    assert (rtc.override, rtc.value) == (2, -988000)
    assert 1000 + rtc.value // 1000 == 12
    assert 1002 + rtc.value // 1000 == 14
    emu.core = None
    with pytest.raises(ValueError, match="initialized"):
        emu.load_state()
