"""battle-message-waiting-v1: what the battle waits for when no battle menu is open.

Without it the battle readout says "resolving (no input until the game asks)" whenever no
player input is ready, even while the battle message window waits for A or B (cook run #2,
T445-T716: 270 observes on "Wild WINGULL fainted!"). The facts come from the battle message
window reader (battle_text.py, grounded in pokeemerald src/text.c and src/battle_message.c):

- waiting: printer 0 is in a wait state (RENDER_STATE_WAIT/CLEAR/SCROLL_START) and
  gTextFlags.autoScroll is clear, so TextPrinterWait(WithDownArrow) needs JOY_NEW(A_BUTTON |
  B_BUTTON);
- printing: printer 0 is writing the page (or scrolling/pausing) on its own;
- shown under gTextFlags.autoScroll (link/recorded battles): a timer, not A/B;
- a battle-script YES/NO box (Cmd_yesnobox and the learn-move/nickname boxes) is in its
  input state: UP/DOWN move the cursor, A answers it, B answers NO;
- otherwise, with the printer idle and the battle main callback running, the game is
  playing animations or a message that closes on its own (Cmd_waitmessage).
"""

from pokebench_env.battle_state import BattleState

SWITCH = "battle-message-waiting-v1"

RESOLVING = (
    "resolving (the game is playing animations or a message that closes on its own; "
    "no input until the game asks)"
)
PROMPTS = {
    "learn_move": "learn the new move",
    "stop_learning_move": "stop learning the new move",
    "yes_no": "the battle's question",
    "nickname_caught": "nickname the caught Pokémon",
}


WAIT_RENDER_STATES = frozenset({"button_wait", "page_wait", "scroll_wait"})


def message_clause(battle: BattleState) -> str | None:
    """The message window or YES/NO box the battle is showing, when it shows one.

    Each clause follows the detector's phase (battle_text.battle_text_phase), so a page
    printed while another screen owns the callback (evolution, bag, party) says nothing.
    """
    message, prompt, phase = battle.message, battle.prompt, battle.text_phase
    if phase in ("screen", "input"):
        # Another screen or a ready battle menu owns input; a reader error stays in the state.
        return None
    if message is not None and message.diagnostic is not None:
        # The reader failed: what the window shows is unknown, and is said to be (INV-5).
        return f"battle message state unknown ({message.diagnostic}); check the screen"
    if phase == "prompt" and prompt is not None and prompt.ready:
        return (
            f"battle YES/NO box open ({PROMPTS[prompt.kind]}), cursor on {prompt.selected} — "
            "UP or DOWN moves the cursor, A answers the highlighted choice, B answers NO"
        )
    if message is None or message.page is None:
        return None
    if phase == "message_waiting" and message.state == "waiting_for_input":
        return f'battle message waiting: "{message.page}" — press A or B to continue'
    if phase != "busy" or message.state != "printing":
        return None
    if message.render_state in WAIT_RENDER_STATES:
        # gTextFlags.autoScroll (link and recorded battles): TextPrinterWaitAutoMode's timer.
        return (
            f'battle message shown: "{message.page}" — '
            "it moves on by itself (auto-scroll); no input needed"
        )
    return f'battle message printing: "{message.page}" — still being written; no input needed yet'


def input_clause(battle: BattleState) -> str | None:
    """Replaces "resolving (no input until the game asks)"; None keeps that text."""
    clause = message_clause(battle)
    if clause is None and battle.text_phase == "busy":
        return RESOLVING
    return clause
