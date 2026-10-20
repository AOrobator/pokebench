"""caught-nickname-prompt-v1: the post-catch nickname YES/NO box is an open battle question.

After a catch, BattleScript_SuccessBallThrow (data/battle_scripts_2.s) runs trygivecaughtmonnick
(opcode 0xF3, Cmd_trygivecaughtmonnick in src/battle_script_commands.c): state 0 draws the
YES/NO box, state 1 (gBattleCommunication[MULTIUSE_STATE]) takes UP/DOWN, A and B.
gBattleOutcome is already B_OUTCOME_CAUGHT, so sEndTurnFuncsTable sends gBattleMainFunc to
HandleEndTurn_FinishBattle (src/battle_main.c), which runs
sTurnActionsFuncsTable[gCurrentActionFuncId]; while that is B_ACTION_EXEC_SCRIPT it executes the
battle script, box included. The prompt reader only accepted the two battle script runners, so
this box read as a busy battle (run 2026-10-20T16-14-34_qwen36-gpu1_c6c2, raw-ram 5834: main
0x0803D819, action 10, op 0xF3, state 1, cursor NO).

Addresses for this ROM (f3ae0881…): HandleEndTurn_FinishBattle 0x0803D819 (the literal pool of
HandleEndTurn_MonFled at 0x0803D808 stores it, just before its entry); gCurrentActionFuncId
0x02024083 (the byte after gCurrentTurnActionNumber, immediately before gBattleMons at
0x02024084).
"""

SWITCH = "caught-nickname-prompt-v1"
FINISH_BATTLE = 0x0803D819
ACTION_FUNC = 0x02024083
EXEC_SCRIPT = 10
