"""Main menu task-owned variants and input cursor, separate from Birch intro."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import MenuValue, _ewram, _text_pointer, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi
MAIN_CALLBACK = 0x0802F6B1
MAIN_TASKS = frozenset(
    {
        0x0802F8D9,
        0x0802FA5D,
        0x0802FAB1,
        0x0802FB51,
        0x0802FBA5,
        0x080300B1,
        0x0803024D,
        0x0803027D,
        0x08030545,
        0x080305A5,
    }
)
MAIN_OPTIONS = (
    ("NEW GAME", "OPTION"),
    ("CONTINUE", "NEW GAME", "OPTION"),
    ("CONTINUE", "NEW GAME", "MYSTERY GIFT", "OPTION"),
    ("CONTINUE", "NEW GAME", "MYSTERY GIFT", "MYSTERY EVENTS", "OPTION"),
)


MAP_GROUP_SIZES = (
    57,
    5,
    5,
    6,
    7,
    8,
    9,
    7,
    7,
    14,
    8,
    17,
    10,
    23,
    13,
    15,
    15,
    2,
    2,
    2,
    3,
    1,
    1,
    1,
    108,
    61,
    89,
    2,
    1,
    13,
    1,
    1,
    3,
    1,
)


def _saved_header(read: ReadMemory) -> dict[str, MenuValue]:
    """Read only the loaded SaveBlock header, without inventing field coordinates."""
    save1, save2 = struct.unpack("<II", read(0x03005D8C, 8))
    if not _ewram(save1, 0x3B58) or not _ewram(save2, 0x90):
        raise ValueError("invalid main-menu loaded save pointers")
    name_bytes = read(save2, 8)
    if b"\xff" not in name_bytes:
        raise ValueError("unterminated saved player name")
    name = _text_pointer(read, save2)
    gender = read(save2 + 8, 1)[0]
    hours, minutes, seconds = struct.unpack("<HBB", read(save2 + 0xE, 4))
    group, number = struct.unpack("<bb", read(save1 + 4, 2))
    if not name or gender not in (0, 1) or hours > 999 or minutes > 59 or seconds > 59:
        raise ValueError("invalid main-menu saved player/time header")
    if not 0 <= group < len(MAP_GROUP_SIZES) or not 0 <= number < MAP_GROUP_SIZES[group]:
        raise ValueError("invalid main-menu saved map ID")
    group_pointer = struct.unpack("<I", read(0x08486578 + group * 4, 4))[0]
    if not 0x08000000 <= group_pointer < 0x0A000000 - number * 4 - 4:
        raise ValueError("invalid saved-map group pointer")
    map_pointer = struct.unpack("<I", read(group_pointer + number * 4, 4))[0]
    if not 0x08000000 <= map_pointer < 0x0A000000 - 0x1C:
        raise ValueError("invalid saved-map header pointer")
    section = read(map_pointer + 0x14, 1)[0]
    if section > 212:
        raise ValueError("invalid saved-map section")
    map_name_pointer = struct.unpack("<I", read(0x085A147C + section * 8 + 4, 4))[0]
    map_name = _text_pointer(read, map_name_pointer)
    flags = read(save1 + 0x1270, 0x12C)

    def flag(index: int) -> bool:
        return bool(flags[index >> 3] & (1 << (index & 7)))

    badges = [
        name
        for i, name in enumerate(
            ("STONE", "KNUCKLE", "DYNAMO", "HEAT", "BALANCE", "FEATHER", "MIND", "RAIN")
        )
        if flag(0x867 + i)
    ]
    has_dex = flag(0x861)
    national = (
        read(save2 + 0x1A, 1)[0] == 0xDA
        and struct.unpack("<H", read(save1 + 0x139C + 0x46 * 2, 2))[0] == 0x302
        and flag(0x896)
    )
    result: dict[str, MenuValue] = {
        "saved_player_name": name,
        "saved_player_gender": "MALE" if gender == 0 else "FEMALE",
        "saved_map_group": group,
        "saved_map_number": number,
        "saved_map_section": section,
        "saved_map_name": map_name,
        "saved_badges": badges,
        "saved_badge_count": len(badges),
        "saved_play_hours": hours,
        "saved_play_minutes": minutes,
        "saved_play_seconds": seconds,
        "saved_pokedex_visible": has_dex,
    }
    if has_dex:
        owned = read(save2 + 0x28, 52)
        seen = read(save2 + 0x5C, 52)
        seen1, seen2 = read(save1 + 0x988, 52), read(save1 + 0x3B24, 52)
        numbers = (
            list(range(1, 387)) if national else list(struct.unpack("<202H", read(0x0831DFB8, 404)))
        )
        if len(set(numbers)) != len(numbers) or any(not 1 <= number <= 386 for number in numbers):
            raise ValueError("invalid Hoenn-to-national dex table")
        caught = 0
        for number in numbers:
            index, bit = (number - 1) >> 3, 1 << ((number - 1) & 7)
            if owned[index] & bit:
                if not all(copy[index] & bit for copy in (seen, seen1, seen2)):
                    raise ValueError("inconsistent saved caught/seen Pokedex copies")
                caught += 1
        result.update(
            {
                "saved_pokedex_mode": "NATIONAL" if national else "HOENN",
                "saved_pokedex_caught": caught,
            }
        )
    return result


def read_prelude_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn, decode_message

    if callback != MAIN_CALLBACK:
        return None
    owners = [t for t in task_snapshot(read) if t[1] in MAIN_TASKS]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "main_menu_transition"
    try:
        if len(owners) != 1:
            raise ValueError("multiple main menu owners")
        task, fn, data = owners[0]
        details["owner_task"] = task
        if fn in (0x0803024D, 0x080300B1):
            variant, cursor, count = data[0], data[1], data[12]
            if variant not in range(4) or count != variant + 2 or not 0 <= cursor < count:
                raise ValueError("invalid main menu variant/count/cursor")
            options = list(MAIN_OPTIONS[variant])
            if variant:
                details.update(_saved_header(read))
            window = cursor if variant == 0 else cursor + 2
            if not _window_drawn(read, window):
                raise ValueError("main menu selected window is not drawn")
            details.update(
                {
                    "options": options,
                    "selected_index": cursor,
                    "is_scrolled": bool(data[14]),
                    "wireless_adapter_connected": bool(data[15]),
                }
            )
            return ActiveUi(
                "main_menu",
                options[cursor],
                fn == 0x0803024D and not bool(read(0x02037FDB, 1)[0] & 128),
                "UP/DOWN selects; A accepts; B returns to title",
                details=details,
            )
        if fn in (0x0802FA5D, 0x0802FB51):
            phase = "main_save_error" if fn == 0x0802FA5D else "main_battery_warning"
            if not _window_drawn(read, 7):
                raise ValueError("main menu warning window is not drawn")
            active = read(0x020201B0 + 7 * 0x24 + 0x1B, 1)[0]
            if active not in (0, 1):
                raise ValueError("invalid main menu warning printer flag")
            if fn == 0x0802FB51:
                details["message"] = decode_message(read(0x085E8453, 512))
            else:
                save_status = struct.unpack("<H", read(0x03006210, 2))[0]
                messages = {2: 0x085E8405, 255: 0x085E83C2, 4: 0x085E8440}
                if save_status not in messages:
                    raise ValueError("invalid save-file warning owner status")
                details["save_status"] = save_status
                details["message"] = decode_message(read(messages[save_status], 512))
            if not details["message"]:
                raise ValueError("main menu warning text is empty")
            return ActiveUi(
                phase,
                "CONTINUE" if not active else None,
                not bool(active),
                "A continues after message printing",
                details=details,
            )
        return ActiveUi(
            phase, None, False, "Main menu initialization or handoff in progress", details=details
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase, None, None, "Main menu observation unavailable", str(error), details=details
        )
