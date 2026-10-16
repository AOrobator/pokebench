"""birch-speech-pages-v1: a Birch intro page that waits for A reads input-ready.

pret/pokeemerald 731ad5bf src/main_menu.c: after the name is accepted,
Task_NewGameBirchSpeech_WaitForSpriteFadeInAndTextPrinter (0x0803133D) prints
gText_Birch_YourePlayer and Task_NewGameBirchSpeech_ShrinkPlayer (0x080314C5) prints
gText_Birch_AreYouReady, both through text printer 0 on window 0. At each `\\p` the
printer enters RENDER_STATE_CLEAR (`\\l`: RENDER_STATE_SCROLL_START) and waits in
TextPrinterWaitWithDownArrow for A or B with the red arrow shown (src/text.c), unless
gTextFlags.autoScroll is set. Both tasks run the printer, and so take A or B, only once
tIsDoneFadingSprites (task data[5]) is set (main_menu.c:1257, 1684, 1732). The interface
value is the page on screen, so each page turn is an interface change. Any short read
keeps the old not-ready line.
"""

import struct

from pokebench_env.game_screen import ReadMemory
from pokebench_env.ui_state import (
    CONTROL_ARGS,
    STRING_VAR4,
    STRING_VAR4_SIZE,
    ActiveUi,
    decode_message,
    window_drawn_strict,
)

SWITCH = "birch-speech-pages-v1"
PAGE_TASKS = frozenset({0x0803133D, 0x080314C5})
PRINTER = 0x020201B0
TEXT_FLAGS = 0x03003014
# RENDER_STATE_WAIT, RENDER_STATE_CLEAR, RENDER_STATE_SCROLL_START (include/text.h).
WAITING = frozenset({1, 2, 3})
PHASE = "birch_speech_page"
TASK_SIZE = 0x28
# gTasks[i].data[5] (struct Task: func, isActive, prev, next, priority, s16 data[16]).
DONE_FADING = 8 + 2 * 5
CONTROLS = "A or B shows the next page (the value is the page on screen)"


def page_text(buffer: bytes, cursor: int) -> str:
    """The page written so far: bytes after the last page clear (0xFB) before `cursor`."""
    start = 0
    i = 0
    while i < cursor:
        code = buffer[i]
        if code == 0xFC and i + 1 < cursor:
            i += 2 + CONTROL_ARGS.get(buffer[i + 1], 0)
            continue
        if code == 0xFD:
            i += 2
            continue
        i += 1
        if code == 0xFB and i < cursor:
            start = i
    return decode_message(buffer[start:cursor].rstrip(b"\xfb") + b"\xff")


def read_birch_page(read: ReadMemory, task: bytes) -> ActiveUi | None:
    """`task` is the owning gTasks entry; None keeps the old not-ready line."""
    if len(task) != TASK_SIZE:
        return None
    if int.from_bytes(task[:4], "little") not in PAGE_TASKS:
        return None
    if struct.unpack_from("<h", task, DONE_FADING)[0] == 0:
        return None
    printer = read(PRINTER, 0x24)
    if len(printer) != 0x24 or printer[0x1B] != 1 or printer[0x1C] not in WAITING:
        return None
    flags = read(TEXT_FLAGS, 1)
    if len(flags) != 1 or flags[0] & 4:
        return None
    if window_drawn_strict(read, 0) is not True:
        return None
    cursor = int.from_bytes(printer[:4], "little") - STRING_VAR4
    if not 0 < cursor <= STRING_VAR4_SIZE:
        return None
    buffer = read(STRING_VAR4, STRING_VAR4_SIZE)
    if len(buffer) != STRING_VAR4_SIZE:
        return None
    page = page_text(buffer, cursor)
    if not page:
        return None
    return ActiveUi(PHASE, None, True, CONTROLS, value=page)
