"""Custom field scroll lists, Pokémon pictures and native records interfaces.

Source field_specials.c, script_menu.c, battle_records.c, trainer_hill.c; numeric
owners in earliest named C / ROM-matching historical ASM. Never infer ownership
from a generic list window, which unrelated field scripts also share.
"""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.menus import _list_selection, _text_pointer, owner_details, task_snapshot
from pokebench_env.native_text import decode_native_text
from pokebench_env.pokemon import SPECIES_NAMES

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

SCROLL_TASKS = {0x0813A2DD, 0x0813A4ED, 0x0813A601, 0x0813A665}
SCROLL_FAMILIES = [
    "NONE",
    "GLASS WORKSHOP",
    "FAN CLUB RATER",
    "DECOR VENDOR 1",
    "DECOR VENDOR 2",
    "VITAMIN VENDOR",
    "HELD ITEM VENDOR",
    "BERRY POWDER VENDOR",
    "FRONTIER RECEPTION",
    "MOVE TUTOR 1",
    "MOVE TUTOR 2",
    "SS TIDAL DESTINATION",
    "BATTLE TENT RULES",
]
LINK_RECORDS_PC = 0x0827736F


def read_field_widget_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi, _window_drawn

    field = callback in (0x08085E5D, 0x08085FCD, 0x08085FFD)
    if not field and callback not in (0x0813C8ED, 0x0813C91D):
        return None
    tasks = task_snapshot(read)
    scroll = [t for t in tasks if t[1] in SCROLL_TASKS] if field else []
    pictures = [t for t in tasks if t[1] == 0x080E2899] if field else []
    pc = struct.unpack("<I", read(0x03000E48, 4))[0] if field else 0
    if not scroll and not pictures and pc != LINK_RECORDS_PC and field:
        return None
    details = owner_details(read, callback)
    phase = "field_widget_transition"
    try:
        if scroll:
            if len(scroll) != 1:
                raise ValueError("multiple scroll-list owners")
            _, function, data = scroll[0]
            phase = "field_scrollable_multichoice"
            family = data[11]
            if family not in range(13):
                raise ValueError("invalid source scroll-menu family")
            details["menu_family"] = SCROLL_FAMILIES[family]
            if function != 0x0813A4ED:
                return ActiveUi(
                    phase + "_transition", None, False, "Scrollable list handoff", details=details
                )
            selected, item_id, index = _list_selection(read, data[14])
            list_data = read(TASKS + data[14] * 40, 40)
            items = struct.unpack_from("<I", list_data, 8)[0]
            total = struct.unpack_from("<H", list_data, 20)[0]
            if total != data[1] or not 1 <= total <= 16 or item_id != index:
                raise ValueError("custom scroll-list length/row ID mismatch")
            options = []
            for row in range(total):
                pointer, native_id = struct.unpack("<Ii", read(items + row * 8, 8))
                expected = struct.unpack("<I", read(0x085B2CF0 + (family * 16 + row) * 4, 4))[0]
                if pointer != expected or native_id != row:
                    raise ValueError("custom scroll-list contents differ from source ROM owner")
                options.append(_text_pointer(read, pointer))
            details.update(options=options, selected_index=index, selected_id=item_id)
            return ActiveUi(
                phase, selected, True, "Directions select; A chooses; B cancels", details=details
            )
        if pictures:
            if len(pictures) != 1:
                raise ValueError("multiple field Pokémon picture owners")
            data = pictures[0][2]
            species = data[1]
            if (
                data[0] not in range(4)
                or (not 1 <= species <= 411 or 252 <= species <= 276)
                or not 0 <= data[2] < 64
            ):
                raise ValueError("invalid field Pokémon picture state/species/sprite")
            species_name = _text_pointer(read, SPECIES_NAMES + species * 11)
            if not species_name or "?" in species_name:
                raise ValueError("invalid field Pokémon picture species-name ROM text")
            details.update(
                species_id=species,
                species=species_name,
                picture_state=data[0],
            )
            if data[0] in (0, 1) and not _window_drawn(read, data[5]):
                raise ValueError("field Pokémon picture window is not drawn")
            # The pic task has no button handler; the separate script/dialogue
            # owns any continuation. Do not invent A-input from its visible art.
            return ActiveUi(
                "field_pokemon_picture",
                None,
                False,
                "Script-owned Pokémon picture",
                details=details,
            )
        save = struct.unpack("<I", read(0x03005D8C, 4))[0]
        if not 0x02000000 <= save <= 0x02040000 - 0x3B58 or save % 4:
            raise ValueError("records SaveBlock1 pointer invalid")
        if not field:
            phase = "trainer_hill_records"
            if callback == 0x0813C91D:
                return ActiveUi(
                    phase + "_transition", None, False, "Records initializing", details=details
                )
            owners = [t for t in tasks if t[1] in (0x0813C5BD, 0x0813C5ED, 0x0813C62D, 0x0813C665)]
            if len(owners) != 1:
                raise ValueError("no unique Trainer Hill records owner")
            values = list(struct.unpack("<4I", read(save + 0x3718, 16)))
            if any(v > 215999 for v in values):
                raise ValueError("Trainer Hill record timer outside native bounds")
            details.update(
                mode_order=["NORMAL", "VARIETY", "UNIQUE", "EXPERT"],
                record_frames=values,
                record_times=[
                    f"{v // 3600}:{(v // 60) % 60:02}.{((v % 60) * 168) // 100:02}" for v in values
                ],
            )
            ready = owners[0][1] == 0x0813C5ED
            if ready and not _window_drawn(read, 0):
                raise ValueError("Trainer Hill input has no drawn records window")
            return ActiveUi(
                phase,
                "A OR B: CLOSE" if ready else None,
                ready,
                "Trainer Hill records",
                details=details,
            )
        phase = "link_battle_records"
        if read(pc - 4, 7) != b"\x25\xc7\0\x6d\x25\x0c\x02":
            raise ValueError("Link Battle records script ROM mismatch")
        if (
            read(0x03000E41, 1) != b"\2"
            or struct.unpack("<I", read(0x03000E44, 4))[0] != 0x0809AC99
            or read(0x03000E38, 1) != b"\0"
        ):
            raise ValueError("Link Battle records wait owner invalid")
        window = read(0x0203AB74, 1)[0]
        if not _window_drawn(read, window):
            raise ValueError("Link Battle records window is not drawn")
        block = read(save + 0x3150, 86)
        rows = []
        for index in range(5):
            record = block[index * 16 : (index + 1) * 16]
            trainer_id, wins, losses, draws = struct.unpack_from("<4H", record, 8)
            language = block[80 + index]
            if wins + losses + draws and language not in (1, 2, 3, 4, 5, 7):
                raise ValueError("Link Battle record has invalid native language")
            name = (
                "-------"
                if not wins + losses + draws
                else decode_native_text(
                    record[:7] + b"\xff", japanese=language == 1, require_terminator=True
                )
            )
            rows.append(f"{name} (ID {trainer_id}): {wins} wins, {losses} losses, {draws} draws")
        save2 = struct.unpack("<I", read(0x03005D90, 4))[0]
        if not 0x02000000 <= save2 <= 0x02040000 - 0xB0 or save2 % 4:
            raise ValueError("Link Battle records SaveBlock2 pointer invalid")
        key = struct.unpack("<I", read(save2 + 0xAC, 4))[0]
        totals = [
            struct.unpack("<I", read(save + 0x159C + i * 4, 4))[0] ^ key for i in (23, 24, 25)
        ]
        details.update(records=rows, total_order=["WINS", "LOSSES", "DRAWS"], totals=totals)
        return ActiveUi(phase, "A OR B: CLOSE", True, "Link Battle records", details=details)
    except (ValueError, IndexError, struct.error) as error:
        return ActiveUi(
            phase, None, False, "Field widget invalid", diagnostic=str(error), details=details
        )
