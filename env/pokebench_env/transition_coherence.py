"""transition-coherence-v1: game state is read only when the game has finished writing it.

Grounded in pret/pokeemerald 731ad5bf and the US ROM (SHA-1 f3ae0881); addresses below were
read from ROM literal pools and call targets and seen in archived raw RAM (worklog
docs/worklogs/2026-10-16_battle-start-journal.md).

- Battle start. CB2_InitBattleInternal sets gBattleMainFunc = BeginBattleIntroDummy and every
  gBattlerPositions to 0xFF, then gMain.inBattle; gBattlersCount, gBattleMons, gBattleOutcome
  and gBattleResults still hold the previous battle. BeginBattleIntro clears the outcome and
  results (BattleStartClearSetData); BattleIntroDrawTrainersOrMonsSprites copies the new
  battlers and only then moves on to BattleIntroDrawPartySummaryScreens. While the main
  function is one of BATTLE_INTRO_MAIN_FUNCS the battle is initializing.
- Coherent frames. AgbMain runs the callbacks, then WaitForVBlank (ROM 0x080008AC-0x080008D3)
  spins on gMain.intrCheck. A frame that ends with the main thread there has no callback
  half done: MoveSaveBlocks_ResetHeap (pointers move before the data, ~107 KB copied across a
  VBlank, then a re-key) and EncryptBoxMon/SetBoxMonData have finished or not started.
- Handoffs. HANDOFF_CALLBACKS are callback2 values that last a frame or a few between
  supported screens (field returns, CB2_NewGame, wall clock open/close, starter bag open,
  nickname save, battle start before inBattle is set).

The native action journal always uses these rules. The model's readout uses them only with
the switch on; off keeps the previous bytes.
"""

import re

from pokebench_env.game_screen import ReadMemory
from pokebench_env.pokemon import pokemon_cpu_context

SWITCH = "transition-coherence-v1"

# BeginBattleIntroDummy, BeginBattleIntro, BattleIntroGetMonsData,
# BattleIntroPrepareBackgroundSlide, BattleIntroDrawTrainersOrMonsSprites.
BATTLE_INTRO_MAIN_FUNCS = frozenset({0x08039EC9, 0x08039ECD, 0x0803ABC1, 0x0803AC35, 0x0803AC85})
CLEARED_POSITION = 0xFF

# WaitForVBlank's instructions; gprs[15] is the prefetch address (next instruction + 2).
WAIT_FOR_VBLANK = range(0x080008AC, 0x080008D4)
USER_OR_SYSTEM = frozenset({0x10, 0x1F})
THUMB = 0x20

# Frames in a row with the main loop never idle before the journal says it is blind.
BUSY_LIMIT = 600

# pret731ad5bf overworld.c:1550; ROM-verified Thumb callback, 120-frame input-free wait.
CB2_WHITE_OUT = 0x08085F59
CB2_HANDLE_START_BATTLE = 0x08036FAD
FIELD_RETURN = "Returning to the field; field input is not active yet"
HANDOFF_CALLBACKS: dict[int, tuple[str, str]] = {
    0x08085EF9: ("field_transition", "New game: the first map is loading"),  # CB2_NewGame
    0x080860C9: ("field_transition", FIELD_RETURN),  # CB2_ReturnToField
    0x08086119: ("field_transition", FIELD_RETURN),  # CB2_ReturnToFieldLink
    0x08086195: ("field_transition", FIELD_RETURN),  # CB2_ReturnToFieldWithOpenMenu
    0x080861B1: ("field_transition", FIELD_RETURN),  # CB2_ReturnToFieldContinueScript
    0x080861CD: ("field_transition", FIELD_RETURN),  # ...ContinueScriptPlayMapMusic
    0x080861E9: ("field_transition", FIELD_RETURN),  # CB2_ReturnToFieldFadeFromBlack
    0x0809E8B5: ("field_transition", FIELD_RETURN),  # ReturnFromStartWallClock
    0x081349F5: ("clock_transition", "Wall clock opening; input is not active yet"),
    0x08133F0D: ("starter_choice_transition", "Starter bag opening; input is not active yet"),
    0x080EFE99: ("field_transition", FIELD_RETURN),  # ChangePokemonNickname_CB
    CB2_HANDLE_START_BATTLE: ("battle_transition", "Battle start; the battle screen is loading"),
}

# A standalone number or bare hex run; 0x-prefixed owner addresses are kept.
_VALUE = re.compile(r"(?<![0-9A-Za-z_])(?!0x)[0-9A-Fa-f]*[0-9][0-9A-Fa-f]*(?![0-9A-Za-z_])")


def main_loop_idle(read: ReadMemory) -> bool | None:
    """True when the main thread waits in WaitForVBlank; None when the reader has no CPU."""
    if not callable(getattr(read, "pokemon_cpu_context", None)):
        return None
    cpu = pokemon_cpu_context(read)
    if cpu is None or len(cpu.gprs) != 16:
        return False
    return (
        cpu.cpsr & 0x1F in USER_OR_SYSTEM
        and bool(cpu.cpsr & THUMB)
        and (cpu.gprs[15] & ~1) - 2 in WAIT_FOR_VBLANK
    )


def diagnostic_kind(message: str) -> str:
    """The diagnostic with its slot numbers and raw values replaced, for deduplication."""
    return _VALUE.sub("#", message)
