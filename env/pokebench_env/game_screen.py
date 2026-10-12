"""Which screen the game is on, from its own main callbacks.

pokeemerald drives every screen through `gMain.callback2`; the US ROM matches
the decompilation byte for byte, so each screen has a fixed function address.
Values were labelled from screenshots (docs/findings/game-state.md). A value
not in the table is reported as unknown rather than guessed.
"""

from collections.abc import Callable
from dataclasses import dataclass

ReadMemory = Callable[[int, int], bytes]

GMAIN = 0x030022C0
TASKS = 0x03005E00
# Root Birch tasks matched to recorded frames and ROM references. Unknown task
# phases stay unknown; a shared main callback is not a screen classifier.
BIRCH_TASKS = frozenset(
    {
        0x080307B1,
        0x080308B1,
        0x08030929,
        0x080309CD,
        0x08030A2D,
        0x08030BCD,
        0x08030E09,
        0x08030E39,
        0x08031015,
        0x08031041,
    }
)

SCREENS: dict[int, str] = {
    0x0816CEAD: "intro",
    0x0816CC01: "intro",
    0x080AA7A5: "title",
    0x080AAB2D: "title",
    0x0802F6B1: "menu_program",
    0x08031679: "birch_speech",
    0x080E2E05: "naming",
    0x080E4F59: "naming",
    0x08085E5D: "overworld",
}


@dataclass(frozen=True)
class Screen:
    kind: str
    callback1: int
    callback2: int

    @property
    def label(self) -> str:
        if self.kind == "unknown":
            return f"unknown (callback2 0x{self.callback2:08X})"
        return self.kind


def read_screen(read: ReadMemory) -> Screen:
    raw = read(GMAIN, 8)
    if len(raw) != 8:
        raise ValueError(f"short read of gMain callbacks: {len(raw)} bytes")
    callback1 = int.from_bytes(raw[0:4], "little")
    callback2 = int.from_bytes(raw[4:8], "little")
    kind = SCREENS.get(callback2, "unknown")
    if kind == "menu_program":
        tasks = read(TASKS, 16 * 0x28)
        if len(tasks) != 16 * 0x28:
            raise ValueError("short read of gTasks")
        functions = {
            int.from_bytes(tasks[i : i + 4], "little")
            for i in range(0, len(tasks), 0x28)
            if tasks[i + 4]
        }
        if functions & BIRCH_TASKS:
            kind = "birch_speech"
        elif any(0x0802F6B1 <= fn < 0x080307B1 for fn in functions):
            kind = "main_menu"
        else:
            kind = "unknown"
    return Screen(kind=kind, callback1=callback1, callback2=callback2)
