"""birch-intro-pages-v1: the pre-name Birch speech reports the page on screen.

pret/pokeemerald 731ad5bf src/main_menu.c, US ROM f3ae0881. After the sprite fade,
Task_NewGameBirchSpeech_WaitForSpriteFadeInWelcome loads gText_Birch_Welcome and sets the
task to Task_NewGameBirchSpeech_ThisIsAPokemon (0x080309CD), which is the owner while those
pages wait. That task then loads gText_ThisIsAPokemon and sets
Task_NewGameBirchSpeech_MainSpeech (0x08030A2D). MainSpeech loads gText_Birch_MainSpeech and
sets Task_NewGameBirchSpeech_AndYouAre (0x08030BCD). Each `\\p` waits for A or B. The whole
gStringVar4 buffer is not the page in the window.
"""

from pokebench_env.birch_pages import (
    CONTROLS,
    INTRO_NOT_READY,
    INTRO_PAGE_TASKS,
    INTRO_PHASE,
    INTRO_SWITCH,
)
from pokebench_env.game_screen import TASKS, Screen
from pokebench_env.game_state import read_game_state
from pokebench_env.readout import SERVER_FEATURES, features_off_from_env, format_readout
from pokebench_env.readout_truth import MENU_OTHER
from pokebench_env.rerender import read_state
from pokebench_env.ui_state import STRING_VAR4, read_active_ui
from tests.env.test_birch_pages import page_memory, task_record
from tests.env.test_game_state import MAPS, game, text

# gText_Birch_Welcome (data/text/birch_speech.inc): four pages, `\\p` between them.
WELCOME = (
    text("Hi! Sorry to keep you waiting!")
    + b"\xfb"
    + text("Welcome to the world of POKéMON!")
    + b"\xfb"
    + text("My name is BIRCH.")
    + b"\xfb"
    + text("But everyone calls me the POKéMON")
    + b"\xfe"
    + text("PROFESSOR.")
    + b"\xfb"
)
FIRST = len(text("Hi! Sorry to keep you waiting!"))
SECOND = WELCOME.index(b"\xfb", FIRST + 1)
SPEECH = 0x08031679
THIS_IS_A_POKEMON = 0x080309CD
MAIN_SPEECH = 0x08030A2D
AND_YOU_ARE = 0x08030BCD


def welcome_memory(
    *, cursor: int = FIRST, owner: int = THIS_IS_A_POKEMON, state: int = 2
) -> object:
    memory = page_memory(cursor=cursor, state=state)
    memory.put(TASKS, task_record(owner))
    memory.put(STRING_VAR4, WELCOME + b"\xff")
    return memory


def test_intro_tasks_are_the_three_pre_name_printers() -> None:
    assert INTRO_PAGE_TASKS == frozenset({THIS_IS_A_POKEMON, MAIN_SPEECH, AND_YOU_ARE})
    assert INTRO_SWITCH == "birch-intro-pages-v1"
    assert INTRO_PHASE == "birch_intro_page"


def test_a_waiting_welcome_page_is_the_page_on_screen_only_with_the_switch() -> None:
    screen = Screen("birch_speech", 0, SPEECH)
    memory = welcome_memory()
    off = read_active_ui(memory.read, screen, birch_intro_pages=False)
    on = read_active_ui(memory.read, screen, birch_intro_pages=True)
    assert off is None
    assert on is not None
    assert (on.phase, on.selected, on.ready, on.value, on.controls) == (
        INTRO_PHASE,
        None,
        True,
        "Hi! Sorry to keep you waiting!",
        CONTROLS,
    )
    later = read_active_ui(welcome_memory(cursor=SECOND).read, screen, birch_intro_pages=True)
    assert later is not None and later.value == "Welcome to the world of POKéMON!"


def test_the_pokemon_sentence_and_the_main_speech_use_their_own_tasks() -> None:
    screen = Screen("birch_speech", 0, SPEECH)
    sentence = text("This is what we call a POKéMON.") + b"\xfb"
    memory = welcome_memory(owner=MAIN_SPEECH, cursor=len(sentence) - 1)
    memory.put(STRING_VAR4, sentence + b"\xff")
    ui = read_active_ui(memory.read, screen, birch_intro_pages=True)
    assert ui is not None and ui.value == "This is what we call a POKéMON."
    main = text("This world is widely inhabited by creatures known as POKéMON.") + b"\xfb"
    memory = welcome_memory(owner=AND_YOU_ARE, cursor=len(main) - 1)
    memory.put(STRING_VAR4, main + b"\xff")
    ui = read_active_ui(memory.read, screen, birch_intro_pages=True)
    assert ui is not None
    assert ui.value == "This world is widely inhabited by creatures known as POKéMON."


def test_a_page_still_printing_stays_not_ready_and_a_post_name_task_is_unchanged() -> None:
    screen = Screen("birch_speech", 0, SPEECH)
    printing = read_active_ui(welcome_memory(state=0).read, screen, birch_intro_pages=True)
    assert printing is not None
    assert (printing.phase, printing.ready, printing.value, printing.controls) == (
        INTRO_PHASE,
        False,
        None,
        INTRO_NOT_READY,
    )
    # The post-name printer stays on birch-speech-pages-v1's not-ready line.
    post_name = read_active_ui(
        welcome_memory(owner=0x0803133D).read, screen, birch_intro_pages=True
    )
    assert post_name is not None and (post_name.phase, post_name.ready) == (
        "name_confirmed_transition",
        False,
    )


def test_the_readout_quotes_the_page_and_the_off_arm_keeps_the_whole_buffer() -> None:
    memory = game((0, SPEECH))
    page = welcome_memory()
    for address, value in page.cells.items():
        memory.put(address, bytes([value]))
    on = read_game_state(
        memory.read, MAPS, birch_intro_pages_enabled=True, readout_truth_enabled=True
    )
    lines = format_readout(on, frozenset()).split("\n")
    assert 'Dialog: "Hi! Sorry to keep you waiting!"' in lines
    ready = (
        f"Interface: {INTRO_PHASE}; input ready; value Hi! Sorry to keep you waiting!; {CONTROLS}"
    )
    assert ready in lines
    assert MENU_OTHER in lines
    off = read_game_state(memory.read, MAPS, readout_truth_enabled=True)
    off_lines = format_readout(off, frozenset()).split("\n")
    assert (
        'Dialog: "Hi! Sorry to keep you waiting! | Welcome to the world of POKéMON! | '
        'My name is BIRCH. | But everyone calls me the POKéMON PROFESSOR."'
    ) in off_lines
    assert all(not line.startswith(f"Interface: {INTRO_PHASE}") for line in off_lines)
    assert "Menu: unavailable (active owner not verified)" in off_lines


def test_the_production_reader_honors_the_switch() -> None:
    assert INTRO_SWITCH in SERVER_FEATURES
    assert INTRO_SWITCH in features_off_from_env({})
    memory = game((0, SPEECH))
    page = welcome_memory()
    for address, value in page.cells.items():
        memory.put(address, bytes([value]))
    off = features_off_from_env({})
    hidden = read_state(memory.read, MAPS, active_ui=True, off=off)
    shown = read_state(memory.read, MAPS, active_ui=True, off=off - {INTRO_SWITCH})
    assert hidden.active_ui is None
    assert shown.active_ui is not None and shown.active_ui.value == "Hi! Sorry to keep you waiting!"
    assert shown.dialog == "Hi! Sorry to keep you waiting!"
