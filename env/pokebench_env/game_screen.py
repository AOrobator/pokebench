"""Which screen the game is on, from its own main callbacks.

pokeemerald drives every screen through `gMain.callback2`; the US ROM matches
the decompilation byte for byte, so each screen has a fixed function address.
Values were labelled from screenshots (docs/findings/game-state.md). A value
not in the table is reported as unknown rather than guessed.
"""

from collections.abc import Callable
from dataclasses import dataclass

ReadMemory = Callable[[int, int], bytes]

GMAIN = 0x030022C0
TASKS = 0x03005E00
# Root Birch tasks matched to recorded frames and ROM references. Unknown task
# phases stay unknown; a shared main callback is not a screen classifier.
BIRCH_TASKS = frozenset(
    {
        0x080307B1,
        0x080308B1,
        0x08030929,
        0x080309CD,
        0x08030A2D,
        0x08030BCD,
        0x08030E09,
        0x08030E39,
        0x08031015,
        0x08031041,
    }
)

SCREENS: dict[int, str] = {
    0x0816CC55: "intro_transition",
    0x08085E51: "field_battle_transition",
    0x080AAEB9: "title_transition",
    0x080AAED5: "title_transition",
    0x080AAEF1: "title_transition",
    0x080AAF0D: "title_transition",
    0x0802F6DD: "main_menu_transition",
    0x080AAF29: "berry_fix_transition",
    0x081BF385: "berry_fix",
    0x081BF3DD: "berry_fix",
    0x0813C91D: "trainer_hill_records",
    0x0813C8ED: "trainer_hill_records",
    0x08178FDD: "save_recovery",
    0x08179289: "save_recovery",
    0x08179391: "save_recovery",
    0x081793E1: "save_recovery",
    0x08179429: "save_recovery",
    0x08178975: "mystery_event",
    0x08178A79: "mystery_event",
    0x0803937D: "link_battle_confirmation",
    0x08177889: "diploma",
    0x08177A09: "diploma",
    0x0817ACC9: "clear_save",
    0x0817ADF5: "clear_save",
    0x0817ADE5: "clear_save",
    0x0817AFD5: "clear_save",
    0x0809EF89: "reset_rtc",
    0x0809F091: "reset_rtc",
    0x0813D9B1: "evolution",
    0x0813DD7D: "evolution",
    0x0813DF71: "evolution",
    0x0813E3A5: "evolution",
    0x0813E3C1: "evolution",
    0x080717A1: "egg_hatching",
    0x08071A95: "egg_hatching",
    0x0816624D: "pokeblock_recipient",
    0x081662C1: "pokeblock_recipient",
    0x08166305: "pokeblock_recipient",
    0x0816631D: "pokeblock_recipient",
    0x08121C65: "mail",
    0x0811A279: "easy_chat",
    0x08018439: "mystery_gift",
    0x0813591D: "pokeblock_case",
    0x080261CD: "dodrio_berry_picking",
    0x0802AC6D: "pokemon_jump",
    0x08020F89: "berry_crush",
    0x080D823D: "contest",
    0x08080019: "berry_blender",
    0x080808D5: "berry_blender",
    0x08081899: "berry_blender",
    0x08081FC9: "berry_blender",
    0x08082645: "berry_blender",
    0x08082925: "berry_blender",
    0x0807825D: "trade",
    0x0807B60D: "trade_animation",
    0x0807EA11: "trade_animation",
    0x0812FDED: "contest_painting",
    0x0812FDF9: "contest_painting",
    0x0812FE0D: "contest_painting",
    0x08173561: "hall_of_fame",
    0x08173695: "hall_of_fame",
    0x081736D9: "hall_of_fame",
    0x08174195: "hall_of_fame",
    0x08194B55: "battle_dome",
    0x081C501D: "pyramid_bag",
    0x0819A4C9: "factory_rental",
    0x0819C7E1: "factory_swap",
    0x0801DF39: "union_room_chat",
    0x08179B69: "pokeblock_feeding",
    0x080F5C01: "contest_results",
    0x08038421: "battle",
    0x080B1159: "battle_transition",
    0x080B11A9: "battle_transition",
    0x08036761: "battle_transition",
    0x0812A671: "slot_machine",
    0x08140239: "roulette",
    0x081C7401: "pokenav",
    0x080BB775: "pokedex",
    0x080C2711: "trainer_card",
    0x08177C55: "berry_tag",
    0x08170275: "town_map",
    0x081248D5: "fly_map",
    0x080C7D55: "pokemon_storage",
    0x081341E1: "starter_choice",
    0x081B01B1: "party_menu",
    0x081AAD5D: "bag_menu",
    0x080DFD65: "shop_menu",
    0x081BFAB5: "pokemon_summary",
    0x080BA4B1: "options_menu",
    0x0816CEAD: "intro",
    0x0816CC01: "intro",
    0x080AA7A5: "title",
    0x080AAB2D: "title",
    0x0802F6B1: "menu_program",
    0x08031679: "birch_speech",
    0x080E2E05: "naming",
    0x080E4F59: "naming",
    0x08085E5D: "overworld",
    0x08085FFD: "field_transition",
    0x080860F5: "field_transition",  # CB2_ReturnToFieldLocal, clock exit.
    0x08085FCD: "field_transition",
    0x08137201: "field_transition",
    0x08134C9D: "clock",
}


@dataclass(frozen=True)
class Screen:
    kind: str
    callback1: int
    callback2: int

    @property
    def label(self) -> str:
        if self.kind == "unknown":
            return f"unknown (callback2 0x{self.callback2:08X})"
        return self.kind


def read_screen(read: ReadMemory) -> Screen:
    raw = read(GMAIN, 8)
    if len(raw) != 8:
        raise ValueError(f"short read of gMain callbacks: {len(raw)} bytes")
    callback1 = int.from_bytes(raw[0:4], "little")
    callback2 = int.from_bytes(raw[4:8], "little")
    if callback1 == 0 and callback2 == 0:
        from pokebench_env.boot import read_boot_ui

        if read_boot_ui(read) is not None:
            return Screen(kind="boot", callback1=callback1, callback2=callback2)
    kind = SCREENS.get(callback2, "unknown")
    if kind == "menu_program":
        tasks = read(TASKS, 16 * 0x28)
        if len(tasks) != 16 * 0x28:
            raise ValueError("short read of gTasks")
        functions = {
            int.from_bytes(tasks[i : i + 4], "little")
            for i in range(0, len(tasks), 0x28)
            if tasks[i + 4]
        }
        from pokebench_env.ui_state import BIRCH_PHASES

        if functions & (BIRCH_TASKS | BIRCH_PHASES.keys()):
            kind = "birch_speech"
        elif any(0x0802F6B1 <= fn < 0x080307B1 for fn in functions):
            kind = "main_menu"
        else:
            kind = "unknown"
    return Screen(kind=kind, callback1=callback1, callback2=callback2)
