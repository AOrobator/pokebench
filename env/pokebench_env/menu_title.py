"""Title animation skip, launch controls and exact automatic fade callbacks.

Source title_screen.c and event_data.c; historical title_screen.s matches US-ROM
callback/task addresses and CanResetRTC's flag+variable predicate.
"""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import _ewram, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

TITLE_INIT = 0x080AA7A5
TITLE_MAIN = 0x080AAB2D
TITLE_TASKS = {
    0x080AAB45: "title_logo_animation",
    0x080AAC51: "title_banner_animation",
    0x080AAD65: "title_launch",
}
TRANSITIONS = {
    0x0816CC55: "intro_to_title",
    0x080AAEB9: "title_to_main_menu",
    0x080AAED5: "title_to_copyright",
    0x080AAEF1: "title_to_clear_save",
    0x080AAF0D: "title_to_reset_rtc",
    0x0802F6DD: "main_menu_initializing",
}


def read_title_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback not in (TITLE_INIT, TITLE_MAIN) and callback not in TRANSITIONS:
        return None
    if callback in TRANSITIONS:
        # All these callbacks only poll palette fade or initialize the main
        # menu. Old title input tasks may remain allocated but aren't executed.
        return ActiveUi(TRANSITIONS[callback], None, False, "Automatic title/menu handoff")
    details = owner_details(read, callback)
    phase = "title_initializing"
    try:
        if callback == TITLE_INIT:
            state = read(0x030022C0 + 0x438, 1)[0]
            if state > 5:
                raise ValueError("title initialization state outside source enum")
            details["init_state"] = state
            return ActiveUi(phase, None, False, "Title initialization", details=details)
        owners = [task for task in task_snapshot(read) if task[1] in TITLE_TASKS]
        if len(owners) != 1:
            raise ValueError("title has no unique native input owner")
        _, function, data = owners[0]
        phase = TITLE_TASKS[function]
        if function != 0x080AAD65:
            controls = [
                "A: SKIP ANIMATION",
                "B: SKIP ANIMATION",
                "START: SKIP ANIMATION",
                "SELECT: SKIP ANIMATION",
            ]
            details["available_controls"] = controls
            return ActiveUi(
                phase,
                "A/B/START/SELECT: SKIP ANIMATION",
                True,
                "Press a launch button to advance the title animation",
                details=details,
            )
        save = struct.unpack("<I", read(0x03005D8C, 4))[0]
        if not _ewram(save, 0x3B58) or save % 4:
            raise ValueError("title RTC availability SaveBlock1 pointer invalid")
        rtc_flag = bool(read(save + 0x1270 + 0x8C2 // 8, 1)[0] & (1 << (0x8C2 % 8)))
        rtc_value = struct.unpack("<H", read(save + 0x139C + (0x402C - 0x4000) * 2, 2))[0]
        enabled = rtc_flag and rtc_value == 0x920
        controls = ["A OR START: MAIN MENU", "UP+B+SELECT: CLEAR SAVE", "B+SELECT: BERRY FIX"]
        if enabled:
            controls.append("LEFT+B+SELECT: RESET RTC")
        details.update(available_controls=controls, rtc_reset_enabled=enabled)
        # Task_TitleScreenPhase3 tests A/START first, then clear-save, then RTC,
        # then B+SELECT. Record priority because chords can contain multiple keys.
        details["shortcut_priority"] = ["MAIN MENU", "CLEAR SAVE", "RESET RTC", "BERRY FIX"]
        return ActiveUi(
            phase,
            "A OR START: MAIN MENU",
            True,
            "A/START opens the main menu; held maintenance chords are available",
            details=details,
        )
    except (ValueError, struct.error) as error:
        return ActiveUi(
            phase, None, False, "Title owner invalid", diagnostic=str(error), details=details
        )
