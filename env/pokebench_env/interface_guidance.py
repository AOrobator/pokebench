"""State-owned interface controls; adapters require qualified native owners.

pret/pokeemerald 731ad5bf pokenav_menu_handler.c:
HandleMainMenuInputTutorial / HandleMainMenuInputEndTutorial;
pokenav_match_call_list.c: CB2_HandleMatchCallInput / CB2_HandleMatchCallOptionsInput.
No actions or recipient selection are supplied here.
"""

from dataclasses import replace

from pokebench_env.ui_state import ActiveUi

SWITCH = "interface-guidance-v1"


def interface_guidance(ui: ActiveUi | None) -> ActiveUi | None:
    """Add future interfaces as explicit owner/mode adapters; unknown stays unchanged."""
    if ui is None or not ui.ready or ui.diagnostic is not None or ui.details is None:
        return ui
    mode = ui.details.get("pokenav_mode")
    callback = ui.details.get("input_callback")
    controls = None
    if ui.phase == "field_multichoice" and ui.details.get("menu_id") == 86:
        # script_menu.c ScriptMenu_CreateStartMenuForPokenavTutorial;
        # RustboroCity_EventScript_MatchCallTutorial loops on every other choice.
        controls = (
            "UP/DOWN selects; A chooses; only POKéNAV continues; "
            "other choices or B reopen this menu"
        )
    elif ui.phase == "pokenav_menu" and ui.details.get("menu_type") in (1, 2):
        if mode == 1 and callback == "0x081C9521":
            controls = (
                "UP/DOWN selects; A opens MATCH CALL only; B cannot exit during this tutorial"
            )
        elif mode == 2 and callback == "0x081C9589":
            controls = "UP/DOWN selects; A opens MATCH CALL or SWITCH OFF only; B exits"
    elif ui.phase == "pokenav_match_call" and mode == 1:
        if callback == "0x081CAB45":
            controls = (
                "UP/DOWN selects a contact; A opens its options; B cannot exit during this tutorial"
            )
        elif callback == "0x081CAC05":
            controls = (
                "UP/DOWN selects; A chooses the selected option; B returns to the contact list"
            )
    return ui if controls is None else replace(ui, controls=controls)
