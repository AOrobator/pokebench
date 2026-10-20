"""caught-nickname-prompt-v1: the post-catch nickname YES/NO box is an open battle question.

After a catch, BattleScript_SuccessBallThrow (data/battle_scripts_2.s) runs trygivecaughtmonnick
(opcode 0xF3, Cmd_trygivecaughtmonnick in src/battle_script_commands.c): state 0 draws the YES/NO
box, state 1 (gBattleCommunication[MULTIUSE_STATE]) takes UP/DOWN, A and B. The ball is a turn
action: HandleAction_UseItem hands the script to sTurnActionsFuncsTable[B_ACTION_EXEC_SCRIPT]
(HandleAction_RunBattleScript), which RunTurnActionsFunctions (src/battle_main.c) calls each frame,
so gBattleMainFunc is RunTurnActionsFunctions, not one of the two battle script runners the prompt
reader accepted. gBattleOutcome is still 0 here (BattleScript_SuccessBallThrowEnd sets CAUGHT after
the box). Run 2026-10-20T16-14-34_qwen36-gpu1_c6c2, raw-ram 5834: main 0x0803D819, action 10, op
0xF3, state 1, cursor NO, outcome 0; the readout said the battle was busy.

Addresses for this ROM (f3ae0881...): RunTurnActionsFunctions 0x0803D819 (its literal pool holds
gBattleOutcome, gCurrentActionFuncId, sTurnActionsFuncsTable 0x0831BC0C and sEndTurnFuncsTable
0x0831BC44; it sits just before HandleEndTurn_BattleWon 0x0803D8C1, as in the source);
gCurrentActionFuncId 0x02024083 (the byte after gCurrentTurnActionNumber, immediately before
gBattleMons at 0x02024084).
"""

SWITCH = "caught-nickname-prompt-v1"
RUN_TURN_ACTIONS = 0x0803D819
ACTION_FUNC = 0x02024083
EXEC_SCRIPT = 10
