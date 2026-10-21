"""Post-catch page under CB2_BattleMain, not CB2_Pokedex.

US ROM f3ae0881: Task_HandleCaughtMonPageInput at 0x080C0089 reads
gMain.newKeys & 3 (A/B) and installs Task_ExitCaughtMonPage at 0x080C012D.
Source: pokeemerald 731ad5bf src/pokedex.c. Task data[1] is tDexNum;
no standalone sPokedexView allocation belongs to this screen.
"""

from pokebench_env.game_screen import GMAIN, ReadMemory
from pokebench_env.menus import task_snapshot
from pokebench_env.ui_state import ActiveUi

SWITCH = "caught-dex-input-v1"
BATTLE_CALLBACK = 0x08038421
DISPLAY = 0x080BFE39
INPUT = 0x080C0089
EXIT = 0x080C012D


def read_caught_dex_ui(read: ReadMemory) -> ActiveUi | None:
    if int.from_bytes(read(GMAIN + 4, 4), "little") != BATTLE_CALLBACK:
        return None
    owners = [task for task in task_snapshot(read) if task[1] in (DISPLAY, INPUT, EXIT)]
    if not owners:
        return None
    if len(owners) != 1:
        return ActiveUi(
            "pokedex_caught_entry",
            None,
            None,
            "Registration input unavailable",
            "multiple caught Pokédex task owners",
        )
    task, fn, data = owners[0]
    number = data[1]
    if not 1 <= number <= 386:
        return ActiveUi(
            "pokedex_caught_entry",
            None,
            None,
            "Registration input unavailable",
            "invalid caught Pokédex number",
        )
    ready = fn == INPUT
    return ActiveUi(
        "pokedex_caught_entry" if ready else "pokedex_caught_transition",
        "POKéDEX registration completed.",
        ready,
        "A or B closes the registration page" if ready else "Registration page is transitioning",
        details={"national_dex_number": number, "owner_task": task},
    )
