"""Wireless link leader/group lobbies: task overlays own lists and confirmations."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import SCREENS, TASKS, ReadMemory
from pokebench_env.menus import MenuValue, _ewram, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi
LEADER_TASK = 0x08012781
GROUP_TASK = 0x080134E9
LINK_MAIN = 0x02022C30
RFU_STATUS = 0x030050F1
LEADER_STATES = frozenset(
    {0, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 29, 30}
)
GROUP_STATES = frozenset({0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 23})


def _players(read: ReadMemory, pointer: int, count: int) -> dict[str, MenuValue]:
    from pokebench_env.ui_state import decode_message

    if not _ewram(pointer, count * 32):
        raise ValueError("invalid wireless player list pointer")
    names: list[str] = []
    ids: list[int] = []
    activities: list[int] = []
    spawn: list[int] = []
    started: list[bool] = []
    for i in range(count):
        raw = read(pointer + i * 32, 32)
        state = raw[26] & 3
        name = decode_message(raw[16:24]).strip() if state == 1 else ""
        if state == 1 and not name:
            raise ValueError("active wireless player has empty name")
        names.append(name)
        ids.append(struct.unpack_from("<H", raw, 2)[0])
        activities.append(raw[10] & 127)
        spawn.append(state)
        started.append(bool(raw[10] & 128))
    return {
        "player_names": names,
        "player_trainer_ids": ids,
        "player_activities": activities,
        "player_spawn_states": spawn,
        "player_started_activities": started,
    }


def _cursor(read: ReadMemory, task: int) -> tuple[int, int]:
    from pokebench_env.ui_state import _window_drawn

    if task >= 16:
        raise ValueError("invalid wireless ListMenu task index")
    raw = read(TASKS + task * 40, 40)
    if raw[4] != 1 or struct.unpack_from("<I", raw)[0] != 0x081AE459:
        raise ValueError("wireless list is not owned by ListMenu task")
    total = struct.unpack_from("<H", raw, 20)[0]
    scroll, row = struct.unpack_from("<HH", raw, 32)
    index = scroll + row
    if not 1 <= total <= 16 or index >= total or not _window_drawn(read, raw[24]):
        raise ValueError("invalid or undrawn wireless list cursor")
    return index, total


def read_wireless_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, read_menu

    if callback not in SCREENS:
        return None
    tasks = task_snapshot(read)
    owners = [t for t in tasks if t[1] in (LEADER_TASK, GROUP_TASK)]
    if not owners:
        return None
    details = owner_details(read, callback)
    phase = "wireless_lobby_transition"
    try:
        if len(owners) != 1:
            raise ValueError("multiple wireless lobby owners")
        task, fn, _ = owners[0]
        leader = fn == LEADER_TASK
        pointer = struct.unpack("<I", read(LINK_MAIN, 4))[0]
        if pointer != TASKS + task * 40 + 8:
            raise ValueError("wireless link main does not point to active task data")
        raw = read(pointer, 32)
        state = raw[12 if leader else 8]
        text_state = raw[13 if leader else 9]
        if state not in (LEADER_STATES if leader else GROUP_STATES):
            raise ValueError("invalid wireless lobby state")
        status = read(RFU_STATUS, 1)[0]
        details.update(
            {
                "lobby_role": "LEADER" if leader else "JOIN GROUP",
                "lobby_state": state,
                "text_state": text_state,
                "rfu_status": status,
                "activity": read(0x02022C2C, 1)[0],
            }
        )
        selected = None
        ready = False
        controls = "Wireless communication or message in progress"
        phase = "wireless_leader_wait" if leader else "wireless_group_wait"
        confirmation_states = (11, 16, 20) if leader else (8,)
        if state in confirmation_states:
            phase = "wireless_leader_confirmation" if leader else "wireless_group_confirmation"
            if text_state == 1:
                menu = read_menu(read)
                if menu is None or menu.options != 2:
                    raise ValueError("invalid wireless YES/NO window")
                selected = ("YES", "NO")[menu.selected - 1]
                ready = not status if not leader else True
                details.update({"options": ["YES", "NO"], "selected_index": menu.selected - 1})
                controls = "UP/DOWN selects; A confirms; B declines"
            elif text_state != 0:
                raise ValueError("invalid wireless confirmation phase")
        if (
            leader and state in (4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 29, 30)
        ) or (not leader and state in (3, 5, 6, 7, 8, 9)):
            list_task = raw[18 if leader else 14]
            index, count = _cursor(read, list_task)
            player_pointer = struct.unpack_from("<I", raw)[0]
            details.update(_players(read, player_pointer, count))
            details.update({"list_count": count, "list_selected_index": index})
            names = details["player_names"]
            if not isinstance(names, list):
                raise ValueError("invalid wireless name list")
            if not leader and state == 3:
                phase = "wireless_choose_group"
                selected = str(names[index]) or f"EMPTY SLOT {index + 1}"
                ready = True
                details.update(
                    {
                        "selected_index": index,
                        "selected_available": bool(names[index])
                        and not bool(read(player_pointer + index * 32 + 10, 1)[0] & 128),
                    }
                )
                controls = (
                    "UP/DOWN selects leader; A requests joining an available group; B cancels"
                )
            elif leader and state == 6:
                phase = "wireless_leader_wait"
                selected = "WAIT FOR PLAYERS"
                ready = True
                details["player_count"] = raw[19]
                details["group_capacity"] = read(0x02022C2D, 1)[0]
                controls = "B cancels; START requests confirmation when the group is ready"
            elif not leader and state == 6:
                selected = "WAIT FOR GROUP"
                ready = status == 0
                controls = "B asks to leave when communication status is OK"
        if read(0x02037FDB, 1)[0] & 128:
            ready = False
        return ActiveUi(phase, selected, ready, controls, details=details)
    except (ValueError, IndexError, struct.error) as error:
        return ActiveUi(
            phase, None, None, "Wireless lobby observation unavailable", str(error), details=details
        )
