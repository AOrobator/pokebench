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

SCREENS: dict[int, str] = {
    0x0816CEAD: "intro",
    0x0816CC01: "title",
    0x080AA7A5: "main_menu",
    0x080AAB2D: "main_menu",
    0x0802F6B1: "birch_speech",
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
    return Screen(kind=SCREENS.get(callback2, "unknown"), callback1=callback1, callback2=callback2)
