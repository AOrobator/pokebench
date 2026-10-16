"""Live naming keyboard state, from pokeemerald's naming data and cursor sprite.

US Emerald addresses/offsets checked against ROM instructions and a recorded
probe. This is editing state; it never becomes the saved trainer name early.
"""

import struct
from collections.abc import Callable
from dataclasses import asdict, dataclass

from pokebench_env.game_screen import ReadMemory

NAMING_POINTER = 0x02039F94
SPRITES = 0x02020630
KEYBOARDS = (
    ("01234 ", "56789 ", "!?♂♀/-", "…“”‘' "),
    ("ABCDEF .", "GHIJKL ,", "MNOPQRS ", "TUVWXYZ "),
    ("abcdef .", "ghijkl ,", "mnopqrs ", "tuvwxyz "),
)
PAGES = ("symbols", "uppercase", "lowercase")


@dataclass(frozen=True)
class NamingState:
    text: str
    page: str
    column: int
    row: int
    key: str
    ready: bool

    def json(self) -> dict[str, object]:
        return asdict(self)

    def readout(self) -> str:
        return (
            f"Name being edited: {self.text!r}\n"
            f"Naming keyboard: {self.page}; cursor column {self.column}, row {self.row} "
            f"(zero-based); selected key {self.key!r}\n"
            f"Naming input: {'ready' if self.ready else 'transitioning; wait and observe'}\n"
            "A selects the current key; B deletes; SELECT changes page; START moves to OK."
        )


# naming_screen.c STATE_FADE_IN .. STATE_WAIT_PAGE_SWAP; from STATE_PRESSED_OK the name is saved.
LAST_EDITING_PHASE = 5


def editor_open(read: ReadMemory) -> bool:
    pointer = int.from_bytes(read(NAMING_POINTER, 4), "little")
    if not 0x02000000 <= pointer <= 0x02040000 - 0x1E40 or pointer % 4:
        return False
    return read(pointer + 0x1E10, 1)[0] <= LAST_EDITING_PHASE


def read_naming(read: ReadMemory, decode: Callable[[bytes], str]) -> NamingState | None:
    pointer = int.from_bytes(read(NAMING_POINTER, 4), "little")
    if not 0x02000000 <= pointer <= 0x02040000 - 0x1E40 or pointer % 4:
        return None
    phase = read(pointer + 0x1E10, 1)[0]
    page, sprite = read(pointer + 0x1E22, 2)
    if page >= len(KEYBOARDS) or sprite >= 64:
        return None
    cursor = read(SPRITES + sprite * 0x44, 0x44)
    column, row = struct.unpack_from("<hh", cursor, 0x2E)
    columns = 6 if page == 0 else 8
    if not cursor[0x3E] & 1 or not 0 <= column <= columns or not 0 <= row < 4:
        return None
    if column == columns:
        if row == 3:
            return None
        key = ("PAGE", "BACK", "OK")[row]
    else:
        key = KEYBOARDS[page][row][column]
        if key == " ":
            key = "SPACE"
    return NamingState(
        decode(read(pointer + 0x1800, 16)), PAGES[page], column, row, key, phase == 2
    )
