"""What is on screen for the player to respond to: an open dialog box and a menu cursor.

Addresses are pokeemerald symbols in the US ROM, found and labelled from live
RAM dumps against screenshots (docs/findings/game-state.md). The message
buffer and the menu struct both keep their last contents after the box or
menu closes, so each is reported only while its window is drawn: the game
blanks a window's pixel buffer when it clears the window, and marks it
removed (bg 0xFF) when it frees it.
"""

import struct
from collections.abc import Mapping
from dataclasses import dataclass

from pokebench_env.game_screen import ReadMemory, Screen
from pokebench_env.gba_text import GBA_TEXT
from pokebench_env.menus import MenuValue
from pokebench_env.transition_coherence import CB2_WHITE_OUT, HANDOFF_CALLBACKS

STRING_VAR4 = 0x02021FC4
STRING_VAR4_SIZE = 1000
MESSAGE_WINDOW = 0
# Screens where window 0 was checked to be the standard message box.
MESSAGE_SCREENS = frozenset({"overworld", "birch_speech"})
MENU = 0x0203CD90
WINDOWS = 0x02020004
WINDOW_SIZE = 12
WINDOW_REMOVED = 0xFF
EWRAM = range(0x02000000, 0x02040000)

MESSAGE_TEXT = {
    **GBA_TEXT,
    # US font/charmap literal glyphs, including currency and compound labels.
    0x01: "À",
    0x02: "Á",
    0x03: "Â",
    0x04: "Ç",
    0x05: "È",
    0x06: "É",
    0x07: "Ê",
    0x08: "Ë",
    0x09: "Ì",
    0x0B: "Î",
    0x0C: "Ï",
    0x0D: "Ò",
    0x0E: "Ó",
    0x0F: "Ô",
    0x10: "Œ",
    0x11: "Ù",
    0x12: "Ú",
    0x13: "Û",
    0x14: "Ñ",
    0x15: "ß",
    0x16: "à",
    0x17: "á",
    0x19: "ç",
    0x1A: "è",
    0x1C: "ê",
    0x1D: "ë",
    0x1E: "ì",
    0x20: "î",
    0x21: "ï",
    0x22: "ò",
    0x23: "ó",
    0x24: "ô",
    0x25: "œ",
    0x26: "ù",
    0x27: "ú",
    0x28: "û",
    0x29: "ñ",
    0x2A: "º",
    0x2B: "ª",
    0x2C: "er",
    0x2E: "+",
    0x34: "Lv",
    0x35: "=",
    0x36: ";",
    0x37: " ",
    0x51: "¿",
    0x52: "¡",
    0x53: "PK",
    0x54: "MN",
    0x55: "PO",
    0x56: "Ké",
    0x57: "BL",
    0x58: "OC",
    0x59: "K",
    0x5A: "Í",
    0x5B: "%",
    0x68: "â",
    0x6F: "í",
    0x77: " ",
    0x79: "↑",
    0x7A: "↓",
    0x7B: "←",
    0x7C: "→",
    0x84: "e",
    0x85: "<",
    0x86: ">",
    0xA0: "re",
    0xAF: "·",
    0xB7: "¥",
    0xB9: "×",
    0xEF: "▶",
    0xF1: "Ä",
    0xF2: "Ö",
    0xF3: "Ü",
    0xF4: "ä",
    0xF5: "ö",
    0xF6: "ü",
    0x1B: "é",
    0x2D: "&",
    0x5C: "(",
    0x5D: ")",
    0xB1: "“",
    0xB2: "”",
    0xB3: "‘",
    0xF0: ":",
}
LINE_BREAKS = {0xFE: " ", 0xFA: " ", 0xFB: " | "}
# Argument bytes after 0xFC <code> (pokeemerald EXT_CTRL_CODE_*).
CONTROL_ARGS = {0x04: 3, 0x0B: 2, 0x10: 2} | dict.fromkeys(
    (0x01, 0x02, 0x03, 0x05, 0x06, 0x08, 0x0C, 0x0D, 0x0E, 0x11, 0x12, 0x13, 0x14), 1
)


@dataclass(frozen=True)
class Menu:
    selected: int
    options: int


def decode_message(raw: bytes) -> str:
    from pokebench_env.native_text import decode_native_text

    return decode_native_text(raw, line_breaks=LINE_BREAKS).strip(" |")


def _window_drawn(read: ReadMemory, window_id: int) -> bool:
    bg, _left, _top, width, height, _pal, _base, pixels = struct.unpack(
        "<BBBBBBHI", read(WINDOWS + WINDOW_SIZE * window_id, WINDOW_SIZE)
    )
    size = width * height * 32
    if bg == WINDOW_REMOVED or size == 0 or pixels not in EWRAM or pixels + size > EWRAM.stop:
        return False
    return len(set(read(pixels, size))) > 1


def read_dialog(read: ReadMemory, screen_kind: str) -> str | None:
    if screen_kind not in MESSAGE_SCREENS or not _window_drawn(read, MESSAGE_WINDOW):
        return None
    # Window zero is also reused for PC/list widgets. The standard field and
    # Birch message box templates are both 27 by 4 tiles; a drawn widget does
    # not establish ownership of the stale gStringVar4 message buffer.
    template = read(WINDOWS + WINDOW_SIZE * MESSAGE_WINDOW, WINDOW_SIZE)
    if template[3:5] != bytes((27, 4)):
        return None
    if screen_kind == "overworld":
        from pokebench_env.menu_pc import (
            PC_ITEM_ACTION_TASK,
            PC_ITEM_LIST_TASK,
            PC_ITEM_QUANTITY_TASK,
            PC_ITEM_SWAP_TASK,
            PC_MAIL_ACTION_TASK,
            PC_MAIL_LIST_TASK,
        )
        from pokebench_env.menus import task_snapshot

        direct_pc_text_owners = {
            PC_ITEM_ACTION_TASK,
            PC_ITEM_LIST_TASK,
            PC_ITEM_QUANTITY_TASK,
            PC_ITEM_SWAP_TASK,
            PC_MAIL_ACTION_TASK,
            PC_MAIL_LIST_TASK,
        }
        if any(task[1] in direct_pc_text_owners for task in task_snapshot(read)):
            return None
    return decode_message(read(STRING_VAR4, STRING_VAR4_SIZE)) or None


WINDOWS_MAX = 32


def window_drawn_strict(read: ReadMemory, window_id: int) -> bool | None:
    """readout-truth-v1: `_window_drawn`, but a short read is unknown (None), never undrawn."""
    header = read(WINDOWS + WINDOW_SIZE * window_id, WINDOW_SIZE)
    if len(header) != WINDOW_SIZE:
        return None
    bg, _left, _top, width, height, _pal, _base, pixels = struct.unpack("<BBBBBBHI", header)
    size = width * height * 32
    if bg == WINDOW_REMOVED or size == 0 or pixels not in EWRAM or pixels + size > EWRAM.stop:
        return False
    body = read(pixels, size)
    if len(body) != size:
        return None
    return len(set(body)) > 1


def menu_window_drawn(read: ReadMemory) -> bool | None:
    """readout-truth-v1: whether sMenu's window is drawn, whatever its cursor says.

    None when a read is short: the readout then keeps its old menu text.
    """
    header = read(MENU + 5, 1)
    if len(header) != 1:
        return None
    return header[0] < WINDOWS_MAX and window_drawn_strict(read, header[0])


def read_menu(read: ReadMemory, *, allow_single: bool = False) -> Menu | None:
    cursor, _minimum, maximum, window_id = struct.unpack("<bbbB", read(MENU + 2, 4))
    if (
        maximum < (0 if allow_single else 1)
        or not 0 <= cursor <= maximum
        or not _window_drawn(read, window_id)
    ):
        return None
    return Menu(selected=cursor + 1, options=maximum + 1)


@dataclass(frozen=True)
class ActiveUi:
    """Active input owner, separate from stale generic menu/save buffers."""

    phase: str
    selected: str | None
    ready: bool | None
    controls: str
    diagnostic: str | None = None
    value: str | None = None
    details: dict[str, MenuValue] | None = None

    def json(self) -> dict[str, object]:
        from dataclasses import asdict

        return asdict(self)

    def text(self) -> str:
        readiness = (
            "unavailable" if self.ready is None else ("ready" if self.ready else "not ready")
        )
        selection = "" if self.selected is None else f"; selected {self.selected}"
        diagnostic = "" if self.diagnostic is None else f"; STATE COVERAGE ERROR: {self.diagnostic}"
        value = "" if self.value is None else f"; value {self.value}"
        facts = _menu_facts_text(self.details)
        return (
            f"Interface: {self.phase}; input {readiness}{selection}{value}; "
            f"{self.controls}{diagnostic}{facts}"
        )


# Ownership addresses/task snapshots remain in structured recording for repair,
# while the model receives the actual game choices and editable values.
_RAW_MENU_DETAIL_KEYS = frozenset(
    {
        "callback2",
        "task_ids",
        "task_functions",
        "task_data",
        "owner_task",
        "destination_pointer",
        "input_callback",
        "map_input_callback",
        "fly_callback",
        "menu_handler",
        "pokenav_task_state",
        "fly_state",
        "map_state",
        "card_state",
        "summary_mode",
        "party_action",
        "party_menu_type",
        "template_id",
        "list_item_id",
        "pokenav_menu_index",
        "pokenav_mode",
        "current_menu_item",
        "menu_type",
        "visible_list_entries",
        "learning_state",
        "lobby_state",
        "text_state",
        "state",
        "help_state",
        "pocket_switch_state",
        "header_pointer",
        "raw_task_data",
        "personality",
    }
)


def _menu_facts_text(details: dict[str, MenuValue] | None) -> str:
    if not details:
        return ""
    settings = {
        "text_speed": ("SLOW", "MID", "FAST"),
        "battle_scene_off": ("ON", "OFF"),
        "battle_style": ("SHIFT", "SET"),
        "sound": ("MONO", "STEREO"),
        "button_mode": ("NORMAL", "LR", "L=A"),
    }
    facts: list[str] = []
    for key, item in details.items():
        if key in _RAW_MENU_DETAIL_KEYS or key.endswith(("_callback", "_pointer")) or item is None:
            continue
        label = {
            "battle_scene_off": "battle scene",
            "selected_index": "selected index (zero based)",
            "party_slot": "party slot (zero based)",
            "pokemon_slot": "Pokemon slot (zero based)",
            "box_index": "box index (zero based)",
        }.get(key, key.replace("_", " "))
        if key in settings and isinstance(item, int) and item in range(len(settings[key])):
            rendered = settings[key][item]
        elif isinstance(item, list):
            rendered = " | ".join(str(value) for value in item)
        elif isinstance(item, bool):
            rendered = "YES" if item else "NO"
        else:
            rendered = str(item)
        facts.append(f"{label}: {rendered}")
    return "" if not facts else "\nMenu state: " + "; ".join(facts)


# Verified US ROM task pointers and main_menu.c ownership, not address ranges.
BIRCH_PHASES = {
    0x08030C19: "birch_transition",
    0x08030C91: "birch_transition",
    0x08030CD5: "birch_transition",
    0x08030D85: "birch_transition",
    0x08030DC9: "gender_question",
    0x08030E09: "gender_question_printing",
    0x08030E39: "gender_selection",
    0x08030ED5: "gender_transition",
    0x08030F7D: "gender_transition",
    0x08030FD5: "name_question",
    0x08031015: "name_question_printing",
    0x08031041: "name_entry_prompt",
    0x08031091: "naming_transition",
    0x0803261D: "name_confirmation_transition",
    0x08031105: "name_confirmation_printing",
    0x08031145: "name_confirmation_printing",
    0x08031189: "name_confirmation",
    0x08031221: "name_confirmed_transition",
    0x08031259: "name_confirmed_transition",
    0x0803133D: "name_confirmed_transition",
    0x080313E5: "intro_ready",
    0x080314C5: "intro_transition",
    0x08031581: "intro_transition",
    0x080315BD: "intro_transition",
    0x08031631: "intro_transition",
}


def read_active_ui(
    read: ReadMemory,
    screen: "Screen",
    *,
    truth: bool = False,
    evolution_decision: bool = False,
    birch_pages: bool = False,
    birch_intro_pages: bool = False,
    transition_coherence: bool = True,
    blackout_transition: bool = False,
    tutorial_owner_enabled: bool = False,
    party_item_confirmation: bool = False,
    party_menu_message: bool = False,
    bag_pocket_truth: bool = False,
    caught_dex: bool = False,
    battle_move_learn_input: bool = False,
    pokenav_short_list: bool = False,
    pokenav_call_advance: bool = False,
) -> ActiveUi | None:
    """transition_coherence: transition-coherence-v1's battle-start and handoff rules."""
    from pokebench_env.game_screen import TASKS
    from pokebench_env.menu_apprentice import read_apprentice_ui
    from pokebench_env.menu_aux import read_aux_ui
    from pokebench_env.menu_cable import read_cable_ui
    from pokebench_env.menu_common import read_shared_menu
    from pokebench_env.menu_corner import read_corner_ui
    from pokebench_env.menu_dex import read_dex_ui
    from pokebench_env.menu_ereader import read_ereader_ui
    from pokebench_env.menu_field_people import read_field_people_menu
    from pokebench_env.menu_field_widgets import read_field_widget_ui
    from pokebench_env.menu_frontier import read_frontier_ui
    from pokebench_env.menu_item_use import read_item_use_ui
    from pokebench_env.menu_learning import read_learning_ui
    from pokebench_env.menu_legacy import read_legacy_menu
    from pokebench_env.menu_nav import read_nav_ui
    from pokebench_env.menu_pc import read_pc_ui
    from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
    from pokebench_env.menu_prelude import read_prelude_ui
    from pokebench_env.menu_save import read_save_ui
    from pokebench_env.menu_title import read_title_ui
    from pokebench_env.menu_views import read_view_ui
    from pokebench_env.menu_wireless import read_wireless_ui
    from pokebench_env.menus import (
        STARTER_CALLBACK,
        owner_details,
        read_menu_family,
        read_starter_ui,
    )
    from pokebench_env.menus_misc import HOF_CALLBACKS, read_misc_menu

    if caught_dex:
        from pokebench_env.caught_dex import read_caught_dex_ui

        caught = read_caught_dex_ui(read)
        if caught is not None:
            return caught
    if screen.callback1 == 0 and screen.callback2 == 0:
        from pokebench_env.boot import read_boot_ui

        boot_ui = read_boot_ui(read)
        if boot_ui is not None:
            return boot_ui
    if screen.kind == "clock":
        return read_clock_ui(read)
    # battle_setup.c CB2_GiveStarter / CB2_StartFirstBattle and battle_main.c
    # CB2_InitBattle are callback-owned automatic handoffs, not input menus.
    # US ROM ownership is verified by historical battle_setup.s and battle_2.s.
    battle_entry = {
        0x080B1159: "Giving selected starter; battle setup is automatic",
        0x080B11A9: "First battle transition animation is running",
        0x08036761: "Battle core is initializing",
    }
    if screen.callback2 in battle_entry:
        return ActiveUi("battle_transition", None, False, battle_entry[screen.callback2])
    if screen.callback2 == 0x08085E51:
        from pokebench_env.menus import task_snapshot

        battle_start = [task for task in task_snapshot(read) if task[1] == 0x080B05F1]
        if len(battle_start) == 1 and battle_start[0][2][0] in (0, 1):
            return ActiveUi(
                "battle_transition",
                None,
                False,
                "Wild/trainer battle animation is automatic",
                details=owner_details(read, screen.callback2),
            )

    lifecycle_ui = read_pokemon_lifecycle_menu(
        read, screen.callback2, evolution_decision=evolution_decision
    )
    if lifecycle_ui is not None:
        return lifecycle_ui
    legacy_ui = read_legacy_menu(read, screen.callback2)
    if legacy_ui is not None:
        return legacy_ui
    title_ui = read_title_ui(read, screen.callback2)
    if title_ui is not None:
        return title_ui
    aux_ui = read_aux_ui(read, screen.callback2)
    if aux_ui is not None:
        return aux_ui
    prelude_ui = read_prelude_ui(read, screen.callback2)
    if prelude_ui is not None:
        return prelude_ui
    learning_ui = read_learning_ui(read, screen.callback2)
    if learning_ui is not None:
        return learning_ui
    frontier_ui = read_frontier_ui(read, screen.callback2)
    if frontier_ui is not None:
        return frontier_ui
    nav_ui = read_nav_ui(
        read, screen.callback2, short_list=pokenav_short_list, call_advance=pokenav_call_advance
    )
    if nav_ui is not None:
        return nav_ui
    view_ui = read_view_ui(read, screen.callback2)
    if view_ui is not None:
        return view_ui
    dex_ui = read_dex_ui(read, screen.callback2)
    if dex_ui is not None:
        return dex_ui
    wireless_ui = read_wireless_ui(read, screen.callback2)
    if wireless_ui is not None:
        return wireless_ui
    field_people_ui = read_field_people_menu(read, screen.callback2)
    if field_people_ui is not None:
        return field_people_ui
    apprentice_ui = read_apprentice_ui(read, screen.callback2)
    if apprentice_ui is not None:
        return apprentice_ui
    cable_ui = read_cable_ui(read, screen.callback2)
    if cable_ui is not None:
        return cable_ui
    pc_ui = read_pc_ui(read, screen.callback2)
    if pc_ui is not None:
        return pc_ui
    misc_ui = (
        read_misc_menu(read, screen.callback2)
        if screen.callback2 in HOF_CALLBACKS
        or screen.callback2 in (0x08085E5D, 0x08085FFD, 0x080860F5, 0x08085FCD)
        else None
    )
    if misc_ui is not None:
        return misc_ui
    save_ui = read_save_ui(read, screen.callback2)
    if save_ui is not None:
        return save_ui
    item_use_ui = read_item_use_ui(read, screen.callback2)
    if item_use_ui is not None:
        return item_use_ui
    shared_ui = read_shared_menu(read, screen.callback2)
    if shared_ui is not None:
        return shared_ui
    corner_ui = read_corner_ui(read, screen.callback2)
    if corner_ui is not None:
        return corner_ui
    menu_family = read_menu_family(
        read,
        screen.callback2,
        truth=truth,
        party_item_confirmation=party_item_confirmation,
        party_menu_message=party_menu_message,
        bag_pocket_truth=bag_pocket_truth,
    )
    if menu_family is not None:
        return menu_family
    field_widget_ui = read_field_widget_ui(read, screen.callback2)
    if field_widget_ui is not None:
        return field_widget_ui
    from pokebench_env.menus_extra import read_extra_menu

    ereader_ui = read_ereader_ui(read, screen.callback2)
    if ereader_ui is not None:
        return ereader_ui
    extra_ui = read_extra_menu(read, screen.callback2)
    if extra_ui is not None:
        return extra_ui
    if screen.callback2 == STARTER_CALLBACK:
        return read_starter_ui(read)
    if screen.callback2 == 0x080E2E05:
        return ActiveUi(
            "naming_transition",
            None,
            False,
            "Naming editor initializing; selection input is not active",
        )
    if screen.callback2 == 0x080E4F59:
        from pokebench_env.gba_text import decode_text
        from pokebench_env.naming import NAMING_POINTER, read_naming

        naming = read_naming(read, decode_text)
        if naming is None:
            pointer = int.from_bytes(read(NAMING_POINTER, 4), "little")
            return ActiveUi(
                "unsupported",
                None,
                None,
                "Observe and report this coverage error",
                f"callback2 0x080E4F59; naming buffer or cursor invalid; pointer 0x{pointer:08X}",
            )
        pointer = int.from_bytes(read(NAMING_POINTER, 4), "little")
        template = read(pointer + 0x1E2C, 1)[0]
        if template not in range(5):
            return ActiveUi(
                "naming_unsupported",
                None,
                None,
                "Naming owner unavailable",
                "invalid NamingScreen template owner",
            )
        owner = ("player", "box", "caught_mon", "nickname", "walda")[template]
        destination = int.from_bytes(read(pointer + 0x1E30, 4), "little")
        if not naming.ready:
            return ActiveUi(
                "naming_transition",
                None,
                False,
                "Naming editor transition; selection input is not active",
                details={"naming_owner": owner, "template_id": template},
            )
        return ActiveUi(
            "naming_editor",
            naming.key,
            True,
            "A selects key; B deletes; SELECT changes page; START moves to OK",
            value=naming.text,
            details={
                "naming_owner": owner,
                "template_id": template,
                "destination_pointer": f"0x{destination:08X}",
                "species_id": int.from_bytes(read(pointer + 0x1E34, 2), "little"),
                "personality": int.from_bytes(read(pointer + 0x1E38, 4), "little"),
                "page": naming.page,
                "column": naming.column,
                "row": naming.row,
            },
        )
    from pokebench_env.battle_choices import IN_BATTLE
    from pokebench_env.battle_state import read_battle_state

    battle_flag = read(IN_BATTLE, 1)
    if len(battle_flag) != 1:
        raise ValueError("short active UI battle flag read")
    if battle_flag[0] & 2:
        battle = read_battle_state(
            read,
            current_battle_only=transition_coherence,
            tutorial_owner_enabled=tutorial_owner_enabled,
        )
        if battle_move_learn_input:
            # Cmd_yesnoboxlearnmove / Cmd_yesnoboxstoplearningmove own cursor input
            # at learnMoveState == 1; battle action controllers do not own this box.
            prompt = battle.prompt
            if (
                battle.diagnostic is None
                and prompt is not None
                and prompt.ready
                and prompt.kind in {"learn_move", "stop_learning_move"}
            ):
                return ActiveUi(
                    "battle_yes_no",
                    prompt.selected,
                    True,
                    "UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO",
                    details={"prompt_kind": prompt.kind},
                )
        inputs = battle.player_inputs or ()
        selected = (
            "; ".join(
                f"battler {item.battler}: {item.selected}"
                for item in inputs
                if item.ready and item.selected is not None
            )
            or None
        )
        details: dict[str, MenuValue] = {"input_phases": [item.phase for item in inputs]}
        for item in inputs:
            prefix = f"battler_{item.battler}_"
            details[prefix + "ready"] = item.ready
            details[prefix + "action_cursor"] = item.action_cursor
            details[prefix + "move_cursor"] = item.move_cursor
            details[prefix + "target_cursor"] = item.target_cursor
            details[prefix + "selected"] = item.selected
        return ActiveUi(
            "battle_" + battle.phase,
            selected,
            battle.ready,
            "The game controls this tutorial battle; no player battle choice is waiting"
            if tutorial_owner_enabled
            and battle.battle_type is not None
            and battle.battle_type & (1 << 9)
            and battle.ready is False
            else "Use the game-owned battle input and selected control when ready",
            battle.diagnostic,
            details=details,
        )
    if screen.kind == "battle":
        return ActiveUi(
            "battle_transition", None, False, "Battle callback handoff; wait for native input owner"
        )
    if screen.kind == "field_transition":
        return ActiveUi(
            "field_transition", None, False, "Map load in progress; field input is not active"
        )
    if screen.kind == "clock":
        return read_clock_ui(read)
    if screen.callback2 not in (0x0802F6B1, 0x08031679) and screen.kind != "unknown":
        return None
    tasks = read(TASKS, 16 * 0x28)
    if len(tasks) != 16 * 0x28:
        raise ValueError("short active UI gTasks read")
    functions = [
        int.from_bytes(tasks[i : i + 4], "little")
        for i in range(0, len(tasks), 0x28)
        if tasks[i + 4] == 1
    ]
    owners = (
        [fn for fn in functions if fn in BIRCH_PHASES]
        if screen.callback2 in (0x0802F6B1, 0x08031679)
        else []
    )
    if len(owners) == 1:
        phase = BIRCH_PHASES[owners[0]]
        if phase in ("gender_selection", "name_confirmation"):
            menu = read_menu(read)
            if menu is None or menu.options != 2:
                return ActiveUi(
                    phase,
                    None,
                    None,
                    "Selection unavailable; observe again.",
                    f"active owner 0x{owners[0]:08X}; invalid or undrawn two-option menu",
                )
            labels = ("BOY", "GIRL") if phase == "gender_selection" else ("YES", "NO")
            controls = (
                "UP/DOWN selects; A accepts"
                if phase == "gender_selection"
                else "UP/DOWN selects; A accepts selection; "
                "B declines and returns to gender selection"
            )
            return ActiveUi(phase, labels[menu.selected - 1], True, controls)
        if birch_pages:
            from pokebench_env.birch_pages import read_birch_page

            task = next(
                tasks[i : i + 0x28]
                for i in range(0, len(tasks), 0x28)
                if tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") == owners[0]
            )
            page = read_birch_page(read, task)
            if page is not None:
                return page
        ready = phase == "name_entry_prompt"
        return ActiveUi(
            phase,
            None,
            ready,
            "A or B advances"
            if ready
            else "Transition or text printing; selection input is not active",
        )
    if birch_intro_pages and not owners:
        from pokebench_env.birch_pages import (
            INTRO_NOT_READY,
            INTRO_PAGE_TASKS,
            INTRO_PHASE,
            read_birch_page,
        )

        intro = [fn for fn in functions if fn in INTRO_PAGE_TASKS]
        if len(intro) == 1:
            task = next(
                tasks[i : i + 0x28]
                for i in range(0, len(tasks), 0x28)
                if tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") == intro[0]
            )
            page = read_birch_page(read, task, tasks=INTRO_PAGE_TASKS, phase=INTRO_PHASE)
            if page is not None:
                return page
            return ActiveUi(INTRO_PHASE, None, False, INTRO_NOT_READY)
    if blackout_transition and not owners and screen.callback2 == CB2_WHITE_OUT:
        return ActiveUi("field_transition", None, False, "Whiting out; input is not active yet")
    if screen.kind != "unknown" and not owners:
        return None
    if transition_coherence and not owners and screen.callback2 in HANDOFF_CALLBACKS:
        phase, controls = HANDOFF_CALLBACKS[screen.callback2]
        return ActiveUi(phase, None, False, controls)
    return ActiveUi(
        "unsupported",
        None,
        None,
        "Observe and report this coverage error; do not infer a selection.",
        f"callback1 0x{screen.callback1:08X}; callback2 0x{screen.callback2:08X}; active tasks "
        + ",".join(f"0x{fn:08X}" for fn in functions),
        details=owner_details(read, screen.callback2),
    )


CLOCK_PHASES = {
    0x08134CB9: "clock_transition",
    0x08134CE9: "clock_adjustment",
    0x08134DC5: "clock_confirmation_transition",
    0x08134E31: "clock_confirmation",
    0x08134EA5: "clock_confirmed_transition",
    0x08134EE9: "clock_exit",
    0x08134F11: "clock_transition",
    0x08134F41: "clock_view",
    0x08134F79: "clock_exit",
    0x08134FB1: "clock_exit",
}


def read_clock_ui(read: ReadMemory) -> ActiveUi:
    from pokebench_env.game_screen import TASKS

    tasks = read(TASKS, 16 * 0x28)
    if len(tasks) != 16 * 0x28:
        raise ValueError("short clock task read")
    owners = [
        i
        for i in range(0, len(tasks), 0x28)
        if tasks[i + 4] == 1 and int.from_bytes(tasks[i : i + 4], "little") in CLOCK_PHASES
    ]
    if len(owners) != 1:
        return ActiveUi(
            "unsupported",
            None,
            None,
            "Observe and report this coverage error",
            "clock callback 0x08134C9D; active clock owner unavailable; active tasks "
            + ",".join(
                f"0x{int.from_bytes(tasks[i : i + 4], 'little'):08X}"
                for i in range(0, len(tasks), 0x28)
                if tasks[i + 4] == 1
            ),
        )
    index = owners[0]
    phase = CLOCK_PHASES[int.from_bytes(tasks[index : index + 4], "little")]
    hours, minutes = struct.unpack_from("<hh", tasks, index + 12)
    period = struct.unpack_from("<h", tasks, index + 18)[0]
    if not 0 <= hours <= 23 or not 0 <= minutes <= 59 or period not in (0, 1):
        return ActiveUi(
            phase,
            None,
            None,
            "Observe and report this coverage error",
            "invalid clock task hours/minutes/period",
        )
    value = f"{hours % 12 or 12}:{minutes:02d} " + ("AM" if period == 0 else "PM")
    if phase == "clock_confirmation":
        menu = read_menu(read)
        if menu is None or menu.options != 2:
            return ActiveUi(
                phase,
                None,
                None,
                "Observe again",
                "invalid or undrawn clock confirmation menu",
                value,
            )
        return ActiveUi(
            phase,
            ("YES", "NO")[menu.selected - 1],
            True,
            "UP/DOWN selects; A accepts selection; B returns to adjustment",
            value=value,
        )
    angle = struct.unpack_from("<h", tasks, index + 8)[0]
    ready = phase == "clock_view" or (phase == "clock_adjustment" and angle % 6 == 0)
    controls = (
        "LEFT/RIGHT changes time; A opens confirmation"
        if phase == "clock_adjustment"
        else "A or B closes clock"
        if phase == "clock_view"
        else "Clock transition; selection input is not active"
    )
    return ActiveUi(phase, None, ready, controls, value=value)


def active_ui_enabled_from_env(env: Mapping[str, str]) -> bool:
    flag = env.get("POKEBENCH_ACTIVE_UI")
    if flag not in (None, "0", "1"):
        raise ValueError("POKEBENCH_ACTIVE_UI must be 0 or 1")
    return flag != "0"
