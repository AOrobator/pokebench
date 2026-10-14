"""Source/ROM-owned Battle Dome tournament and information-card interfaces."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.battle_choices import exact, number
from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import decode_text
from pokebench_env.menus import PALETTE_FADE, MenuValue, owner_details, task_snapshot
from pokebench_env.pokemon import SPECIES_NAMES

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

DOME_CALLBACK = 0x08194B55
DOME_TREE_INPUT = 0x0819395D
DOME_INFO_INPUT = 0x08190CD5
DOME_RESULTS_INPUT = 0x08194951
DOME_TREE_INIT = 0x08194221
DOME_INFO_INIT = 0x08190401
DOME_INFO_HEAP = 0x0203CD78
FACILITY_MONS_POINTER = 0x0203BC8C
FRONTIER_MONS = 0x085D97BC
TREE_TRAINER_IDS = 0x0860D080
EXPECTED_TREE_IDS = bytes([0, 8, 12, 4, 7, 15, 11, 3, 2, 10, 14, 6, 5, 13, 9, 1])


# Exact ROM script PCs immediately after WAITBUTTONPRESS. Each script calls
# CallFrontierUtilFunc(showResults), then RemoveRecordsWindow after the wait.
RECORDS_SCRIPTS = {
    0x0823EFDB: (0, 0),
    0x0823EFF4: (0, 1),
    0x0823F00D: (0, 2),
    0x0823F026: (0, 3),
    0x08249D66: (1, 0),
    0x08249D7F: (1, 1),
    0x0824DC64: (2, 0),
    0x0824DC7D: (2, 1),
    0x082560A1: (3, None),
    0x082587F5: (4, 0),
    0x0825880E: (4, 1),
    0x0825BA8F: (5, None),
    0x08250D51: (6, None),
    0x0821A793: (7, None),
}


def _records(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    if callback != 0x08085E5D:
        return None
    pc = number(read, 0x03000E48)
    owner = RECORDS_SCRIPTS.get(pc)
    if owner is None:
        return None
    details = owner_details(read, callback)
    details["script_pc"] = pc
    try:
        facility, mode = owner
        prefix = b"\x16\x04\x80\x07\0\x16\x05\x80" + struct.pack("<H", facility)
        if mode is not None:
            prefix += b"\x16\x06\x80" + struct.pack("<H", mode)
        prefix += b"\x25\xea\0\x6d"
        if exact(read, pc - len(prefix), len(prefix) + 3) != prefix + b"\x25\x0c\x02":
            raise ValueError("Frontier records script ROM mismatch")
        if (
            number(read, 0x03000E41, 1) != 2
            or number(read, 0x03000E44) != 0x0809AC99
            or number(read, 0x03000E38, 1) != 0
        ):
            raise ValueError("Frontier records wait has invalid native controller")
        if (
            number(read, 0x020375E0, 2) != 7
            or number(read, 0x020375E2, 2) != facility
            or (mode is not None and number(read, 0x020375E4, 2) != mode)
        ):
            raise ValueError("Frontier records facility/mode source mismatch")
        window = number(read, 0x0203AB74, 1)
        if window >= 32 or not _window_drawn(read, window):
            raise ValueError("Frontier records window is not drawn")
        save = number(read, 0x03005D90)
        if save % 4 or not 0x02000000 <= save <= 0x02040000 - 0xF2C:
            raise ValueError("invalid Frontier records SaveBlock2")
        names = ("TOWER", "DOME", "PALACE", "ARENA", "FACTORY", "PIKE", "PYRAMID", "LINK CONTEST")
        details.update({"facility": names[facility], "battle_mode": mode, "records_window": window})
        if facility == 7:
            details["contest_category_order"] = ["COOL", "BEAUTY", "CUTE", "SMART", "TOUGH"]
            details["contest_place_order"] = [1, 2, 3, 4]
            details["contest_link_results"] = list(
                struct.unpack("<20H", exact(read, save + 0x624, 40))
            )
        else:
            offsets = (
                (0xCE0, 0xCF0, None),
                (0xD0C, 0xD14, 0xD1C),
                (0xDC8, 0xDD0, None),
                (0xDDA, 0xDDE, None),
                (0xDE2, 0xDEA, None),
                (0xE04, 0xE08, 0xE0C),
                (0xE1A, 0xE1E, None),
            )
            current, record, total = offsets[facility]
            offset = (mode or 0) * 4
            details["level_modes"] = ["LEVEL 50", "OPEN LEVEL"]
            raw_current = list(struct.unpack("<2H", exact(read, save + current + offset, 4)))
            raw_record = list(struct.unpack("<2H", exact(read, save + record + offset, 4)))
            details["native_current_streaks"] = raw_current
            details["displayed_current_streaks"] = [min(value, 9999) for value in raw_current]
            details["native_record_streaks"] = raw_record
            active = number(read, save + 0xCDC)
            base = (
                (0, 14, 16, 18)[mode or 0]
                if facility == 0
                else (2 if not mode else 20)
                if facility == 1
                else (4 if not mode else 22)
                if facility == 2
                else 6
                if facility == 3
                else (8 if not mode else 24)
                if facility == 4
                else 10
                if facility == 5
                else 12
            )
            details["streak_labels"] = [
                "CURRENT" if active & (1 << (base + level)) else "PREVIOUS" for level in range(2)
            ]
            if total is not None:
                details["total_cleared"] = list(
                    struct.unpack("<2H", exact(read, save + total + offset, 4))
                )
            if facility == 4:
                details["rental_swap_counts"] = list(
                    struct.unpack("<2H", exact(read, save + 0xDF2 + offset, 4))
                )
                details["record_rental_swap_counts"] = list(
                    struct.unpack("<2H", exact(read, save + 0xDFA + offset, 4))
                )
        return ActiveUi(
            "frontier_records", None, True, "A or B closes the results window", details=details
        )
    except (ValueError, OSError, IndexError, struct.error) as error:
        return ActiveUi(
            "frontier_records",
            None,
            None,
            "Records observation unavailable",
            diagnostic=f"harness bug: {error}",
            details=details,
        )


def _replay_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    if callback == 0x08038421 and number(read, 0x02022FEC) & (1 << 24):
        details = owner_details(read, callback)
        finished = number(read, 0x0203CCD0, 1)
        if finished not in (0, 1):
            return ActiveUi(
                "frontier_battle_replay",
                None,
                None,
                "Playback observation unavailable",
                diagnostic="harness bug: invalid recorded-battle completion state",
                details=details,
            )
        details.update({"playback_finished": bool(finished), "stoppable": finished == 0})
        return ActiveUi(
            "frontier_battle_replay",
            None,
            finished == 0,
            "Hold B to stop playback while this screen is active",
            details=details,
        )
    if callback != 0x0803937D:
        return None
    details = owner_details(read, callback)
    state, cursor = exact(read, 0x02024332, 2)
    details.update({"recording_state": state, "yes_no_cursor": cursor})
    try:
        if state > 12 or (state == 5 and cursor > 1):
            raise ValueError("invalid battle recording confirmation state/cursor")
        ready = state == 5 and not bool(number(read, PALETTE_FADE + 7, 1) & 0x80)
        if ready and not _window_drawn(read, 12):
            raise ValueError("battle recording confirmation window is not drawn")
        if state in (4, 5):
            message = decode_text(exact(read, 0x085CD28F, 160))
            if not message or "?" in message[:-1]:
                raise ValueError("invalid battle recording question ROM text")
            details["message"] = message
        phase = (
            "frontier_record_confirmation"
            if state == 5
            else "frontier_record_saving"
            if state in (10, 11, 12)
            else "frontier_record_transition"
        )
        return ActiveUi(
            phase,
            ("YES", "NO")[cursor] if ready else None,
            ready,
            "Directions choose; A confirms; B declines"
            if ready
            else "Battle recording interface is progressing",
            details=details,
        )
    except (ValueError, OSError, IndexError) as error:
        return ActiveUi(
            "frontier_record_confirmation",
            None,
            None,
            "Recording observation unavailable",
            diagnostic=f"harness bug: {error}",
            details=details,
        )


def _species(read: ReadMemory, species: int) -> str:
    if not 1 <= species <= 411:
        raise ValueError("invalid Dome Pokémon species")
    name = decode_text(exact(read, SPECIES_NAMES + species * 11, 11))
    if not name or "?" in name:
        raise ValueError("invalid Dome Pokémon species table")
    return name


def _content(read: ReadMemory, details: dict[str, MenuValue]) -> None:
    save = number(read, 0x03005D90)
    if save % 4 or not 0x02000000 <= save <= 0x02040000 - 0xF2C:
        raise ValueError("invalid Dome SaveBlock2 pointer")
    trainers = exact(read, save + 0xD24, 64)
    words = tuple(struct.unpack_from("<H", trainers, index * 4)[0] for index in range(16))
    ids = [word & 0x3FF for word in words]
    mons = struct.unpack("<48H", exact(read, save + 0xD64, 96))
    table = number(read, FACILITY_MONS_POINTER)
    # Dome uses Frontier mons, not the alternate Slateport Tent dataset.
    if table != FRONTIER_MONS:
        raise ValueError("Dome facility Pokémon table owner mismatch")
    species_ids = []
    names = []
    for index, mon in enumerate(mons):
        if ids[index // 3] in (1022, 1023):
            species = mon
        else:
            if mon >= 882:
                raise ValueError("invalid Dome facility Pokémon index")
            species = number(read, table + mon * 16, 2)
        species_ids.append(species)
        names.append(_species(read, species))
    round_id = number(read, save + 0xCB2, 2)
    if round_id > 4:
        raise ValueError("invalid Dome tournament round")
    details.update(
        {
            "tournament_round": round_id,
            "trainer_ids": ids,
            "trainer_native_words": list(words),
            "team_mon_ids": list(mons),
            "team_species_ids": species_ids,
            "team_species": names,
        }
    )


def read_frontier_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    replay = _replay_ui(read, callback)
    if replay is not None:
        return replay
    records = _records(read, callback)
    if records is not None:
        return records
    if callback != DOME_CALLBACK:
        return None
    details = owner_details(read, callback)
    tasks = task_snapshot(read)
    owned = [
        task for task in tasks if task[1] in (DOME_TREE_INPUT, DOME_INFO_INPUT, DOME_RESULTS_INPUT)
    ]
    phase = "frontier_dome"
    try:
        if not owned:
            initial = [task for task in tasks if task[1] in (DOME_TREE_INIT, DOME_INFO_INIT)]
            if len(initial) != 1:
                raise ValueError("Dome has no unique verified input or initialization owner")
            details.update({"owner_task": initial[0][0], "initialization_state": initial[0][2][0]})
            return ActiveUi(
                "frontier_dome_transition",
                None,
                False,
                "Tournament interface is initializing",
                details=details,
            )
        # A dormant tree controller remains alive behind an info card.
        infos = [task for task in owned if task[1] == DOME_INFO_INPUT]
        if len(infos) == 1:
            task_id, owner, data = infos[0]
        elif len(owned) == 1:
            task_id, owner, data = owned[0]
        else:
            raise ValueError("Dome has ambiguous input owners")
        state = data[0]
        details.update({"owner_task": task_id, "controller_state": state})
        fading = bool(number(read, PALETTE_FADE + 7, 1) & 0x80)
        selected = None
        if owner == DOME_TREE_INPUT:
            phase = "frontier_dome_bracket"
            if state not in (0, 1, 2, 3, 5, 7) or not 0 <= data[1] <= 31:
                raise ValueError("invalid Dome tournament cursor/state")
            cursor = data[1]
            details["cursor"] = cursor
            if exact(read, TREE_TRAINER_IDS, 16) != EXPECTED_TREE_IDS:
                raise ValueError("Dome tournament trainer-order table mismatch")
            if cursor < 16:
                trainer = EXPECTED_TREE_IDS[cursor]
                selected = f"TRAINER {trainer + 1}"
                details["tournament_trainer_id"] = trainer
            elif cursor < 31:
                selected = f"MATCH {cursor - 15}"
                details["match_id"] = cursor - 16
            else:
                selected = "CLOSE"
            ready = state == 2 and not fading
            controls = "Directions choose trainer/match; A views card; B closes"
        elif owner == DOME_INFO_INPUT:
            phase = "frontier_dome_info_card"
            if not 0 <= state <= 8 or data[3] not in (0, 1, 2) or not 0 <= data[4] < 16:
                raise ValueError("invalid Dome info-card mode/state/parent task")
            pointer = number(read, DOME_INFO_HEAP)
            if pointer % 4 or not 0x02000000 <= pointer <= 0x02040000 - 20:
                raise ValueError("invalid Dome info-card heap")
            body = exact(read, pointer, 20)
            position = body[16]
            if position > 4:
                raise ValueError("invalid Dome information-card page")
            details.update(
                {
                    "card_mode": ("next_opponent", "trainer", "match")[data[3]],
                    "card_position": position,
                    "alternate_slot": data[2],
                    "parent_task": data[4],
                    "native_card_hex": body.hex(),
                }
            )
            selected = ("NEXT OPPONENT", "TRAINER INFORMATION", "MATCH INFORMATION")[data[3]]
            ready = state == 2 and not fading
            controls = "A or B returns; directions browse when this card permits scrolling"
        else:
            phase = "frontier_dome_results"
            if not 0 <= state <= 4:
                raise ValueError("invalid Dome results controller state")
            details["delay_frames"] = data[3]
            ready = state == 3 and not fading
            controls = "A or B closes the tournament results"
        if ready:
            _content(read, details)
        return ActiveUi(phase, selected, ready, controls, details=details)
    except (ValueError, OSError, IndexError, struct.error) as error:
        return ActiveUi(
            phase,
            None,
            None,
            "Tournament observation unavailable",
            diagnostic=f"harness bug: {error}",
            details=details,
        )
