"""yes-no-answer-readout-v1: how to answer the other option of an open YES/NO box.

Run 2026-10-20T19-58-04_qwen36-gpu0_ef9f read "clock_confirmation; selected NO; UP/DOWN
selects; A accepts selection" for turns ~100-156 and kept pressing A, answering NO. With the
switch, a line after the Interface line says which buttons answer the other option and what A
does now, from the highlighted option the reader took from RAM:

    To answer YES, press UP, then A. Pressing A now answers NO. B also answers NO.
    To answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO.

Every box listed is drawn YES above NO (gText_YesNo "YES\\nNO", src/strings.c; the battle
boxes put the cursor at row 9 + 2 * position, BattleCreateYesNoCursorAt). From NO, UP moves the
cursor to YES and from YES, DOWN moves it to NO in all of them, and A answers the highlighted
row. Most use Menu_ProcessInputNoWrap (src/menu.c), which does not wrap; a few minigame and
link boxes wrap or toggle, which does not change either sentence. "B also answers NO." is added
only where the handler sends B down the NO branch. Source: pret/pokeemerald
731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

No line when the box is not ready, the highlighted option is unknown, the reader reports a
coverage error, or the phase is not listed. Left out on purpose: easy_chat and mystery_gift
(their readers do not tie the cursor to the sub-state that draws the box),
union_room_try_accept_chat_request (state 21 has no YES/NO box in the game; the box is state
19) and wireless_leader_confirmation (the reader says ready while the noDraw path erases it).
"""

from pokebench_env.game_state import GameState

SWITCH = "yes-no-answer-readout-v1"

ANSWER_YES = "To answer YES, press UP, then A. Pressing A now answers NO."
ANSWER_NO = "To answer NO, press DOWN, then A. Pressing A now answers YES."
B_NO = " B also answers NO."

# active_ui phase -> the pokeemerald handler, whose B branch is the NO branch in every entry.
FIELD_PROMPTS: dict[str, str] = {
    "name_confirmation": "main_menu.c Task_NewGameBirchSpeech_ProcessNameYesNoMenu",
    "clock_confirmation": "wallclock.c Task_SetClock_HandleConfirmInput",
    "starter_confirmation": "starter_choose.c Task_HandleConfirmStarterInput",
    **{
        f"party_{name}_confirmation": "party_menu.c YES/NO input tasks (B falls through to NO)"
        for name in (
            "cancel_choice",
            "cancel_participation",
            "switch_held_item",
            "toss_held_item",
            "send_mail_to_pc",
            "lose_mail",
            "spin_trade",
            "field_move_exit",
            "replace_move",
            "stop_learning",
            "switch_item_from_bag",
        )
    },
    "evolution_move_confirmation": "evolution_scene.c (T_)MVSTATE_HANDLE_YES_NO",
    "egg_hatch_nickname_confirmation": "egg_hatch.c EggHatch nickname YES/NO",
    "pokeblock_feed_confirmation": "use_pokeblock.c HandleAskUsePokeblockInput",
    "slots_quit_confirmation": "slot_machine.c SlotTask_HandleQuitInput",
    **{
        phase: "menu_helpers.c Task_CallYesOrNoCallback (B calls noFunc)"
        for phase in (
            "menu_confirmation",
            "shop_purchase_confirmation",
            "bag_tmhm_use_confirmation",
            "bag_toss_confirmation",
            "bag_sell_confirmation",
            "pokeblock_toss_confirmation",
            "pyramid_toss_confirmation",
            "decoration_place_confirmation",
            "decoration_cancel_confirmation",
            "decoration_put_away_confirmation",
            "decoration_stop_put_away_confirmation",
            "decoration_toss_confirmation",
            "secret_base_registry_delete_confirmation",
            "field_confirmation",
            "pc_toss_confirmation",
        )
    },
    "field_yes_no": "script_menu.c Task_HandleYesNoInput (gSpecialVar_Result 0 on B)",
    "pc_confirmation": "pokemon_storage_system.c ShowYesNoWindow handlers",
    **{
        f"move_relearner_{name}_confirmation": "move_relearner.c (MENU_B_PRESSED || 1)"
        for name in ("teach", "exit", "forget", "stop")
    },
    "save_confirmation": "start_menu.c SaveConfirmInputCallback",
    "save_overwrite_confirmation": "start_menu.c SaveOverwriteInputCallback",
    "pyramid_retire_confirmation": "start_menu.c BattlePyramidRetireInputCallback",
    "clear_save_confirmation": "clear_save_data_screen.c Task_ClearSaveDataScreenYesNoChoice",
    "frontier_record_confirmation": "battle_main.c AskRecordBattle STATE_HANDLE_YES_NO",
    "dodrio_ask_play_again": "dodrio_berry_picking.c Msg_WantToPlayAgain (UP/DOWN toggle)",
    "pokemon_jump_ask_play_again": "pokemon_jump.c HandlePlayAgainInput",
    "berry_crush_ask_play_again": "berry_crush.c play-again YES/NO",
    "berry_blender_play_again": "berry_blender.c play-again YES/NO",
    "trade_confirm": "trade.c CB_ProcessConfirmTradeInput",
    "trade_cancel_confirm": "trade.c CB_ProcessCancelTradeInput",
    "union_room_chat_quit": "union_room_chat.c quit YES/NO (Menu_ProcessInput wraps)",
    "union_room_chat_save_and_exit": "union_room_chat.c save YES/NO (Menu_ProcessInput wraps)",
    "union_room_handle_activity_request": "union_room.c UnionRoomHandleYesNo",
    "union_room_cancel_registration_prompt": "union_room.c UnionRoomHandleYesNo",
    "union_room_trade_prompt": "union_room.c UnionRoomHandleYesNo",
    "wireless_group_confirmation": "union_room.c UnionRoomHandleYesNo (ASK_LEAVE_GROUP)",
    "factory_rental_confirm": "battle_factory_screen.c Select_Task_HandleYesNo (wraps)",
    "factory_swap_confirm": "battle_factory_screen.c Swap_Task_HandleYesNo (wraps)",
}

YES_NO = ("YES", "NO")


def answer_line(state: GameState) -> str | None:
    ui = state.active_ui
    if (
        ui is not None
        and ui.ready is True
        and ui.diagnostic is None
        and ui.phase in FIELD_PROMPTS
        and ui.selected in YES_NO
    ):
        return _line(ui.selected, b_answers_no=True)
    battle = state.battle
    if battle is None:
        return None
    prompt = battle.prompt
    # Battle-script boxes (battle_script_commands.c Cmd_yesnobox, Cmd_yesnoboxlearnmove,
    # Cmd_yesnoboxstoplearningmove, Cmd_trygivecaughtmonnick): DPAD_UP only when the cursor is
    # not 0, DPAD_DOWN only when it is 0; B takes the NO branch.
    if (
        battle.text_phase == "prompt"
        and prompt is not None
        and prompt.ready
        and prompt.selected in YES_NO
    ):
        return _line(prompt.selected, b_answers_no=True)
    # The forfeit box (battle_controller_player.c PlayerHandleYesNoInput): B closes the box
    # without choosing, not through the NO branch, so B is not described.
    for selection in battle.player_inputs or ():
        if selection.phase == "yes_no" and selection.ready and selection.selected in YES_NO:
            return _line(selection.selected, b_answers_no=False)
    return None


def _line(selected: str, *, b_answers_no: bool) -> str:
    return (ANSWER_YES if selected == "NO" else ANSWER_NO) + (B_NO if b_answers_no else "")
