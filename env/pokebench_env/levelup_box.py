"""levelup-box-v1: the level-up stats box is named while it waits for a button.

Without it the battle readout says "resolving (no input until the game asks)" while the box
that Cmd_drawlvlupbox draws after "<mon> grew to LV. <n>!" waits for a button (bundle run
2026-10-16T04-51-03_qwen36-gpu0_54a7, T357-T361). The box is its own window, not the battle
message printer, so battle-message-waiting-v1 cannot see it. Facts from
battle_text.read_levelup_box (pokeemerald src/battle_script_commands.c Cmd_drawlvlupbox,
src/menu_specialized.c DrawLevelUpWindowPg1/Pg2): page 1 lists each stat's increase, page 2
the new totals; each page waits for gMain.newKeys != 0, so any new button moves it on.
"""

from pokebench_env.battle_state import BattleState

SWITCH = "levelup-box-v1"
PAGES = {1: "stat increases", 2: "new totals"}


def levelup_clause(battle: BattleState) -> str | None:
    """The level-up stats box page waiting for a button, when the battle shows one."""
    box = battle.levelup_box
    if battle.text_phase != "busy" or box is None or not box.waiting or box.page is None:
        return None
    shown = (
        f": {box.text}"
        if box.text is not None
        else f"; the stats it shows could not be read ({box.diagnostic})"
    )
    return (
        f"level-up stats box open, page {box.page} of 2 ({PAGES[box.page]}){shown} — "
        "waiting for a button: press A or B to continue (the game takes any new button press)"
    )
