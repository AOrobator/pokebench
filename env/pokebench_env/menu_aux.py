"""Exact ROM-owned diploma, clear-save and reset-RTC interfaces.

Source: diploma.c, clear_save_data_screen.c, reset_rtc_screen.c, qualified by
historical primary ASM. Late menus have fixture qualification, not native proof.
"""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import _text_pointer, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

AUX_CALLBACKS = {
    0x08177889,
    0x08177A09,
    0x0817ACC9,
    0x0817ADF5,
    0x0817ADE5,
    0x0817AFD5,
    0x0809EF89,
    0x0809F091,
}


def read_aux_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import (
        STRING_VAR4,
        STRING_VAR4_SIZE,
        ActiveUi,
        _window_drawn,
        decode_message,
        read_menu,
    )

    if callback not in AUX_CALLBACKS:
        return None
    details = owner_details(read, callback)
    phase = "auxiliary_transition"
    try:
        tasks = task_snapshot(read)
        if callback in (0x08177889, 0x08177A09):
            phase = "diploma"
            owners = [t for t in tasks if t[1] in (0x08177A21, 0x08177A51, 0x08177A99)]
            if callback == 0x08177889:
                return ActiveUi(
                    "diploma_transition", None, False, "Diploma initializing", details=details
                )
            if len(owners) != 1:
                raise ValueError("no unique diploma task owner")
            ready = owners[0][1] == 0x08177A51
            if _window_drawn(read, 0):
                details["message"] = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
                details["pokedex_type"] = _text_pointer(read, 0x02021CC4)
            elif ready:
                raise ValueError("diploma input has no drawn certificate")
            return ActiveUi(
                phase, "A OR B: CLOSE" if ready else None, ready, "Diploma", details=details
            )
        if callback in (0x0817ACC9, 0x0817ADF5, 0x0817ADE5, 0x0817AFD5):
            phase = "clear_save_transition"
            if callback != 0x0817ADE5:
                return ActiveUi(phase, None, False, "Clear-save setup or return", details=details)
            owners = [t for t in tasks if t[1] in (0x0817ACE5, 0x0817AD41, 0x0817ADC1)]
            if len(owners) != 1:
                raise ValueError("no unique clear-save owner")
            function = owners[0][1]
            if function == 0x0817AD41:
                phase = "clear_save_confirmation"
                menu = read_menu(read)
                if menu is None or menu.options != 2:
                    raise ValueError("clear-save input has no live YES/NO window")
                details.update(
                    options=["YES", "NO"],
                    selected_index=(menu.selected - 1),
                    message=_text_pointer(read, 0x085EFA8F),
                )
                return ActiveUi(
                    phase,
                    ("YES", "NO")[(menu.selected - 1)],
                    True,
                    "Delete all save data?",
                    details=details,
                )
            if function == 0x0817ADC1:
                phase = "clear_save_writing"
                details["message"] = _text_pointer(read, 0x085EFAAA)
            return ActiveUi(phase, None, False, "Clear-save transition", details=details)
        phase = "reset_rtc"
        if callback == 0x0809EF89:
            return ActiveUi(
                "reset_rtc_transition", None, False, "Clock-reset initialization", details=details
            )
        edit = [t for t in tasks if t[1] == 0x0809EDE9]
        prompt = [t for t in tasks if t[1] == 0x0809F0F9 and t[2][0] == 1]
        root = [t for t in tasks if t[1] == 0x0809F201]
        if len(edit) > 1 or len(prompt) > 1 or len(root) != 1:
            raise ValueError("clock-reset owners are not unique")
        if edit:
            data = edit[0][2]
            values = data[3:7]
            if not (
                1 <= data[2] <= 5
                and 1 <= values[0] <= 9999
                and 0 <= values[1] <= 23
                and all(0 <= v <= 59 for v in values[2:])
            ):
                raise ValueError("clock-reset cursor/time outside native bounds")
            if not _window_drawn(read, data[8]):
                raise ValueError("clock-reset input window is not drawn")
            options = ["DAYS", "HOURS", "MINUTES", "SECONDS", "CONFIRM"]
            details.update(
                options=options,
                selected_index=data[2] - 1,
                days=values[0],
                hours=values[1],
                minutes=values[2],
                seconds=values[3],
            )
            return ActiveUi(
                "reset_rtc_edit",
                options[data[2] - 1],
                True,
                "Arrows edit; A confirms; B cancels",
                details=details,
            )
        if prompt:
            if not _window_drawn(read, 0) or not _window_drawn(read, 1):
                raise ValueError("clock-reset prompt windows are not drawn")
            save = struct.unpack("<I", read(0x03005D90, 4))[0]
            if save % 4 or not 0x02000000 <= save <= 0x02040000 - 0xA8:
                raise ValueError("clock-reset previous time SaveBlock2 pointer invalid")
            for label, address in (("present", 0x03005CF8), ("previous", save + 0xA0)):
                days, hours, minutes, seconds = struct.unpack("<Hbbb", read(address, 5))
                if (
                    not 0 <= days <= 9999
                    or not 0 <= hours <= 23
                    or not all(0 <= v <= 59 for v in (minutes, seconds))
                ):
                    raise ValueError("clock-reset displayed time outside native bounds")
                details[label + "_time"] = [days, hours, minutes, seconds]
            details["message"] = _text_pointer(read, 0x085EC9EC)
            details["options"] = ["A: RESET TIME", "B: CANCEL"]
            return ActiveUi(
                "reset_rtc_confirmation",
                "A: RESET TIME; B: CANCEL",
                True,
                "Clock-reset confirmation",
                details=details,
            )
        state = root[0][2][0]
        details["rtc_state"] = state
        if state == 5:
            # ShowMessage uses immediate-speed AddTextPrinter; its final native
            # sTempTextPrinter, not the inactive per-window printers, retains the
            # actual displayed result's ending pointer. Exact ROM AddTextPrinter
            # 0800467C qualifies temp0202018C and template.windowId+4.
            printer = read(0x0202018C, 5)
            current = struct.unpack_from("<I", printer)[0]
            if printer[4] != 1 or not _window_drawn(read, 1):
                raise ValueError("clock-reset result has no native message printer/window")
            matches = []
            for pointer in (0x085ECAA7, 0x085ECA8A, 0x085ECA9A):
                raw = read(pointer, 64)
                terminator = raw.find(b"\xff")
                if terminator >= 0 and pointer <= current <= pointer + terminator + 1:
                    matches.append(pointer)
            if len(matches) != 1:
                raise ValueError("clock-reset result printer has no unique source message")
            details["message"] = _text_pointer(read, matches[0])
            return ActiveUi(
                "reset_rtc_result", "A: CONTINUE", True, "Clock-reset result", details=details
            )
        if not 0 <= state <= 6:
            raise ValueError("unknown clock-reset state")
        return ActiveUi(
            "reset_rtc_transition", None, False, "Clock-reset transition", details=details
        )
    except (ValueError, IndexError) as error:
        return ActiveUi(
            phase, None, False, "Auxiliary menu invalid", diagnostic=str(error), details=details
        )
