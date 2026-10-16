"""readout-truth-v1: readout lines that say what the game shows instead of hedging.

Correctness fixes, ON in both arms of the bundle experiment; OFF keeps the old bytes.
Each "none open" claim rests on game state (pret/pokeemerald 731ad5bf, US ROM f3ae0881):

- Menu: no verified active interface (read_active_ui found no owner) and either free field
  controls (every field menu calls LockPlayerFieldControls, script.c) or no drawn sMenu
  window (read directly, not through the decoded cursor). A drawn sMenu window with locked
  controls and no owner keeps the old text: an unsupported menu may really be open there.
- Field controls locked with no message, sMenu window or owner: the global script context
  (sGlobalScriptContextStatus / sGlobalScriptContext.mode) says whether a script holds them.
"""

from pokebench_env.game_state import GameState

SWITCH = "readout-truth-v1"

MENU_NONE = "Menu: none open"
MENU_OTHER = "Menu: no menu choice open (the Interface line says what owns input)"
LOCK_SCRIPT = (
    "Field controls: locked (a script is running with no message or menu open, "
    "for example moving the player or a person; direction presses cannot move)"
)
LOCK_TASK = (
    "Field controls: locked (no message, menu or script is open; a game animation or "
    "sequence holds them; direction presses cannot move; observe again)"
)


def menu_line(state: GameState) -> str | None:
    """The Menu line when the active interface has no selection; None keeps the old text."""
    if not state.active_ui_read:
        return None
    if state.active_ui is not None:
        # A coverage error is not a verified owner; keep the old text.
        return MENU_OTHER if state.active_ui.diagnostic is None else None
    # A drawn sMenu window may be a real menu even when its cursor does not decode.
    if state.field_controls_locked is False or state.menu_window_drawn is False:
        return MENU_NONE
    return None


def lock_line(state: GameState) -> str | None:
    """The locked Field controls line when no message or menu explains the lock."""
    context = state.world_context
    if context is None or context.no_message is None or state.active_ui is not None:
        return None
    # A drawn sMenu window with no verified owner may be an unsupported menu.
    if not state.active_ui_read or state.menu_window_drawn is not False:
        return None
    return LOCK_TASK if context.no_message.script is None else LOCK_SCRIPT
