"""Source-owned daycare, Mauville NPC choice lists and field Match Call."""

import struct
from typing import TYPE_CHECKING, cast

from pokebench_env.daycare import daycare_display_name, read_daycare
from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.menus import (
    PALETTE_FADE,
    MenuValue,
    _ewram,
    _list_selection,
    _text_pointer,
    owner_details,
    task_snapshot,
)
from pokebench_env.native_text import decode_native_text

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

FIELD_CALLBACKS = {0x08085E5D, 0x08085FFD, 0x080860F5, 0x08085FCD}
DAYCARE = 0x08071205
TRADER = 0x08133C49
STORYTELLER = 0x081212FD
PORTHOLE = 0x080FB5E9
MATCH_CALL = 0x081960E1
STORIES = 0x0859F048  # 36 entries, stride 16, title pointer +4
PRINTERS = 0x020201B0  # stride 0x24, active +0x1B
SE_PLAYERS = (0x030075F0, 0x03007630)  # MusicPlayerInfo.status +4


def _native_name(raw: bytes, language: int) -> str:
    if language not in range(1, 8):
        raise ValueError("invalid NPC native-name language")
    return decode_native_text(raw + b"\xff", japanese=language == 1)


def _old_man(read: ReadMemory) -> bytes:
    pointer = int.from_bytes(read(0x03005D8C, 4), "little")
    if not _ewram(pointer, 0x2E28 + 64):
        raise ValueError("invalid Mauville old-man save owner")
    return read(pointer + 0x2E28, 64)


def _choice(read: ReadMemory, options: list[str]) -> tuple[str, int]:
    from pokebench_env.ui_state import read_menu

    menu = read_menu(read)
    if menu is None or menu.options != len(options):
        raise ValueError("NPC choice cursor/window does not match source options")
    return options[menu.selected - 1], menu.selected - 1


def _daycare_labels(read: ReadMemory, details: dict[str, MenuValue]) -> list[str]:
    save = int.from_bytes(read(0x03005D8C, 4), "little")
    entries = read_daycare(read, save)
    if [entry.slot for entry in entries] != [0, 1]:
        raise ValueError("daycare choice menu requires both saved Pokémon")
    options = []
    for entry in entries:
        mon = entry.pokemon
        prefix = "daycare_" + str(entry.slot)
        details.update(
            {
                prefix + "_identity": mon.identity,
                prefix + "_species": mon.species,
                prefix + "_species_id": mon.species_id,
                prefix + "_nickname": mon.nickname,
                prefix + "_language": mon.language,
                prefix + "_experience": mon.experience,
                prefix + "_move_ids": [move.move_id for move in mon.moves or ()],
                prefix + "_move_names": cast(
                    list[str | int | float | bool | None], [move.name for move in mon.moves or ()]
                ),
                prefix + "_move_pp": [move.pp for move in mon.moves or ()],
                prefix + "_held_item": mon.held_item,
                prefix + "_held_item_name": mon.held_item_name,
            }
        )
        if mon.diagnostic or mon.nickname_diagnostic:
            details.update(
                {
                    prefix + "_raw_hex": mon.raw_hex,
                    prefix + "_diagnostic": mon.diagnostic or mon.nickname_diagnostic,
                }
            )
        options.append(daycare_display_name(read, mon) + " Lv" + str(entry.displayed_level))
        details.update(
            {prefix + "_steps": entry.steps, prefix + "_displayed_level": entry.displayed_level}
        )
    return options


def read_field_people_menu(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn, decode_message

    if callback not in FIELD_CALLBACKS:
        return None
    owners = [
        t
        for t in task_snapshot(read)
        if t[1] in (DAYCARE, TRADER, STORYTELLER, MATCH_CALL, PORTHOLE)
    ]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "field_people_initializing"
    try:
        if len(owners) != 1:
            raise ValueError("multiple field NPC input owners")
        task, function, data = owners[0]
        details.update({"owner_task": task, "owner_function": function})
        selected, ready = None, False
        if function == DAYCARE:
            phase = "daycare_level_selection"
            selected, item_id, index = _list_selection(read, data[0])
            if item_id not in (0, 1, 2):
                raise ValueError("invalid daycare list item")
            raw = read(TASKS + 40 * data[0], 40)
            pointer = int.from_bytes(raw[8:12], "little")
            total = int.from_bytes(raw[20:22], "little")
            if total != 3:
                raise ValueError("daycare source list must contain two Pokémon and EXIT")
            options = []
            ids = []
            for i in range(total):
                label, identity = struct.unpack("<Ii", read(pointer + 8 * i, 8))
                options.append(_text_pointer(read, label))
                ids.append(identity)
            if ids != [0, 1, 2]:
                raise ValueError("daycare source list item order invalid")
            options = _daycare_labels(read, details) + [options[2]]
            selected = options[index]
            details.update(
                {
                    "options": options,
                    "option_ids": ids,
                    "selection_index": index,
                    "daycare_mon_index": item_id if item_id < 2 else None,
                    "window_id": data[1],
                    "list_task": data[0],
                }
            )
            ready = _window_drawn(read, data[1])
        elif function == TRADER:
            phase = "mauville_trader_decoration_selection"
            raw = _old_man(read)
            options = [
                _text_pointer(read, 0x085A5C09 + 32 * item)
                if item <= 120
                else _text_pointer(read, 0x085E8D38)
                for item in raw[1:5]
            ]
            options.append(_text_pointer(read, 0x085EB7EA))
            names = [_native_name(raw[5 + 11 * i : 16 + 11 * i], raw[50 + i]) for i in range(4)]
            selected, index = _choice(read, options)
            details.update(
                {
                    "options": options,
                    "selection_index": index,
                    "decoration_ids": list(raw[1:5]),
                    "previous_owner_names": names,
                    "previous_owner_languages": list(raw[50:54]),
                    "already_traded": bool(raw[49]),
                    "window_id": data[3],
                }
            )
            ready = _window_drawn(read, data[3])
        elif function == STORYTELLER:
            phase = "storyteller_story_selection"
            if data[0] not in (0, 1):
                raise ValueError("invalid storyteller input phase")
            details["initialization_state"] = data[0]
            raw = _old_man(read)
            count = next((i for i, stat in enumerate(raw[4:8]) if stat == 0), 4)
            table = read(STORIES, 36 * 16)
            options = []
            for stat in raw[4 : 4 + count]:
                row = next((i for i in range(36) if table[16 * i] == stat), 35)
                pointer = int.from_bytes(table[16 * row + 4 : 16 * row + 8], "little")
                options.append(_text_pointer(read, pointer))
            options.append(_text_pointer(read, 0x085EB7EA))
            details.update(
                {
                    "options": options,
                    "story_stat_ids": list(raw[4 : 4 + count]),
                    "story_trainer_names": [
                        _native_name(raw[8 + 7 * i : 15 + 7 * i], raw[52 + i]) for i in range(count)
                    ],
                    "story_trainer_languages": list(raw[52 : 52 + count]),
                    "recorded_stat_values": [
                        int.from_bytes(raw[36 + 4 * i : 40 + 4 * i], "little") for i in range(count)
                    ],
                    "already_recorded": bool(raw[1]),
                }
            )
            if data[0] == 1:
                selected, index = _choice(read, options)
                details["selection_index"] = index
                ready = True
        elif function == PORTHOLE:
            phase = "ss_tidal_porthole"
            if not 0 <= data[0] <= 3 or data[1] not in (0, 1):
                raise ValueError("invalid SS Tidal porthole phase/exit request")
            save = int.from_bytes(read(0x03005D8C, 4), "little")
            if not _ewram(save, 0x139C + 2 * 0xB4 + 2):
                raise ValueError("invalid SS Tidal porthole save owner")
            cruise = int.from_bytes(read(save + 0x139C + 2 * 0xB4, 2), "little")
            details.update(
                {
                    "porthole_state": data[0],
                    "exit_requested": bool(data[1]),
                    "cruise_state": cruise,
                    "map_number": read(save + 5, 1)[0],
                    "map_group": read(save + 4, 1)[0],
                }
            )
            ready = data[0] == 1 and not data[1]
            selected = "EXIT" if ready else None
        else:
            phase = "field_match_call"
            if not 0 <= data[0] <= 7:
                raise ValueError("invalid field Match Call phase")
            raw = read(0x0203CD80, 8)
            details.update(
                {
                    "call_state": data[0],
                    "window_id": data[2],
                    "trainer_id": int.from_bytes(raw[4:6], "little"),
                    "triggered_from_script": bool(raw[7]),
                    "step_counter": raw[6],
                    "elapsed_minutes": int.from_bytes(raw[:4], "little"),
                }
            )
            if data[0] in (4, 5):
                window = data[2]
                if not 0 <= window < 32 or not _window_drawn(read, window):
                    raise ValueError("field Match Call text window unavailable")
                printing = bool(read(PRINTERS + 0x24 * window + 0x1B, 1)[0])
                statuses = [int.from_bytes(read(p + 4, 4), "little") for p in SE_PLAYERS]
                sound = not (
                    all(s & 0x80000000 for s in statuses) or all(not s & 0xFFFF for s in statuses)
                )
                details.update(
                    {
                        "text_printing": printing,
                        "sound_playing": sound,
                        "sound_player_statuses": statuses,
                    }
                )
                if data[0] == 5:
                    details["message"] = decode_message(read(0x02021FC4, 1000))
                    ready = not printing and not sound
                    selected = "CONTINUE" if ready else None
            phase += "_message" if data[0] == 5 else "_transition"
        ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
        return ActiveUi(
            phase,
            selected,
            ready,
            "Directions select; A confirms; B closes or declines",
            details=details,
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase,
            None,
            None,
            "Native NPC menu unavailable",
            "harness bug: " + str(error),
            details=details,
        )
