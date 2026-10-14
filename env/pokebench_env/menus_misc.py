"""Source/ROM-bound decoration and Hall of Fame input owners."""

import struct
from typing import TYPE_CHECKING, cast

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import (
    PALETTE_FADE,
    MenuValue,
    _ewram,
    _list_selection,
    _text_pointer,
    owner_details,
    task_snapshot,
)
from pokebench_env.menus_extra import _chat_glyphs
from pokebench_env.pokemon import SPECIES_NAMES

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

DECOR_TASKS = {
    135424897: "HandleDecorationActionsMenuInput",
    135436525: "Task_PutAwayDecoration",
    135430241: "Task_PlaceDecoration",
    135433753: "Task_SelectLocation",
    135428629: "Task_ShowDecorationItemsWindow",
    135438941: "Task_StopPuttingAwayDecorations",
    135439045: "Task_ReinitializeDecorationMenuHandler",
    135427661: "HandleDecorationItemsMenuInput",
    135436989: "Task_ContinuePuttingAwayDecorations",
    135433317: "Task_InitDecorationItemsWindow",
    135426185: "HandleDecorationCategoriesMenuInput",
    135433197: "c1_overworld_prev_quest",
    135427617: "ShowDecorationItemsWindow",
}
DECOR_FUNCTIONS = frozenset(
    [
        135424361,
        135424469,
        135424601,
        135424649,
        135424701,
        135424729,
        135424813,
        135424897,
        135425033,
        135425097,
        135425189,
        135425297,
        135425389,
        135425445,
        135425485,
        135425533,
        135425605,
        135425677,
        135425897,
        135426137,
        135426185,
        135426281,
        135426433,
        135426461,
        135426509,
        135426569,
        135426641,
        135426665,
        135426693,
        135426761,
        135426809,
        135426865,
        135427157,
        135427201,
        135427233,
        135427329,
        135427413,
        135427457,
        135427485,
        135427617,
        135427661,
        135427865,
        135427909,
        135428009,
        135428029,
        135428073,
        135428117,
        135428533,
        135428549,
        135428629,
        135428657,
        135428701,
        135428749,
        135428813,
        135428869,
        135428949,
        135429009,
        135429433,
        135429657,
        135429945,
        135429993,
        135430241,
        135430425,
        135430569,
        135430765,
        135431101,
        135431189,
        135431301,
        135431341,
        135431413,
        135431485,
        135432529,
        135432657,
        135432689,
        135432877,
        135433089,
        135433121,
        135433149,
        135433197,
        135433317,
        135433429,
        135433489,
        135433653,
        135433697,
        135433753,
        135434201,
        135434273,
        135434313,
        135434345,
        135434377,
        135434661,
        135434701,
        135434729,
        135434845,
        135434961,
        135434985,
        135435061,
        135435225,
        135435421,
        135435457,
        135435725,
        135436013,
        135436041,
        135436205,
        135436281,
        135436525,
        135436717,
        135436765,
        135436989,
        135437109,
        135437261,
        135437305,
        135437429,
        135437669,
        135437709,
        135437837,
        135437941,
        135438113,
        135438281,
        135438401,
        135438569,
        135438753,
        135438785,
        135438833,
        135438865,
        135438893,
        135438941,
        135439045,
        135439157,
        135439213,
        135439261,
        135439305,
        135439317,
        135439449,
        135439481,
    ]
)
HOF_TASKS = {
    135739165: "initmondata",
    135739581: "initteamsavedata",
    135739845: "trysavedata",
    135739997: "waittodisplaymon",
    135740045: "setmondisplaytask",
    135740073: "displaymon",
    135740353: "printmoninfoafteranimating",
    135740469: "trydisplayanothermon",
    135740709: "palettefadeandprintwelcometext",
    135740865: "doconfetti",
    135741093: "waittodisplayplayer",
    135741157: "displayplayer",
    135741317: "waitandprintplayerinfo",
    135741481: "exitonkeypressed",
    135741537: "handlepaletteonexit",
    135741617: "handleexit",
    135742245: "copysavedata",
    135742445: "drawspritesprinttext",
    135742973: "printmoninfo",
    135743273: "handleinput",
    135743641: "handlepaletteonexit",
    135743729: "handleexit",
    135743905: "printdataiscorrupted",
    135744009: "exitonbuttonpress",
}

DECORATIONS = 0x085A5C08
DECOR_ACTIONS = 0x085A6B48
DECOR_CATEGORIES = 0x085A6B28
DECORATION_ITEMS = 0x0203A14C
DECOR_CONTEXT = 0x0203A17C
SPRITES = 0x02020630
PRINTERS = 0x020201B0
HOF_POINTER = 0x0203BCD8
HOF_CALLBACKS = {0x08173561, 0x08173695, 0x081736D9, 0x08174195}
DECOR_MESSAGE_INPUT = {0x08127A5D, 0x08129021, 0x08129D65}


def decoration_details(read: ReadMemory, data: tuple[int, ...]) -> dict[str, MenuValue]:
    """Context reused by the exact shared decoration confirmation pairs."""
    pointer = int.from_bytes(read(DECORATION_ITEMS, 4), "little")
    count = read(0x0203A151, 1)[0]
    index, category = read(0x0203A172, 2)
    body = read(DECOR_CONTEXT, 12)
    items, positions = struct.unpack_from("<2I", body)
    if category >= 8 or count > 40 or body[8] > 16 or body[9] > 1:
        raise ValueError("invalid decoration category/context")
    details: dict[str, MenuValue] = {
        "category_index": category,
        "owned_category_count": count,
        "selected_inventory_index": index,
        "room_context": "player_room" if body[9] else "secret_base",
        "room_capacity": body[8],
        "room_decoration_items_pointer": items,
        "room_decoration_positions_pointer": positions,
        "decoration_menu_command": data[11],
        "decoration_items_command": data[12],
        "world_cursor_x": data[0],
        "world_cursor_y": data[1],
        "map_cursor_x": data[0] - 7,
        "map_cursor_y": data[1] - 7,
        "decoration_width": data[5],
        "decoration_height": data[6],
        "pending_button": data[10],
    }
    if count:
        if not _ewram(pointer, count):
            raise ValueError("invalid owned decoration inventory pointer")
        ids = list(read(pointer, count))
        names = [_decoration(read, decoration)[0] for decoration in ids]
        details.update({"owned_decoration_ids": ids, "owned_decoration_names": names})
        if index < count:
            name, description = _decoration(read, ids[index])
            details.update(
                {
                    "decoration_id": ids[index],
                    "decoration_name": name,
                    "decoration_description": description,
                }
            )
    return details


def _decoration(read: ReadMemory, decoration: int) -> tuple[str, str]:
    if not 1 <= decoration < 121:
        raise ValueError("invalid decoration ID")
    row = read(DECORATIONS + 32 * decoration, 32)
    if row[0] != decoration:
        raise ValueError("decoration table ID mismatch")
    name = "".join(_chat_glyphs(row[1:17]))
    description = _text_pointer(read, int.from_bytes(row[24:28], "little"))
    return name, description


def _category_counts(read: ReadMemory) -> list[int]:
    counts = []
    for category, capacity in enumerate((10, 10, 10, 30, 30, 10, 40, 10)):
        body = read(0x0203BC40 + 8 * category, 8)
        pointer = int.from_bytes(body[:4], "little")
        if body[4] != capacity or not _ewram(pointer, capacity):
            raise ValueError("invalid decoration category inventory pointer/capacity")
        ids = read(pointer, capacity)
        if any(decoration >= 121 for decoration in ids):
            raise ValueError("invalid decoration category inventory ID")
        counts.append(sum(decoration != 0 for decoration in ids))
    return counts


def _decorations(
    read: ReadMemory, details: dict[str, MenuValue], owner: tuple[int, int, tuple[int, ...]]
) -> "ActiveUi":
    from pokebench_env.ui_state import (
        STRING_VAR4,
        STRING_VAR4_SIZE,
        ActiveUi,
        _window_drawn,
        decode_message,
        read_menu,
    )

    task, function, data = owner
    details.update(
        {"owner_task": task, "decoration_owner": DECOR_TASKS.get(function, "message_continuation")}
    )
    details.update(decoration_details(read, data))
    ready = False
    selected = None
    phase = "decoration_transition"
    if function == 0x08121F3D:
        window = read(0x0203A140, 1)[0]
        continuation = int.from_bytes(read(0x0300117C, 4), "little")
        if window >= 32 or not _window_drawn(read, window):
            raise ValueError("decoration message window undrawn")
        details.update(
            {
                "message": decode_message(read(STRING_VAR4, STRING_VAR4_SIZE)),
                "continuation_callback": f"0x{continuation:08X}",
            }
        )
        active = bool(read(PRINTERS + window * 0x24 + 0x1B, 1)[0])
        ready = not active and continuation in DECOR_MESSAGE_INPUT
        selected = "CONTINUE" if ready else None
        phase = "decoration_message" if ready else "decoration_message_printing"
    elif function in (0x08126B81, 0x08127089):
        menu = read_menu(read)
        count = 4 if function == 0x08126B81 else 9
        if menu is None or menu.options != count:
            raise ValueError("decoration action/category menu undrawn")
        if function == 0x08126B81:
            options = [
                _text_pointer(read, int.from_bytes(read(DECOR_ACTIONS + 8 * i, 4), "little"))
                for i in range(4)
            ]
            phase = "decoration_actions"
            details["cached_action_cursor"] = read(0x0203A150, 1)[0]
        else:
            options = [
                _text_pointer(read, int.from_bytes(read(DECOR_CATEGORIES + 4 * i, 4), "little"))
                for i in range(8)
            ]
            options.append(
                _text_pointer(read, int.from_bytes(read(DECOR_ACTIONS + 24, 4), "little"))
            )
            phase = "decoration_categories"
        details.update({"options": options, "selected_index": menu.selected - 1})
        details["category_owned_counts"] = _category_counts(read)
        if function == 0x08127089 and menu.selected <= 8:
            details["selected_category_index"] = menu.selected - 1
            details["selected_category_owned_count"] = _category_counts(read)[menu.selected - 1]
        selected, ready = options[menu.selected - 1], True
    elif function == 0x0812764D:
        selected, item, index = _list_selection(read, data[13])
        details.update({"list_item_id": item, "list_index": index})
        if item >= 0:
            ids = cast(list[int], details.get("owned_decoration_ids", []))
            if item >= len(ids):
                raise ValueError("decoration list points outside owned inventory")
            name, description = _decoration(read, ids[item])
            details.update(
                {
                    "decoration_id": ids[item],
                    "decoration_name": name,
                    "decoration_description": description,
                }
            )
        phase, ready = "decoration_inventory", True
    elif function == 0x08128E19:
        if (
            data[12] not in (0, 1)
            or data[10] not in (0, 1, 2)
            or not 1 <= data[5] <= 4
            or not 1 <= data[6] <= 4
        ):
            raise ValueError("invalid decoration placement command/shape")
        sprite = read(0x0203AA38, 1)[0]
        if sprite >= 64:
            raise ValueError("invalid decoration camera sprite")
        progress = int.from_bytes(read(SPRITES + sprite * 0x44 + 0x36, 2), "little", signed=True)
        if not 0 <= progress <= 7:
            raise ValueError("invalid decoration cursor interpolation")
        details.update(
            {
                "cursor_sprite": sprite,
                "cursor_movement_progress": progress,
                "movement_ready": progress == 0,
            }
        )
        phase = "decoration_place_location" if data[12] == 0 else "decoration_put_away_location"
        selected = f"({data[0] - 7}, {data[1] - 7})"
        ready = progress == 0 and data[10] == 0
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase, selected, ready, "Directions select/place; A confirms; B cancels", details=details
    )


def _hof_team(read: ReadMemory, base: int, details: dict[str, MenuValue]) -> list[str]:
    raw = read(base, 120)
    if len(raw) != 120:
        raise ValueError("short Hall of Fame team read")
    # Retain fixed-size evidence before validation; a damaged record is a harness
    # diagnostic unless the game owns its explicit save-corruption screen.
    details["team_raw_hex"] = raw.hex()
    ids: list[int] = []
    names: list[str] = []
    levels: list[int] = []
    nicknames: list[str] = []
    identities: list[str] = []
    for slot in range(6):
        row = raw[20 * slot : 20 * (slot + 1)]
        tid, personality, packed = struct.unpack_from("<IIH", row)
        species, level = packed & 0x1FF, packed >> 9
        if species == 0:
            continue
        if species > 412 or not 1 <= level <= 100:
            raise ValueError("invalid Hall of Fame Pokémon species/level")
        ids.append(species)
        names.append(_text_pointer(read, SPECIES_NAMES + 11 * species))
        levels.append(level)
        nicknames.append("".join(_chat_glyphs(row[10:20] + b"\xff")))
        identities.append(f"{personality:08x}:{tid:08x}")
    details.update(
        {
            "species_ids": ids,
            "species_names": names,
            "levels": levels,
            "nicknames": nicknames,
            "identities": identities,
        }
    )
    return names


def _hall_of_fame(read: ReadMemory, callback: int, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi

    owners = [task for task in task_snapshot(read) if task[1] in HOF_TASKS]
    if len(owners) > 1:
        raise ValueError("Hall of Fame has multiple UI owners")
    selected = None
    ready = False
    phase = "hall_of_fame_initializing"
    if owners:
        task, function, data = owners[0]
        phase = "hall_of_fame_" + HOF_TASKS[function]
        details.update({"owner_task": task, "hof_owner": HOF_TASKS[function]})
        if function == 0x08174A09:
            return ActiveUi(
                "hall_of_fame_save_corrupted",
                "EXIT",
                True,
                "A exits the game's corrupted-save message",
                details=details,
            )
        pc = function >= 0x08174325
        pointer = int.from_bytes(read(HOF_POINTER, 4), "little")
        # Initial allocation/copy/mon-data stages do not expose a ready team.
        if function not in (0x0817371D, 0x081738BD, 0x08174325, 0x081749A1):
            team = data[0] if pc else 0
            if not 0 <= team < 50 or not _ewram(pointer + 120 * team, 120):
                raise ValueError("invalid Hall of Fame team pointer/index")
            names = _hof_team(read, pointer + 120 * team, details)
            index = data[2] if pc else data[1]
            details.update(
                {
                    "team_index": team,
                    "page_number": data[1] if pc else None,
                    "selected_mon_index": index,
                }
            )
            if function == 0x08174729:
                if not 1 <= data[4] <= 6 or len(names) != data[4] or not 0 <= index < len(names):
                    raise ValueError("invalid Hall of Fame PC Pokémon cursor/count")
                selected, ready = names[index], True
                phase = "hall_of_fame_pc"
            elif function == 0x08174029:
                selected, ready = "CONTINUE", True
                phase = "hall_of_fame_player_info"
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "UP/DOWN selects Pokémon; A views earlier team/continues; B exits PC",
        details=details,
    )


REGISTRY_TASKS = {0x080E9C9D: "initializing", 0x080E9E91: "list", 0x080E9FB1: "actions"}


def _registry(
    read: ReadMemory, details: dict[str, MenuValue], owner: tuple[int, int, tuple[int, ...]]
) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    task, function, data = owner
    if not 0 <= data[0] <= 20 or not 0 <= data[4] < 20:
        raise ValueError("invalid Secret Base registry count/selected base")
    details.update(
        {
            "owner_task": task,
            "registered_bases_plus_cancel": data[0],
            "selected_base_id": data[4],
            "registry_row": data[1],
            "registry_scroll": data[2],
        }
    )
    selected = None
    ready = False
    phase = "secret_base_registry_" + REGISTRY_TASKS[function]
    if function == 0x080E9E91:
        selected, item, index = _list_selection(read, data[5])
        if item not in range(1, 20) and item != -2:
            raise ValueError("registry list has invalid Secret Base ID")
        details.update({"selected_base_id": item, "selected_index": index})
        ready = True
    elif function == 0x080E9FB1:
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            raise ValueError("Secret Base registry action menu undrawn")
        options = [
            _text_pointer(read, int.from_bytes(read(0x0858D048 + 8 * i, 4), "little"))
            for i in range(2)
        ]
        details["options"] = options
        selected, ready = options[menu.selected - 1], True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase, selected, ready, "Directions select; A confirms; B cancels", details=details
    )


def read_misc_menu(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback not in HOF_CALLBACKS and callback not in (
        0x08085E5D,
        0x08085FFD,
        0x080860F5,
        0x08085FCD,
    ):
        return None
    tasks = task_snapshot(read)
    owners = [task for task in tasks if task[1] in DECOR_TASKS or task[1] in REGISTRY_TASKS]
    messages = [task for task in tasks if task[1] == 0x08121F3D]
    if not owners and messages:
        continuation = int.from_bytes(read(0x0300117C, 4), "little")
        if continuation in DECOR_FUNCTIONS:
            owners = messages
    if callback not in HOF_CALLBACKS:
        if callback not in (0x08085E5D, 0x08085FFD, 0x080860F5, 0x08085FCD) or not owners:
            return None
    details = owner_details(read, callback)
    try:
        if callback in HOF_CALLBACKS:
            return _hall_of_fame(read, callback, details)
        if len(owners) != 1:
            raise ValueError("decoration has multiple UI owners")
        if owners[0][1] in REGISTRY_TASKS:
            return _registry(read, details, owners[0])
        return _decorations(read, details, owners[0])
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            "menu_unsupported",
            None,
            None,
            "Observe and report this coverage error",
            f"harness bug: {error}",
            details=details,
        )
