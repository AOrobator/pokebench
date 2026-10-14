"""Mandatory Apprentice answers, native menu contents and message owners."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.battle_choices import exact, number
from pokebench_env.game_screen import ReadMemory
from pokebench_env.gba_text import decode_text
from pokebench_env.menus import owner_details, task_snapshot
from pokebench_env.pokemon import MOVE_NAMES, SPECIES_NAMES

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

ANSWER_TASK = 0x081A070D
PRINTING_TASK = 0x081A0A35
ACK_TASK = 0x081A16DD
QUESTION_POINTER = 0x030062F0
APPRENTICE_SPECIES_TABLE = 0x086109A4
MENU = 0x0203CD90


def _label(read: ReadMemory, base: int, stride: int, value: int, maximum: int) -> str:
    if not 1 <= value <= maximum:
        raise ValueError("invalid Apprentice Pokémon species or move ID")
    label = decode_text(exact(read, base + value * stride, stride))
    if not label or "?" in label:
        raise ValueError("invalid Apprentice species/move name")
    return label


def _rom_label(read: ReadMemory, pointer: int) -> str:
    label = decode_text(exact(read, pointer, 32))
    if not label or "?" in label:
        raise ValueError("invalid Apprentice option ROM text")
    return label


def read_apprentice_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, read_menu

    if callback != 0x08085E5D:
        return None
    tasks = [
        task for task in task_snapshot(read) if task[1] in (ANSWER_TASK, PRINTING_TASK, ACK_TASK)
    ]
    if not tasks:
        return None
    details = owner_details(read, callback)
    try:
        if len(tasks) != 1:
            raise ValueError("Apprentice has ambiguous native input owners")
        task_id, owner, data = tasks[0]
        details["owner_task"] = task_id
        if owner == PRINTING_TASK:
            return ActiveUi(
                "apprentice_message_printing",
                None,
                False,
                "A or B speeds text; answer input is not active yet",
                details=details,
            )
        if owner == ACK_TASK:
            continuation = (data[0] & 0xFFFF) | ((data[1] & 0xFFFF) << 16)
            if continuation < 0x08000001 or continuation >= 0x0A000000 or not continuation & 1:
                raise ValueError("invalid Apprentice message continuation")
            details["continuation_callback"] = f"0x{continuation:08X}"
            return ActiveUi(
                "apprentice_message_wait",
                None,
                True,
                "A or B continues the Apprentice message",
                details=details,
            )
        mode = number(read, 0x020375E2, 1)
        if mode not in (0, 1, 2, 3, 4, 6):
            raise ValueError("invalid Apprentice answer menu type")
        save = number(read, 0x03005D90)
        if save % 4 or not 0x02000000 <= save <= 0x02040000 - 0xF2C:
            raise ValueError("invalid Apprentice SaveBlock2 pointer")
        body = exact(read, save + 0xB0, 8)
        apprentice, answered = body[0], (body[1] >> 2) & 0xF
        if apprentice >= 16 or answered > 11:
            raise ValueError("invalid native Apprentice identity/progress")
        details.update(
            {"apprentice_id": apprentice, "questions_answered": answered, "menu_type": mode}
        )
        if mode == 0:
            labels = [_rom_label(read, 0x085EAEB1), _rom_label(read, 0x085EAEB8)]
        elif mode == 1:
            species = []
            for index in range(3):
                table_id = (body[4 + index] >> (((body[2] >> index) & 1) * 4)) & 0xF
                if table_id >= 10:
                    raise ValueError("invalid Apprentice species-table index")
                species.append(
                    number(read, APPRENTICE_SPECIES_TABLE + apprentice * 88 + 2 * table_id, 2)
                )
            labels = [_label(read, SPECIES_NAMES, 11, species_id, 411) for species_id in species]
            details["species_ids"] = species
        elif mode in (2, 3):
            pointer = number(read, QUESTION_POINTER)
            if pointer % 4 or not 0x02000000 <= pointer <= 0x02040000 - 8:
                raise ValueError("invalid Apprentice native question pointer")
            species, alternate, move1, move2 = struct.unpack("<4H", exact(read, pointer, 8))
            if mode == 2:
                if answered >= 3:
                    raise ValueError(
                        "two-species Apprentice question no longer belongs to this stage"
                    )
                labels = [
                    _label(read, SPECIES_NAMES, 11, value, 411) for value in (species, alternate)
                ]
                details["species_ids"] = [species, alternate]
            else:
                labels = [_label(read, MOVE_NAMES, 13, value, 354) for value in (move1, move2)]
                details["move_ids"] = [move1, move2]
                details["subject_species_id"] = species
                details["subject_species"] = _label(read, SPECIES_NAMES, 11, species, 411)
        elif mode == 4:
            labels = [_rom_label(read, 0x085ED193), _rom_label(read, 0x085ED198)]
        else:
            labels = [_rom_label(read, 0x085EAE62), _rom_label(read, 0x085EAE66)]
        menu = read_menu(read)
        if (
            data[4] != 1
            or data[5] != 0
            or menu is None
            or menu.options != len(labels)
            or number(read, MENU + 5, 1) != data[6]
        ):
            raise ValueError("Apprentice menu cursor/window/mandatory-answer ownership mismatch")
        details.update(
            {
                "options": labels,
                "selected_index": menu.selected - 1,
                "mandatory_answer": True,
                "b_cancels": False,
                "window_id": data[6],
            }
        )
        return ActiveUi(
            "apprentice_answer",
            labels[menu.selected - 1],
            True,
            "Up/down chooses; A answers; B is ignored because an answer is required",
            details=details,
        )
    except (ValueError, OSError, IndexError, struct.error) as error:
        return ActiveUi(
            "apprentice_answer",
            None,
            None,
            "Apprentice observation unavailable",
            diagnostic=f"harness bug: {error}",
            details=details,
        )
