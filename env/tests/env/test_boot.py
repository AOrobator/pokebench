import struct
from dataclasses import replace

import pytest

from pokebench_env.boot import CALLEES, CRT_SIGNATURE, MAIN_SIGNATURE, BootCpu, read_boot_ui
from tests.env.test_ui_state import Memory


class NativeMemory(Memory):
    __call__ = Memory.read
    context: BootCpu

    def native_boot_cpu_context(self):
        return self.context


def boot():
    m = NativeMemory()
    m.put(0x08000000, bytes.fromhex("7f0000ea"))
    m.put(0x08000228, CRT_SIGNATURE)
    m.put(0x080003A4, MAIN_SIGNATURE)
    regs = [0] * 16
    regs[13] = 0x03007F00
    regs[15] = 4
    m.context = BootCpu(tuple(regs), 0x1F, bytes(32))
    return m


def test_reset_requires_native_context_and_exact_cpu_rom_state():
    m = boot()
    ui = read_boot_ui(m)
    assert (
        ui.phase == "boot_initializing"
        and not ui.ready
        and ui.details["boot_owner"] == "hardware reset"
    )
    # Plain RAM fixtures have no trusted core CPU capability; zero RAM alone
    # remains unsupported rather than a manufactured boot classification.
    assert read_boot_ui(Memory().read) is None


@pytest.mark.parametrize("pc,lr", CALLEES)
def test_native_startup_library_and_irq_frames_bind_main_and_crt_returns(pc, lr):
    m = boot()
    regs = [0] * 16
    regs[15] = pc
    regs[14] = lr
    regs[13] = 0x03007FA0 if pc == 0x1C else 0x03007DFC
    stack = bytearray(32)
    struct.pack_into("<I", stack, 4, CALLEES[(pc, lr)][0])
    struct.pack_into("<I", stack, 28, 0x08000234)
    m.context = BootCpu(tuple(regs), 0x92 if pc == 0x1C else 0x3F, bytes(stack))
    assert read_boot_ui(m).details["boot_owner"] == CALLEES[(pc, lr)][1]
    stack[28:32] = bytes(4)
    m.context = replace(m.context, main_stack=bytes(stack))
    assert read_boot_ui(m) is None


@pytest.mark.parametrize(
    "fault", ["pc", "lr", "sp", "mode", "regs", "rom", "save", "callbacks", "tasks", "context"]
)
def test_corrupt_or_midgame_zero_callbacks_are_not_suppressed(fault):
    m = boot()
    regs = list(m.context.gprs)
    if fault == "pc":
        regs[15] = 0x08038422
    elif fault == "lr":
        regs[14] = 0x080004BF
    elif fault == "sp":
        regs[13] = 0x03007E40
    elif fault == "regs":
        regs[0] = 1
    elif fault == "mode":
        m.context = replace(m.context, cpsr=0x12)
    elif fault == "rom":
        m.put(0x080003A4, b"\0")
    elif fault == "save":
        m.put(0x03005D8C, struct.pack("<I", 0x02028000))
    elif fault == "callbacks":
        m.put(0x030022C0, struct.pack("<I", 0x08085E5D))
    elif fault == "tasks":
        m.put(0x03005E00, b"\1")
    elif fault == "context":
        m.context = None
    if fault != "context":
        m.context = replace(m.context, gprs=tuple(regs))
    assert read_boot_ui(m) is None


def test_screen_boot_classification_requires_the_same_native_owner():
    from pokebench_env.game_screen import read_screen

    m = boot()
    assert read_screen(m).kind == "boot"
    m.context = replace(m.context, gprs=m.context.gprs[:15] + (0x08038422,))
    assert read_screen(m).kind == "unknown"
    assert read_screen(Memory().read).kind == "unknown"


@pytest.mark.parametrize("fault", ["main_return", "short_stack", "mode", "thumb", "sp"])
def test_startup_unwind_rejects_invalid_call_frame_or_cpu_mode(fault):
    m = boot()
    regs = [0] * 16
    regs[15] = 0x082E06BA
    regs[14] = 0x082E0095
    regs[13] = 0x03007E0C
    stack = bytearray(32)
    struct.pack_into("<I", stack, 4, 0x080003D3)
    struct.pack_into("<I", stack, 28, 0x08000234)
    mode = 0x3F
    if fault == "main_return":
        struct.pack_into("<I", stack, 4, 0x080004BF)
    elif fault == "short_stack":
        stack = stack[:12]
    elif fault == "mode":
        mode = 0x32
    elif fault == "thumb":
        mode = 0x1F
    elif fault == "sp":
        regs[13] = 0x03007E40
    m.context = BootCpu(tuple(regs), mode, bytes(stack))
    assert read_boot_ui(m) is None
