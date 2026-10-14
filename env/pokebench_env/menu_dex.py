"""Pokédex owned list/search/detail selections for the SHA1-pinned US ROM."""

import struct
from typing import TYPE_CHECKING

from pokebench_env.game_screen import ReadMemory
from pokebench_env.menus import _ewram, _text_pointer, owner_details, task_snapshot

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

DEX_CALLBACK = 0x080BB775
DEX_POINTER = 0x02039B4C
DEX_PHASES = {
    0x080BB7D5: "pokedex_list",
    0x080BBA79: "pokedex_list_actions",
    0x080BBEB9: "pokedex_search_results",
    0x080BC0F9: "pokedex_search_result_actions",
    0x080BEDF5: "pokedex_info",
    0x080BF5CD: "pokedex_cry",
    0x080BFBB1: "pokedex_size",
    0x080C0089: "pokedex_caught_entry",
    0x080C15B1: "pokedex_search_topbar",
    0x080C170D: "pokedex_search_menu",
    0x080C1BCD: "pokedex_search_parameter",
    0x080C1AB9: "pokedex_search_complete",
}


def read_dex_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback != DEX_CALLBACK:
        return None
    area_ui = read_dex_area_ui(read, callback)
    if area_ui is not None:
        return area_ui
    details = owner_details(read, callback)
    phase = "pokedex_transition"
    try:
        pointer = struct.unpack("<I", read(DEX_POINTER, 4))[0]
        if not _ewram(pointer, 0x664):
            raise ValueError("invalid PokedexView pointer")
        raw = read(pointer, 0x664)
        owners = [task for task in task_snapshot(read) if task[1] in DEX_PHASES]
        if len(owners) != 1:
            raise ValueError("Pokédex has no unique verified input task")
        task, fn, data = owners[0]
        phase = DEX_PHASES[fn]
        count, selected = struct.unpack_from("<HH", raw, 0x60C)
        if count > 386:
            raise ValueError("invalid Pokédex list count")
        dex_number = None
        flags = 0
        if count:
            if selected >= count:
                raise ValueError("invalid Pokédex list selection")
            dex_number, flags = struct.unpack_from("<HH", raw, selected * 4)
            if not 1 <= dex_number <= 386 or flags & ~3:
                raise ValueError("invalid Pokédex list entry")
        elif phase in (
            "pokedex_list",
            "pokedex_search_results",
            "pokedex_info",
            "pokedex_cry",
            "pokedex_size",
        ):
            raise ValueError("active Pokédex list/details has no entries")
        if phase == "pokedex_caught_entry":
            dex_number = data[1]
            if dex_number not in range(1, 387):
                raise ValueError("invalid caught entry dex number")
        details.update(
            {
                "selected_index": selected,
                "dex_number": dex_number,
                "seen": bool(flags & 1),
                "owned": bool(flags & 2),
                "list_count": count,
                "dex_mode": struct.unpack_from("<H", raw, 0x612)[0],
                "dex_order": struct.unpack_from("<H", raw, 0x616)[0],
            }
        )
        details["owner_task"] = task
        phase = DEX_PHASES[fn]
        ready = not bool(read(0x02037FD4 + 7, 1)[0] & 0x80)
        label = f"POKEDEX #{dex_number}" if dex_number else "NO MATCHING POKEMON"
        if phase in ("pokedex_list", "pokedex_search_results"):
            ready = ready and struct.unpack_from("<h", raw, 0x652)[0] == 0
        elif phase in ("pokedex_list_actions", "pokedex_search_result_actions"):
            cursor = struct.unpack_from("<H", raw, 0x650)[0]
            options = ["BACK TO LIST", "LIST TOP", "LIST BOTTOM", "CLOSE POKEDEX"]
            if phase == "pokedex_search_result_actions":
                options = [
                    "BACK TO LIST",
                    "LIST TOP",
                    "LIST BOTTOM",
                    "BACK TO POKEDEX",
                    "CLOSE POKEDEX",
                ]
            if cursor >= len(options):
                raise ValueError("invalid Pokédex action cursor")
            details.update({"options": options, "selected_index": cursor})
            label = options[cursor]
            ready = ready and struct.unpack_from("<h", raw, 0x652)[0] == (
                96 if phase == "pokedex_search_result_actions" else 80
            )
        elif phase in ("pokedex_info", "pokedex_cry", "pokedex_size"):
            selection = raw[0x64D]
            if selection not in range(4):
                raise ValueError("invalid Pokédex detail selection")
            details.update(
                {"options": ["AREA", "CRY", "SIZE", "CANCEL"], "selected_index": selection}
            )
            label = ("AREA", "CRY", "SIZE", "CANCEL")[selection]
            if phase == "pokedex_info":
                ready = ready and data[0] == 0  # tScrolling disables action input.
        elif phase.startswith("pokedex_search_") and phase not in ("pokedex_search_results",):
            topbar, item = data[:2]
            if topbar not in range(3) or item not in range(7):
                raise ValueError("invalid Pokédex search owner cursor")
            details.update(
                {
                    "topbar_index": topbar,
                    "search_field_index": item,
                    "search_parameter_indices": [
                        data[i] + data[i + 1] for i in (2, 4, 6, 8, 10, 12)
                    ],
                }
            )
            label = ("SEARCH", "SHIFT", "CANCEL")[topbar]
            if phase != "pokedex_search_topbar":
                label = ("NAME", "COLOR", "TYPE LEFT", "TYPE RIGHT", "ORDER", "MODE", "OK")[item]
            if phase == "pokedex_search_parameter":
                table = read(0x0856EFC8 + item * 8, 8)
                texts, cursor_data, scroll_data, total = struct.unpack("<IBBH", table)
                if cursor_data >= 16 or scroll_data >= 16 or not 0 < total <= 30:
                    raise ValueError("invalid Pokédex search option table")
                index = data[cursor_data] + data[scroll_data]
                if index not in range(total) or not 0x08000000 <= texts <= 0x0A000000 - total * 8:
                    raise ValueError("invalid Pokédex parameter cursor/texts")
                options = [
                    _text_pointer(read, struct.unpack("<I", read(texts + i * 8 + 4, 4))[0])
                    for i in range(total)
                ]
                details.update({"options": options, "selected_index": index})
                label = options[index]
        return ActiveUi(
            phase, label, ready, "Directions select; A accepts; B returns", details=details
        )
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            phase, None, None, "Pokédex observation unavailable", str(error), details=details
        )


def read_dex_area_ui(read: ReadMemory, callback: int) -> "ActiveUi | None":
    """Area task overlays Pokédex; source task owns B/right page transition."""
    from pokebench_env.ui_state import ActiveUi

    if callback != DEX_CALLBACK:
        return None
    tasks = [t for t in task_snapshot(read) if t[1] in (0x0813D42D, 0x0813D5A1)]
    if not tasks:
        return None
    details = owner_details(read, callback)
    try:
        if len(tasks) != 1:
            raise ValueError("multiple Pokédex area owners")
        _, function, data = tasks[0]
        pointer = struct.unpack("<I", read(0x0203AB7C, 4))[0]
        if not _ewram(pointer, 0x15BC):
            raise ValueError("invalid Pokédex area heap")
        species = struct.unpack("<H", read(pointer + 14, 2))[0]
        if not 1 <= species <= 411 or 252 <= species <= 276:
            raise ValueError("invalid or reserved Pokédex area species")
        details.update(species_id=species, species=_text_pointer(read, 0x083185C8 + species * 11))
        # Arrays are complete only after the Show task's FindMapsWithMon stage.
        if function == 0x0813D5A1:
            overworld, special = struct.unpack("<2H", read(pointer + 0x110, 4))
            if overworld > 64 or special > 32 or data[0] not in range(4):
                raise ValueError("Pokédex area count or phase invalid")
            areas = list(struct.iter_unpack("<BBH", read(pointer + 16, overworld * 4)))
            sections = [area[2] for area in areas]
            sections += list(struct.unpack(f"<{special}H", read(pointer + 0x620, special * 2)))
            if any(section >= 214 for section in sections):
                raise ValueError("Pokédex area map section outside ROM table")
            details.update(
                overworld_map_groups=[area[0] for area in areas],
                overworld_map_numbers=[area[1] for area in areas],
                region_sections=sections,
                area_unknown=not bool(sections),
                region_names=[
                    _text_pointer(
                        read, struct.unpack("<I", read(0x085A147C + section * 8 + 4, 4))[0]
                    )
                    for section in sections
                ],
            )
        else:
            if data[0] not in range(12):
                raise ValueError("Pokédex area initialization phase invalid")
        ready = function == 0x0813D5A1 and data[0] == 1 and not read(0x02037FDB, 1)[0] & 0x80
        details["available_controls"] = ["B: BACK", "RIGHT: CRY"] if ready else []
        return ActiveUi(
            "pokedex_area" if ready else "pokedex_area_transition",
            "B: BACK; RIGHT: CRY" if ready else None,
            ready,
            "Pokémon encounter areas",
            details=details,
        )
    except (ValueError, struct.error) as error:
        return ActiveUi(
            "pokedex_area",
            None,
            False,
            "Pokédex area invalid",
            diagnostic=str(error),
            details=details,
        )
