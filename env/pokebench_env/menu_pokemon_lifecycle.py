"""Evolution, hatching and Pokéblock recipient screens: exact source owners."""

import struct
from typing import TYPE_CHECKING, cast

from pokebench_env.game_screen import TASKS, ReadMemory
from pokebench_env.menus import (
    PALETTE_FADE,
    MenuValue,
    _ewram,
    _text_pointer,
    owner_details,
    task_snapshot,
)
from pokebench_env.pokemon import MOVE_NAMES, SPECIES_NAMES, decode_party_mon, pokemon_cpu_context

if TYPE_CHECKING:
    from pokebench_env.ui_state import ActiveUi

EVOLUTION_CALLBACKS = {0x0813D9B1, 0x0813DD7D, 0x0813DF71, 0x0813E3A5, 0x0813E3C1}
HATCH_CALLBACKS = {0x080717A1, 0x08071A95}
POKEBLOCK_CALLBACKS = {0x0816624D, 0x081662C1, 0x08166305, 0x0816631D}
POKEBLOCK_FUNCTIONS = {
    0x08166381: "load",
    0x08166565: "show",
    0x08166635: "recipient",
    0x0816681D: "feed_transition",
    0x08166A35: "results",
    0x08166BED: "close",
}


def _mon(
    read: ReadMemory, slot: int, details: dict[str, MenuValue], prefix: str = "pokemon"
) -> str:
    if not 0 <= slot < 6:
        raise ValueError("invalid lifecycle Pokémon party index")
    address = 0x020244EC + 100 * slot
    raw = read(address, 100)
    mon = decode_party_mon(raw, read, address=address, cpu=pokemon_cpu_context(read))
    details.update(
        {
            prefix + "_party_index": slot,
            prefix + "_identity": mon.identity,
            prefix + "_species": mon.species,
            prefix + "_species_id": mon.species_id,
            prefix + "_level": mon.level,
            prefix + "_is_egg": mon.is_egg,
        }
    )
    if mon.diagnostic:
        details.update({prefix + "_raw_hex": mon.raw_hex, prefix + "_diagnostic": mon.diagnostic})
        raise ValueError("lifecycle Pokémon decoding failure")
    details[prefix + "_language"] = mon.language
    details[prefix + "_nickname"] = mon.nickname
    if mon.nickname_diagnostic:
        details[prefix + "_raw_hex"] = mon.raw_hex
        details[prefix + "_nickname_diagnostic"] = mon.nickname_diagnostic
        raise ValueError(mon.nickname_diagnostic)
    return cast(str, mon.species)


def _evolution(
    read: ReadMemory, callback: int, details: dict[str, MenuValue], *, explicit: bool = False
) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, _window_drawn, read_menu

    owners = [task for task in task_snapshot(read) if task[1] in (0x0813E571, 0x0813F1B9)]
    if len(owners) > 1:
        raise ValueError("evolution has multiple input owners")
    ready = False
    selected = None
    phase = "evolution_initializing"
    if owners:
        task, function, data = owners[0]
        trade = function == 0x0813F1B9
        if (
            not 0 <= data[0] <= (20 if trade else 22)
            or not 1 <= data[1] < 412
            or not 1 <= data[2] < 412
        ):
            raise ValueError("invalid evolution phase/species")
        _mon(read, data[10], details)
        details.update(
            {
                "owner_task": task,
                "evolution_state": data[0],
                "move_learning_state": data[6],
                "pre_species_id": data[1],
                "post_species_id": data[2],
                "pre_species": _text_pointer(read, SPECIES_NAMES + 11 * data[1]),
                "post_species": _text_pointer(read, SPECIES_NAMES + 11 * data[2]),
                "task_flags": data[3],
                "yes_next_state": data[7],
                "no_next_state": data[8],
                "evolution_was_stopped": bool(data[9]),
                "trade_evolution": trade,
            }
        )
        phase = "trade_evolution" if trade else "evolution"
        if not trade and data[0] == 8 and data[3] & 1:
            graphics_task = read(0x02024334, 1)[0]
            if graphics_task >= 16:
                raise ValueError("invalid evolution graphics task")
            active = bool(read(TASKS + 40 * graphics_task + 4, 1)[0])
            details["cancel_available"] = active
            if active:
                phase, selected, ready = "evolution_cancel_window", "CANCEL", True
        if data[0] == (20 if trade else 22):
            if not 0 <= data[6] <= (11 if trade else 12):
                raise ValueError("invalid evolution move-learning phase")
            # MonTryLearningNewMove (pret pokemon.c) writes gMoveToLearn.
            # US ROM f3ae0881: BL at 0x0813EA38 -> 0x08069318;
            # STRH at 0x080693EC, literal 0x0806941C -> 0x020244E2.
            # Preserve the old incorrect address exactly with the switch OFF.
            move = int.from_bytes(read(0x020244E2 if explicit else 0x02022F58, 2), "little")
            if not 1 <= move < 355:
                raise ValueError("invalid evolution learned move")
            details.update(
                {"new_move_id": move, "new_move": _text_pointer(read, MOVE_NAMES + 13 * move)}
            )
            phase = "evolution_move_learning"
            if data[6] == 4:
                if trade:
                    menu = read_menu(read)
                    if menu is None or menu.options != 2:
                        raise ValueError("trade evolution YES/NO menu undrawn")
                    cursor = menu.selected - 1
                else:
                    cursor = read(0x02024333, 1)[0]
                    if cursor > 1 or not _window_drawn(read, 12):
                        raise ValueError("evolution YES/NO cursor/window invalid")
                details["options"] = ["YES", "NO"]
                selected, ready = ["YES", "NO"][cursor], True
                phase = "evolution_move_confirmation"
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "Hold B to stop an eligible evolution; directions select; A confirms; B declines",
        details=details,
    )


def _hatch(read: ReadMemory, callback: int, details: dict[str, MenuValue]) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    if callback == 0x080717A1:
        return ActiveUi(
            "egg_hatch_loading", None, False, "Hatching advances automatically", details=details
        )
    pointer = int.from_bytes(read(0x03000DE0, 4), "little")
    if not _ewram(pointer, 0x14):
        raise ValueError("invalid egg hatch owner")
    body = read(pointer, 0x14)
    state, slot = body[2], body[4]
    if state > 12:
        raise ValueError("invalid egg hatch state")
    _mon(read, slot, details)
    details.update(
        {
            "hatch_state": state,
            "delay_timer": body[3],
            "window_id": body[8],
            "hatched_species_id": int.from_bytes(body[12:14], "little"),
        }
    )
    selected = None
    ready = False
    phase = "egg_hatch"
    if state == 10:
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            raise ValueError("egg hatch nickname YES/NO menu undrawn")
        selected, ready = ["YES", "NO"][menu.selected - 1], True
        phase = "egg_hatch_nickname_confirmation"
        details["options"] = ["YES", "NO"]
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "Directions select nickname choice; A confirms; B declines",
        details=details,
    )


def _pokeblock_recipient(
    read: ReadMemory, callback: int, details: dict[str, MenuValue]
) -> "ActiveUi":
    from pokebench_env.ui_state import ActiveUi, read_menu

    pointer = int.from_bytes(read(0x0203BC90, 4), "little")
    menu = int.from_bytes(read(0x0203BCAC, 4), "little")
    if not _ewram(menu, 0x806C) or pointer != menu + 0x7FD0:
        raise ValueError("invalid Pokéblock recipient session/menu owner")
    body = read(pointer, 0x9C)
    function = int.from_bytes(body[:4], "little")
    if function not in POKEBLOCK_FUNCTIONS:
        raise ValueError("unknown Pokéblock recipient callback")
    state, count, index = body[0x50], body[0x70], body[0x71]
    details.update(
        {
            "recipient_function": POKEBLOCK_FUNCTIONS[function],
            "recipient_state": state,
            "selection_count": count,
            "selected_index": index,
            "conditions_before": list(body[0x57:0x5C]),
            "conditions_after": list(body[0x5C:0x61]),
            "enhancements": list(body[0x61:0x66]),
            "condition_boosts": list(struct.unpack_from("<5h", body, 0x66)),
            "condition_index": body[0x53],
            "enhancement_count": body[0x54],
            "helper_state": body[0x78],
        }
    )
    phase = "pokeblock_" + POKEBLOCK_FUNCTIONS[function]
    selected = None
    ready = False
    if function in (0x08166635, 0x08166A35):
        if not 1 <= count <= 7 or index >= count:
            raise ValueError("invalid Pokéblock recipient selection/count")
        slots = [read(menu + 0x7FB8 + 4 * i + 1, 1)[0] for i in range(count - 1)]
        names = []
        for i, slot in enumerate(slots):
            names.append(_mon(read, slot, details, "candidate_" + str(i)))
        options = names + ["CANCEL"]
        details.update({"options": options, "party_slots": slots})
        selected = options[index]
        if function == 0x08166635:
            if state > 7 or state in (2, 4):
                raise ValueError("invalid/unused Pokéblock recipient phase")
            ready = state == 0
            if state == 6:
                prompt = read_menu(read)
                if prompt is None or prompt.options != 2:
                    raise ValueError("Pokéblock feed confirmation menu undrawn")
                details["confirmation_options"] = ["YES", "NO"]
                selected, ready = ["YES", "NO"][prompt.selected - 1], True
                phase = "pokeblock_feed_confirmation"
            elif state == 7:
                selected, ready = "CONTINUE", True
                phase = "pokeblock_cannot_feed_message"
        else:
            if state > 5:
                raise ValueError("invalid Pokéblock results phase")
            if state in (1, 5):
                selected, ready = "CONTINUE", True
    ready = ready and not bool(read(PALETTE_FADE + 7, 1)[0] & 0x80)
    return ActiveUi(
        phase,
        selected,
        ready,
        "UP/DOWN selects Pokémon; A confirms/continues; B cancels",
        details=details,
    )


def read_pokemon_lifecycle_menu(
    read: ReadMemory, callback: int, *, evolution_decision: bool = False
) -> "ActiveUi | None":
    from pokebench_env.ui_state import ActiveUi

    if callback not in EVOLUTION_CALLBACKS | HATCH_CALLBACKS | POKEBLOCK_CALLBACKS:
        return None
    details = owner_details(read, callback)
    try:
        if callback in EVOLUTION_CALLBACKS:
            return _evolution(read, callback, details, explicit=evolution_decision)
        if callback in HATCH_CALLBACKS:
            return _hatch(read, callback, details)
        return _pokeblock_recipient(read, callback, details)
    except (ValueError, struct.error, IndexError) as error:
        return ActiveUi(
            "menu_unsupported",
            None,
            None,
            "Observe and report this coverage error",
            f"harness bug: {error}",
            details=details,
        )
