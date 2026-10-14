"""Game Corner input owners, qualified against US-ROM assembly."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import _ewram, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi
SLOTS_CALLBACK = 0x0812A671
SLOTS_POINTER = 0x0203AB34
SLOTS_TASK = 0x0812AAC9
SLOTS_INFO_TASK = 0x0812DCD5
ROULETTE_CALLBACK = 0x08140239
ROULETTE_POINTER = 0x0203AB88
ROULETTE_INPUT = 0x08141041
ROULETTE_WAIT = 0x08141EF9
ROULETTE_OWNERS = frozenset(
    {
        0x081408A9,
        0x08140969,
        0x08140995,
        0x08140B8D,
        0x08140BD1,
        0x08140F6D,
        0x08140FC5,
        ROULETTE_INPUT,
        0x081410FD,
        0x0814118D,
        0x08141345,
        0x0814155D,
        0x081415D5,
        0x081416D5,
        0x08141779,
        0x08141801,
        0x0814189D,
        0x08141985,
        0x08141A19,
        0x08141AC1,
        0x08141B59,
        0x08141DE5,
        0x08141E7D,
        ROULETTE_WAIT,
        0x08121FDD,
    }
)
POKEMON_COLUMNS = ("WYNAUT", "AZURILL", "SKITTY", "MAKUHITA")
GRID_OPTIONS = (
    "NONE",
    *[f"COLUMN {n}" for n in POKEMON_COLUMNS],
    "ROW ORANGE",
    *[f"ORANGE {n}" for n in POKEMON_COLUMNS],
    "ROW GREEN",
    *[f"GREEN {n}" for n in POKEMON_COLUMNS],
    "ROW PURPLE",
    *[f"PURPLE {n}" for n in POKEMON_COLUMNS],
)


def read_corner_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn, decode_message, read_menu

    if callback not in (SLOTS_CALLBACK, ROULETTE_CALLBACK):
        return None
    details = owner_details(read, callback)
    phase = "slots_transition" if callback == SLOTS_CALLBACK else "roulette_transition"
    try:
        fading = bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
        tasks = task_snapshot(read)
        selected = None
        ready = False
        controls = "Game animation in progress; wait for its input owner"
        if callback == SLOTS_CALLBACK:
            owners = [t for t in tasks if t[1] == SLOTS_TASK]
            if len(owners) != 1:
                raise ValueError("missing or ambiguous slot-machine task")
            pointer = struct.unpack("<I", read(SLOTS_POINTER, 4))[0]
            if not _ewram(pointer, 0x68):
                raise ValueError("invalid slot-machine heap pointer")
            raw = read(pointer, 0x68)
            state, machine = raw[:2]
            coins, payout, loss, bet = struct.unpack_from("<4h", raw, 0xC)
            reel = struct.unpack_from("<h", raw, 0x18)[0]
            positions = list(struct.unpack_from("<3h", raw, 0x28))
            if state > 28 or machine > 5 or not 0 <= coins <= 9999 or not 0 <= bet <= 3:
                raise ValueError("invalid slot-machine phase/machine/coins/bet")
            if not 0 <= payout <= 9999 or not 0 <= loss <= 9999 or not 0 <= reel <= 3:
                raise ValueError("invalid slot-machine payout/reel")
            if any(not 0 <= p < 21 for p in positions):
                raise ValueError("invalid slot-machine reel position")
            details.update(
                {
                    "machine_id": machine,
                    "state": state,
                    "coins": coins,
                    "payout": payout,
                    "bet": bet,
                    "current_reel": reel,
                    "reel_positions": positions,
                    "matches": struct.unpack_from("<H", raw, 8)[0],
                }
            )
            if state == 5:
                phase, selected, ready = "slots_bet", f"BET {bet}", True
                controls = (
                    "DOWN adds one coin; R bets three; A spins; SELECT opens help; B asks to quit"
                )
            elif state == 12:
                if reel > 2:
                    raise ValueError("slot stop-input owner has invalid current reel")
                phase, selected, ready = "slots_stop_reel", ("LEFT", "MIDDLE", "RIGHT")[reel], True
                controls = "A stops the selected reel"
            elif state == 22:
                phase = "slots_quit_confirmation"
                menu = read_menu(read)
                if menu is None or menu.options != 2:
                    raise ValueError("invalid slot-machine quit menu")
                details.update({"options": ["YES", "NO"], "selected_index": menu.selected - 1})
                selected, ready = ("YES", "NO")[menu.selected - 1], True
                controls = "UP/DOWN selects; A confirms; B resumes playing"
            elif state == 8:
                phase = "slots_help"
                info = [t for t in tasks if t[1] == SLOTS_INFO_TASK]
                if len(info) != 1 or not 0 <= info[0][2][0] <= 14:
                    raise ValueError("invalid slot-machine help owner")
                details["help_state"] = info[0][2][0]
                ready = info[0][2][0] == 6
                if ready and not _window_drawn(read, 1):
                    raise ValueError("slot-machine help window is not drawn")
                if ready:
                    details["message"] = decode_message(read(0x085EF750, 1024))
                selected = "REEL TIME HELP" if ready else None
                controls = "B or SELECT closes help" if ready else controls
            elif state in (7, 24, 26):
                phase, selected, ready = (
                    "slots_message",
                    {7: "NEED THREE COINS", 24: "MAXIMUM COINS", 26: "NO MORE COINS"}[state],
                    True,
                )
                controls = "A or B acknowledges the message"
        else:
            pointer = struct.unpack("<I", read(ROULETTE_POINTER, 4))[0]
            if not _ewram(pointer, 0x3980):
                raise ValueError("invalid roulette heap pointer")
            raw = read(pointer, 0xB8)
            owners = [t for t in tasks if t[0] == raw[0xA4]]
            if len(owners) != 1 or owners[0][1] not in ROULETTE_OWNERS:
                raise ValueError("unmapped roulette play-task owner")
            _, function, data = owners[0]
            selection, coins, ball = data[4], data[13], data[6]
            min_bet = raw[0x19]
            if (
                not 0 <= selection < len(GRID_OPTIONS)
                or not 0 <= coins <= 9999
                or not 0 <= ball <= 6
            ):
                raise ValueError("invalid roulette selection/coins/ball count")
            if (raw[4] & 3) > 1 or min_bet != (1, 3, 1, 6)[(raw[4] & 3) + 2 * bool(raw[4] & 0x80)]:
                raise ValueError("invalid roulette table/minimum bet")
            flags = struct.unpack_from("<I", raw, 8)[0]
            details.update(
                {
                    "table_id": raw[4] & 3,
                    "special_rate": bool(raw[4] & 0x80),
                    "minimum_bet": min_bet,
                    "coins": coins,
                    "ball_number": ball,
                    "grid_selection": selection,
                    "hit_flags": flags,
                    "winning_square": data[12],
                    "multiplier": data[2],
                }
            )
            if function == ROULETTE_INPUT:
                if selection == 0:
                    raise ValueError("roulette bet input selected NONE")
                # ROM GridSelection is twenty bytes: exact source flag at +8.
                option_flags = [
                    struct.unpack("<I", read(0x085B6154 + i * 20 + 8, 4))[0] for i in range(1, 20)
                ]
                details.update(
                    {
                        "options": list(GRID_OPTIONS[1:]),
                        "unavailable_selections": [
                            i for i, mask in enumerate(option_flags, 1) if flags & mask
                        ],
                        "selected_available": not bool(flags & option_flags[selection - 1]),
                    }
                )
                selected, ready, phase = GRID_OPTIONS[selection], True, "roulette_bet"
                controls = "Directions select column/row/square; A places bet if available"
            elif function == ROULETTE_WAIT:
                delay, keys, continuation = struct.unpack_from("<HHI", raw, 0xA8)
                if not 0x08000001 <= continuation < 0x0A000000 or not continuation & 1:
                    raise ValueError("invalid roulette continuation callback")
                details.update(
                    {
                        "wait_keys": keys,
                        "delay_frames": delay,
                        "continuation_callback": f"0x{continuation:08X}",
                    }
                )
                phase, ready = "roulette_continue", bool(keys)
                selected = "CONTINUE" if ready else None
                controls = (
                    "A or B continues"
                    if keys == 3
                    else "Wait or use recorded game-owned continue keys"
                )
        return ActiveUi(phase, selected, ready and not fading, controls, details=details)
    except (ValueError, IndexError, struct.error) as error:
        return ActiveUi(
            phase, None, None, "Game Corner observation unavailable", str(error), details=details
        )
