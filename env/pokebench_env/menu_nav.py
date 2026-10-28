"""PokéNav selections owned by its resources, active menu and list cursor.

Exact US ROM callbacks/resources/table matched to pokenav*.c and historical
assembly; menu callback wrappers must match the current ROM callback table.
"""

import struct
from typing import TYPE_CHECKING, cast

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menu_views import _buffer_text
from pokebench_env.menus import MenuValue, _ewram, _text_pointer, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

NAV_CALLBACK = 0x081C7401
NAV_POINTER = 0x0203CF40
NAV_CALLBACK_TABLE = 0x0861F3EC
SHORT_LIST = "pokenav-short-list-v1"


def _ptr(read: ReadMemory, resource: int, index: int, size: int) -> int:
    pointer = int(struct.unpack("<I", read(resource + 16 + index * 4, 4))[0])
    if not _ewram(pointer, size):
        raise ValueError(f"invalid PokeNav substruct {index} pointer")
    return pointer


def _list_cursor(
    read: ReadMemory, resource: int, *, require_drawn: bool = True, short_list: bool = False
) -> tuple[int, bytes, dict[str, MenuValue]]:
    from pokebench_env.ui_state import _window_drawn

    pointer = _ptr(read, resource, 17, 0x8A4)
    window = struct.unpack("<H", read(pointer + 8, 2))[0]
    raw = read(pointer + 0x888, 20)
    top, length, _offscreen, row, shown = struct.unpack_from("<5H", raw)
    item_size, items = struct.unpack_from("<II", raw, 12)
    index = top + row
    # pokenav_list.c CopyPokenavListTemplate: entriesOnscreen = maxShowed even when the
    # list is shorter (one Match Call contact shows in an 8-row window).
    valid = (
        0 < length <= 426 and 0 < shown and row < min(shown, length)
        if short_list
        else 0 < shown <= length <= 426 and row < shown
    )
    if not valid or index >= length or item_size != 4:
        raise ValueError("invalid PokeNav list length/cursor/item size")
    if not _ewram(items, length * item_size) or (require_drawn and not _window_drawn(read, window)):
        raise ValueError("invalid or undrawn PokeNav list")
    details: dict[str, MenuValue] = {
        "selected_index": index,
        "list_count": length,
        "visible_list_entries": list(read(items + top * 4, min(shown, length - top) * 4)),
    }
    return index, read(items + index * 4, 4), details


def _call_text_printing(read: ReadMemory, resource: int) -> bool:
    """pokenav_match_call_gfx.c DoMatchCallMessage: the message box prints sText_CallingDots
    from ROM first; only PrintMatchCallMessage buffers the call into gStringVar4 and prints it.
    Until then gStringVar4 still holds earlier text, so it is the call only while the
    msgBoxWindowId printer reads from it."""
    from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE

    gfx = _ptr(read, resource, 6, 22)
    window = int(struct.unpack("<H", read(gfx + 20, 2))[0])
    if window >= 32:
        raise ValueError("invalid Match Call message window")
    current = int(struct.unpack("<I", read(0x020201B0 + window * 0x24, 4))[0])
    return STRING_VAR4 <= current < STRING_VAR4 + STRING_VAR4_SIZE


def _mon_list(read: ReadMemory, pointer: int) -> dict[str, MenuValue]:
    if not _ewram(pointer, 8):
        raise ValueError("invalid PokeNav Pokemon list pointer")
    count, index = struct.unpack("<HH", read(pointer, 4))
    if not 0 <= index < count <= 426 or not _ewram(pointer, 4 + count * 4):
        raise ValueError("invalid PokeNav Pokemon list count/index")
    box, slot, value = struct.unpack("<BBH", read(pointer + 4 + index * 4, 4))
    if box > 14 or slot >= (6 if box == 14 else 30):
        raise ValueError("invalid PokeNav Pokemon box/slot")
    return {
        "selected_index": index,
        "list_count": count,
        "box_index": box,
        "pokemon_slot": slot,
        "list_value": value,
        "pokemon_source": "PARTY" if box == 14 else "BOX",
    }


def _match_call_name(read: ReadMemory, special: int, header: int) -> tuple[str, str]:
    if special not in (0, 1):
        raise ValueError("invalid Match Call special-trainer flag")
    if special:
        if header >= 21:
            raise ValueError("invalid Match Call header ID")
        pointer = struct.unpack("<I", read(0x086252A8 + header * 4, 4))[0]
        if not 0x08000000 <= pointer < 0x0A000000 - 16:
            raise ValueError("invalid Match Call header pointer")
        raw = read(pointer, 16)
        kind = raw[0]
        if kind in (0, 3, 4):
            desc, name = struct.unpack_from("<II", raw, 4)
            return _text_pointer(read, name), _text_pointer(read, desc)
        if kind not in (1, 2, 5):
            raise ValueError("invalid Match Call header type")
        rematch = struct.unpack_from("<H", raw, 4)[0]
        desc = struct.unpack_from("<I", raw, 8)[0]
        name = struct.unpack_from("<I", raw, 12)[0] if kind != 2 else 0
        if name:
            return _text_pointer(read, name), _text_pointer(read, desc)
    else:
        rematch, desc = header, 0
    if rematch >= 78:
        raise ValueError("invalid Match Call rematch table index")
    trainer = struct.unpack("<H", read(0x085500A4 + rematch * 16, 2))[0]
    if trainer >= 855:
        raise ValueError("invalid Match Call trainer ID")
    record = 0x08310030 + trainer * 40
    trainer_class = read(record + 1, 1)[0]
    if trainer_class >= 66:
        raise ValueError("invalid Match Call trainer class")
    return _text_pointer(read, record + 4), _text_pointer(
        read, desc or 0x0830FCD4 + trainer_class * 13
    )


def _match_call_flavor(
    read: ReadMemory, special: int, header: int
) -> list[str | int | float | bool | None]:
    """Exact MatchCall_GetFlavorText / override selection, including Steven flag."""
    rematch = header
    if special:
        pointer = struct.unpack("<I", read(0x086252A8 + header * 4, 4))[0]
        raw = read(pointer, 16)
        rematch = struct.unpack_from("<H", raw, 4)[0] if raw[0] in (1, 2, 5) else 78
    if rematch < 78:
        pointers = struct.unpack("<4I", read(0x08622028 + rematch * 16, 16))
    elif special:
        records = [struct.unpack("<HHI4I", read(0x08625388 + i * 24, 24)) for i in range(4)]
        matches = [i for i, record in enumerate(records) if record[0] == header]
        if not matches:
            raise ValueError("Match Call check page has no native override")
        index = matches[0]
        for candidate in matches[1:]:
            flag = records[candidate][2]
            save = struct.unpack("<I", read(0x03005D8C, 4))[0]
            if not 0x02000000 <= save <= 0x02040000 - 0x3B58 or save % 4 or flag >= 0x900:
                raise ValueError("Match Call override flag owner invalid")
            if not read(save + 0x1270 + flag // 8, 1)[0] & (1 << (flag % 8)):
                break
            index = candidate
        pointers = records[index][3:]
    else:
        raise ValueError("Match Call flavor rematch index invalid")
    return [_text_pointer(read, pointer) if pointer else None for pointer in pointers]


def read_nav_ui(
    read: ReadMemory, callback: int, *, short_list: bool = False, call_advance: bool = False
) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback != NAV_CALLBACK:
        return None
    details = owner_details(read, callback)
    phase = "pokenav_transition"
    try:
        pointer = struct.unpack("<I", read(NAV_POINTER, 4))[0]
        if not _ewram(pointer, 0x5C):
            raise ValueError("invalid PokenavResources pointer")
        handler, menu_index, mode = struct.unpack("<IIH", read(pointer, 10))
        if menu_index >= 15 or mode >= 5:
            raise ValueError("invalid PokeNav menu index/mode")
        expected_handler = struct.unpack("<I", read(NAV_CALLBACK_TABLE + menu_index * 28 + 4, 4))[0]
        if handler != expected_handler or not 0x08000000 <= handler < 0x0A000000:
            raise ValueError("PokeNav active handler does not match ROM callback table")
        owners = [t for t in task_snapshot(read) if t[1] == 0x081C742D]
        if len(owners) != 1 or owners[0][2][0] not in range(8):
            raise ValueError("invalid PokeNav root task/state")
        task_state = owners[0][2][0]
        details.update(
            {
                "owner_task": owners[0][0],
                "pokenav_menu_index": menu_index,
                "pokenav_mode": mode,
                "pokenav_task_state": task_state,
                "menu_handler": f"0x{handler:08X}",
            }
        )
        ready = task_state == 3 and not bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
        if menu_index in range(6):
            phase = "pokenav_menu"
            state_pointer = _ptr(read, pointer, 1, 16)
            menu_type, cursor, current_item, _help, _menu_id, input_callback = struct.unpack(
                "<HhHHII", read(state_pointer, 16)
            )
            options_by_type = [
                ["HOENN MAP", "CONDITION", "SWITCH OFF"],
                ["HOENN MAP", "CONDITION", "MATCH CALL", "SWITCH OFF"],
                ["HOENN MAP", "CONDITION", "MATCH CALL", "RIBBONS", "SWITCH OFF"],
                ["PARTY", "SEARCH", "CANCEL"],
                ["COOL", "BEAUTY", "CUTE", "SMART", "TOUGH", "CANCEL"],
            ]
            if menu_type >= len(options_by_type) or cursor not in range(
                len(options_by_type[menu_type])
            ):
                raise ValueError("invalid PokeNav main/condition menu cursor")
            options = options_by_type[menu_type]
            known_input: tuple[int, ...] = (
                0x081C943D,
                0x081C9521,
                0x081C9589,
                0x081C963D,
                0x081C96FD,
            )
            details.update(
                {
                    "options": options,
                    "selected_index": cursor,
                    "current_menu_item": current_item,
                    "menu_type": menu_type,
                    "input_callback": f"0x{input_callback:08X}",
                }
            )
            return ActiveUi(
                phase,
                options[cursor],
                ready and input_callback in known_input,
                "UP/DOWN selects; A accepts; B returns",
                details=details,
            )
        if menu_index == 6:
            phase = "pokenav_region_map"
            region = _ptr(read, pointer, 16, 0x884)
            if struct.unpack("<I", read(0x0203A144, 4))[0] != region:
                raise ValueError("PokeNav region map input pointer mismatches owned region map")
            raw = read(region, 0x84)
            section = struct.unpack_from("<H", raw)[0]
            x, y = struct.unpack_from("<HH", raw, 0x54)
            input_callback = struct.unpack_from("<I", raw, 0x18)[0]
            if section > 213 or raw[2] > 4 or not 1 <= x <= 28 or not 2 <= y <= 16:
                raise ValueError("invalid PokeNav map selection/cursor")
            if input_callback not in (0x081230C5, 0x08123191, 0x08123255, 0x08123335):
                raise ValueError("unverified PokeNav region input callback")
            label = _buffer_text(raw[4:24])
            details.update(
                {
                    "map_section": section,
                    "map_section_type": raw[2],
                    "map_name": label,
                    "column": x,
                    "row": y,
                    "zoomed": bool(raw[0x78]),
                }
            )
            return ActiveUi(
                phase,
                label,
                ready and input_callback in (0x081230C5, 0x08123255),
                "Directions move cursor; A changes zoom; B returns",
                details=details,
            )
        if menu_index in (7, 9):
            phase = "pokenav_condition_graph"
            mon_list = _ptr(read, pointer, 18, 8)
            count, index = struct.unpack("<HH", read(mon_list, 4))
            if menu_index == 7 and 0 <= index == count - 1 and count <= 7:
                details.update({"selected_index": index, "list_count": count, "is_cancel": True})
                return ActiveUi(
                    phase, "CANCEL", ready, "A exits; UP/DOWN changes Pokemon", details=details
                )
            details.update(_mon_list(read, mon_list))
            graph = _ptr(read, pointer, 11, 0x678C)
            graph_callback = struct.unpack("<I", read(graph + 0x6304, 4))[0]
            details["input_callback"] = f"0x{graph_callback:08X}"
            if graph_callback == 0x081CD111:
                from pokebench_env.menu_markings import read_markings_ui

                return read_markings_ui(read, callback, ready=ready)
            ready = ready and graph_callback == 0x081CD08D
            return ActiveUi(
                phase,
                f"{details['pokemon_source']} {details['box_index']} "
                f"SLOT {details['pokemon_slot']}",
                ready,
                "UP/DOWN changes Pokemon; A edits markings; B returns",
                details=details,
            )
        if menu_index in (8, 10, 12, 14):
            phase = (
                "pokenav_ribbons_list"
                if menu_index in (12, 14)
                else "pokenav_condition_search_results"
            )
            _, entry, cursor_details = _list_cursor(read, pointer, short_list=short_list)
            box, slot, value = struct.unpack("<BBH", entry)
            if box > 14 or slot >= (6 if box == 14 else 30):
                raise ValueError("invalid PokeNav list Pokemon box/slot")
            details.update(cursor_details)
            details.update(
                {
                    "box_index": box,
                    "pokemon_slot": slot,
                    "list_value": value,
                    "pokemon_source": "PARTY" if box == 14 else "BOX",
                }
            )
            return ActiveUi(
                phase,
                f"{details['pokemon_source']} {box} SLOT {slot}",
                ready,
                "Directions move list; A selects Pokemon; B returns",
                details=details,
            )
        if menu_index == 11:
            phase = "pokenav_match_call"
            state_pointer = _ptr(read, pointer, 5, 28)
            raw = read(state_pointer, 28)
            option, maximum, option_pointer, header = struct.unpack_from("<HHIH", raw)
            registered = struct.unpack_from("<H", raw, 10)[0]
            input_callback = struct.unpack_from("<I", raw, 24)[0]
            index, entry, cursor_details = _list_cursor(
                read,
                pointer,
                require_drawn=input_callback not in (0x081CACB9, 0x081CACF9),
                short_list=short_list,
            )
            special, section, header_id = struct.unpack("<BBH", entry)
            details.update(cursor_details)
            visible = cursor_details["visible_list_entries"]
            if not isinstance(visible, list) or not all(
                isinstance(value, int) for value in visible
            ):
                raise ValueError("invalid Match Call visible entry bytes")
            visible_bytes = bytes(cast(list[int], visible))
            details["visible_trainer_names"] = [
                _match_call_name(read, entry_special, entry_header)[0]
                for entry_special, _section, entry_header in struct.iter_unpack(
                    "<BBH", visible_bytes
                )
            ]
            details.update(
                {
                    "registered_count": registered,
                    "header_id": header_id,
                    "is_special_trainer": bool(special),
                    "map_section": section,
                    "list_build_header": header,
                }
            )
            label, description = _match_call_name(read, special, header_id)
            details.update({"trainer_name": label, "trainer_description": description})
            input_callback = struct.unpack_from("<I", raw, 24)[0]
            details["input_callback"] = f"0x{input_callback:08X}"
            if input_callback == 0x081CACB9:
                phase = "pokenav_match_call_check_page"
                details["flavor_text_order"] = [
                    "STRATEGY",
                    "POKEMON",
                    "SELF INTRO 1",
                    "SELF INTRO 2",
                ]
                details["flavor_texts"] = _match_call_flavor(read, special, header_id)
            elif input_callback == 0x081CACF9:
                from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE, decode_message

                phase = "pokenav_match_call_call"
                if not short_list or _call_text_printing(read, pointer):
                    details["message"] = decode_message(read(STRING_VAR4, STRING_VAR4_SIZE))
            known_input = (0x081CAB45, 0x081CAC05, 0x081CACB9, 0x081CACF9)
            ready = ready and input_callback in known_input
            if input_callback == 0x081CAC05:
                if (
                    option > maximum
                    or maximum > 2
                    or not 0x08000000 <= option_pointer <= 0x0A000000 - maximum - 1
                ):
                    raise ValueError("invalid Match Call option cursor/array")
                ids = list(read(option_pointer, maximum + 1))
                if any(i > 2 for i in ids):
                    raise ValueError("invalid Match Call option id")
                options = [("CALL", "CHECK", "CANCEL")[i] for i in ids]
                details.update({"options": options, "option_index": option})
                label = options[option]
            controls = "Directions select; A calls/checks; B returns"
            if call_advance and phase == "pokenav_match_call_call":
                # 731ad5bf text.h TextPrinter, text.c RenderText; Match Call owns
                # its msgBoxWindowId printer even while the root task is busy.
                gfx = _ptr(read, pointer, 6, 22)
                window = struct.unpack("<H", read(gfx + 20, 2))[0]
                if window >= 32:
                    raise ValueError("invalid Match Call message window")
                printer = read(0x020201B0 + window * 0x24, 0x24)
                current = struct.unpack_from("<I", printer)[0]
                active, text_state = printer[0x1B], printer[0x1C]
                from pokebench_env.ui_state import STRING_VAR4, STRING_VAR4_SIZE

                # sText_CallingDots in the matching US ROM; no stale gStringVar4.
                owned = (
                    0x086227F4 <= current <= 0x08622806
                    or STRING_VAR4 <= current < STRING_VAR4 + STRING_VAR4_SIZE
                )
                if active not in (0, 1) or text_state > 6:
                    raise ValueError("invalid Match Call text printer")
                waiting = (
                    owned
                    and active == 1
                    and text_state in (1, 2, 3)
                    and not bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
                )
                details["call_text_state"] = (
                    "waiting"
                    if waiting
                    else "printing"
                    if owned and active
                    else "finished"
                    if owned and ready
                    else "unavailable"
                )
                controls = "A advances call text; A/B closes the finished call"
                ready = waiting or ready
            return ActiveUi(phase, label, ready, controls, details=details)
        # Ribbon summary is menu 13; selection is a grid position, not a ribbon
        # ID. Preserve both to prevent gaps between the normal and gift rows.
        phase = "pokenav_ribbons_summary"
        state_pointer = _ptr(read, pointer, 13, 0x9C)
        raw = read(state_pointer, 0x9C)
        mon_list = struct.unpack_from("<I", raw, 8)[0]
        details.update(_mon_list(read, mon_list))
        cursor, _, normal_count, gift_count = struct.unpack_from("<4H", raw, 12)
        if normal_count > 25 or gift_count > 7:
            raise ValueError("invalid ribbon summary counts")
        normal = list(struct.unpack_from("<25I", raw, 20))[:normal_count]
        gifts = list(struct.unpack_from("<7I", raw, 120))[:gift_count]
        details.update(
            {"ribbon_cursor": cursor, "normal_ribbon_ids": normal, "gift_ribbon_ids": gifts}
        )
        if cursor < 25 and cursor < normal_count:
            ribbon = normal[cursor]
        elif 27 <= cursor < 27 + gift_count:
            ribbon = gifts[cursor - 27]
        elif not normal_count and not gift_count:
            ribbon = None
        else:
            raise ValueError("invalid ribbon summary cursor")
        details["ribbon_id"] = ribbon
        ribbon_title = None
        if ribbon is not None:
            if not 0 <= ribbon <= 31:
                raise ValueError("invalid ribbon ID")
            if ribbon < 25:
                name, description = struct.unpack("<II", read(0x086239AC + ribbon * 8, 8))
            else:
                save = struct.unpack("<I", read(0x03005D8C, 4))[0]
                if not _ewram(save, 0x31B3):
                    raise ValueError("invalid gift-ribbon SaveBlock1 pointer")
                gift = read(save + 0x31A8 + ribbon - 25, 1)[0]
                details["gift_ribbon_value"] = gift
                if not 1 <= gift <= 64:
                    raise ValueError("invalid or empty gift-ribbon value")
                name, description = struct.unpack("<II", read(0x08623DF8 + (gift - 1) * 8, 8))
            ribbon_title = _text_pointer(read, name)
            details.update(
                {
                    "ribbon_title": ribbon_title,
                    "ribbon_description": _text_pointer(read, description),
                }
            )
        input_callback = struct.unpack_from("<I", raw, 0x98)[0]
        details["input_callback"] = f"0x{input_callback:08X}"
        details["expanded"] = input_callback == 0x081D0549
        ready = ready and input_callback in (0x081D04C5, 0x081D0549)

        return ActiveUi(
            phase,
            ribbon_title or "NO RIBBONS",
            ready,
            "Directions select Pokemon/ribbon; A expands; B returns",
            details=details,
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase, None, None, "PokeNav observation unavailable", str(error), details=details
        )
