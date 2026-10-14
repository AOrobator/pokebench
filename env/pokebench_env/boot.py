"""Finite startup qualification before AgbMain installs its first callback.

This does not classify zero RAM as boot. It binds reset CPU state or the exact
AgbMain startup call frame, pinned ROM instructions, and observed finite native
library/IRQ execution owners. Unknown PCs or partial/mid-game zero callbacks
remain ordinary harness diagnostics.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi


@dataclass(frozen=True)
class BootCpu:
    gprs: tuple[int, ...]
    cpsr: int
    # crt0 sets system SP03007E40; AgbMain pushes24 bytes. Its caller return
    # remains at03007E3C and the current startup callee return at03007E24.
    main_stack: bytes


MAIN_SIGNATURE = bytes.fromhex(
    "f0b5474680b4ff20e6f27cfea021c9042c4a101c088000f013fe2b492b4b181c088000f0f9f800f05bf9dff24ffe00f0dff80ef07bf92ef01fff76f0c3fb00f079f8"
)
CRT_SIGNATURE = bytes.fromhex("14109fe50fe0a0e111ff2fe1f2ffffea407e0003a07f0003")
# (PC, LR): (AgbMain return slot, source startup callee). Pipeline PCs are
# recorded native values, not nominal assembly labels. RFU/flash BIOS IRQ
# observations keep their own banked SP/CPSR conditions below.
CALLEES = {
    (0x082E06BA, 0x082E0095): (0x080003D3, "audio initialization"),
    (0x082E0858, 0x082E04D3): (0x080003D3, "audio initialization"),
    (0x082E6DCE, 0x082E6DE5): (0x080003DB, "wireless initialization"),
    (0x082E6DD0, 0x082E6DE5): (0x080003DB, "wireless initialization"),
    (0x082E18BA, 0x082E188B): (0x080003E3, "save-chip identification"),
    (0x082E1906, 0x082E18D3): (0x080003E3, "save-chip identification"),
    (0x0000001C, 0x082E6DD0): (0x080003DB, "wireless initialization interrupt"),
    (0x0000001C, 0x082E18B8): (0x080003E3, "save-chip identification interrupt"),
}


def read_boot_ui(read: ReadMemory) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    capture = getattr(read, "native_boot_cpu_context", None)
    context = capture() if callable(capture) else None
    if not isinstance(context, BootCpu) or len(context.gprs) != 16:
        return None
    # Callback/task/save state must still match the source interval before
    # InitMainCallbacks, not a live game whose sole callback was corrupted.
    if (
        read(0x030022C0, 8) != bytes(8)
        or read(0x03005D8C, 8) != bytes(8)
        or read(0x03005E00, 640) != bytes(640)
    ):
        return None
    if (
        read(0x08000000, 4) != bytes.fromhex("7f0000ea")
        or read(0x080003A4, len(MAIN_SIGNATURE)) != MAIN_SIGNATURE
        or read(0x08000228, len(CRT_SIGNATURE)) != CRT_SIGNATURE
    ):
        return None
    regs, cpsr = context.gprs, context.cpsr
    pc, lr, sp = regs[15], regs[14], regs[13]
    owner = None
    if (
        regs[:13] == (0,) * 13
        and pc == 4
        and lr == 0
        and sp == 0x03007F00
        and cpsr == 0x1F
        and context.main_stack == bytes(32)
    ):
        # Exact fresh mGBA reset tuple before BIOS enters pinned ROM crt0.
        owner = "hardware reset"
    elif len(context.main_stack) == 32:
        callee = CALLEES.get((pc, lr))
        if callee is not None:
            return_slot, label = callee
            saved_return = int.from_bytes(context.main_stack[4:8], "little")
            crt_return = int.from_bytes(context.main_stack[28:32], "little")
            mode = cpsr & 0x1F
            if (
                saved_return == return_slot
                and crt_return == 0x08000234
                and (
                    (pc == 0x1C and mode == 0x12 and sp == 0x03007FA0)
                    or (
                        pc != 0x1C
                        and mode == 0x1F
                        and cpsr & 0x20
                        and 0x03007D80 <= sp <= 0x03007E24
                    )
                )
            ):
                owner = label
    if owner is None:
        return None
    return ActiveUi(
        "boot_initializing",
        None,
        False,
        "Game startup is automatic; wait for the first interface",
        details={"boot_owner": owner},
    )
