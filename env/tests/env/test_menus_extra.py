import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.menus_extra import (
    EASY_CHAT_CALLBACK,
    EASY_CHAT_GROUP_NAMES,
    EASY_CHAT_GROUPS,
    EASY_CHAT_POINTER,
    EASY_CHAT_TASK,
    EASY_CHAT_WORD_DATA,
    MAIL_CALLBACK,
    MAIL_POINTER,
    MYSTERY_GIFT_CALLBACK,
    MYSTERY_GIFT_TASK,
    read_extra_menu,
)
from tests.env.test_menus import list_task, put_task
from tests.env.test_ui_state import Memory, menu, text, window

SCREEN, WORD_DATA, MAIL, MAIL_DATA = 0x02010000, 0x02020000, 0x02011000, 0x02012000


def chat(phase=0, mode=0):
    m = Memory()
    put_task(m, 0, EASY_CHAT_TASK, [1])
    body = bytearray(0x50)
    body[:8] = bytes([mode, 0, 2, 2, phase, 0, 0, 4])
    struct.pack_into("<I", body, 0x34, 0x08500000)
    struct.pack_into("<9H", body, 0x3C, 512, 0xFFFF, 512, 0xFFFF, *([0xFFFF] * 5))
    m.put(0x08500000, text("PROFILE") + b"\xff")
    m.put(EASY_CHAT_POINTER, struct.pack("<I", SCREEN))
    m.put(SCREEN, body)
    m.put(EASY_CHAT_GROUPS + 8, struct.pack("<IHH", 0x08500100, 1, 1))
    m.put(0x08500100, struct.pack("<I", 0x08500200))
    m.put(0x08500200, text("I CHOOSE YOU") + b"\xff")
    m.put(EASY_CHAT_WORD_DATA, struct.pack("<I", WORD_DATA))
    m.put(WORD_DATA, struct.pack("<3H", 2, 1, 2))
    m.put(WORD_DATA + 0x3984, struct.pack("<2H", 512, 0xFFFF))
    m.put(WORD_DATA + 0x3BA0, struct.pack("<H", 2))
    for group, label in [(1, "TRAINER"), (2, "STATUS")]:
        address = 0x08500300 + group * 64
        m.put(EASY_CHAT_GROUP_NAMES + group * 4, struct.pack("<I", address))
        m.put(address, text(label) + b"\xff")
    return m


def test_phrase_cursor_and_current_phrase_use_real_word_dictionary():
    m = chat()
    ui = read_extra_menu(m.read, EASY_CHAT_CALLBACK)
    assert (ui.selected, ui.ready) == ("I CHOOSE YOU", True)
    assert ui.details["phrase_words"] == ["I CHOOSE YOU", "(empty)", "I CHOOSE YOU", "(empty)"]
    m.put(SCREEN + 5, bytes([1, 0]))
    assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).selected == "(empty)"
    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).ready is False


@pytest.mark.parametrize(
    "phase,expected",
    [(1, "DEL. ALL"), (2, "TRAINER"), (3, "I CHOOSE YOU"), (8, "CONTINUE"), (9, None)],
)
def test_chat_input_modes_have_game_owned_selected_content(phase, expected):
    m = chat(phase)
    ui = read_extra_menu(m.read, EASY_CHAT_CALLBACK)
    assert ui.selected == expected
    assert ui.ready == (phase != 9)


@pytest.mark.parametrize("phase", [4, 5, 6, 10])
def test_chat_yes_no_prompt_uses_drawn_menu(phase):
    m = chat(phase)
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).selected == "NO"
    window(m, 0, 0, 5, 4, False)
    assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).diagnostic


def test_keyboard_alphabet_and_buttons_are_selected_by_source_rows():
    m = chat(2)
    m.put(SCREEN + 9, bytes([1, 1, 0]))
    assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).selected == "B"
    m.put(SCREEN + 0xA, struct.pack("<bb", -1, 1))
    assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).selected == "DELETE"
    m.put(SCREEN + 0xA, struct.pack("<bb", 6, 1))
    assert "alphabet" in read_extra_menu(m.read, EASY_CHAT_CALLBACK).diagnostic


def test_quiz_and_answer_footer_options():
    for mode, label in [(16, "QUIZ"), (15, "ANSWER"), (18, "ANSWER")]:
        m = chat(1, mode)
        m.put(SCREEN + 5, b"\x03")
        assert read_extra_menu(m.read, EASY_CHAT_CALLBACK).selected == label


def test_invalid_owner_layout_and_indices_are_errors():
    m = chat()
    m.put(TASKS + 4, b"\x00")
    assert "input task" in read_extra_menu(m.read, EASY_CHAT_CALLBACK).diagnostic
    m = chat()
    m.put(EASY_CHAT_POINTER, bytes(4))
    assert "screen pointer" in read_extra_menu(m.read, EASY_CHAT_CALLBACK).diagnostic
    m = chat()
    m.put(SCREEN + 5, b"\x02")
    assert "phrase cursor" in read_extra_menu(m.read, EASY_CHAT_CALLBACK).diagnostic
    m = chat(3)
    m.put(SCREEN + 0x10, b"\x02")
    assert "word cursor" in read_extra_menu(m.read, EASY_CHAT_CALLBACK).diagnostic
    assert read_extra_menu(m.read, 0x08001235) is None


def mail(callback=0x08121CC1):
    m = Memory()
    m.put(MAIL_POINTER, struct.pack("<I", MAIL))
    body = bytearray(0x22C)
    body[:64] = (text("HELLO") + b"\xff").ljust(64, b"\x00")
    body[0x200:0x20C] = (text("MAY") + b"\xff").ljust(12, b"\x00")
    struct.pack_into("<II", body, 0x210, callback, MAIL_DATA)
    body[0x218] = 1
    struct.pack_into("<I", body, 0x228, 0x08510000)
    m.put(MAIL, body)
    m.put(MAIL_DATA, struct.pack("<9H", *([512] * 9)))
    m.put(0x08510000, b"\x01")
    return m


def test_mail_records_exact_rendered_text_sender_and_word_codes():
    m = mail()
    ui = read_extra_menu(m.read, MAIL_CALLBACK)
    assert (ui.selected, ui.ready, ui.value) == ("CLOSE", True, "HELLO")
    assert ui.details["sender"] == "MAY"
    assert ui.details["mail_word_codes"] == [512] * 9
    m.put(MAIL + 0x210, struct.pack("<I", 0x08121C99))
    assert read_extra_menu(m.read, MAIL_CALLBACK).ready is False
    m.put(MAIL + 0x218, b"\x00")
    assert read_extra_menu(m.read, MAIL_CALLBACK).details["message_lines"] == []


def test_invalid_mail_owner_is_a_harness_bug():
    m = mail(0x08121C97)
    assert "mail input owner" in read_extra_menu(m.read, MAIL_CALLBACK).diagnostic
    m = mail()
    m.put(MAIL_POINTER, bytes(4))
    assert "mail owner pointer" in read_extra_menu(m.read, MAIL_CALLBACK).diagnostic


def test_mystery_gift_uses_exact_live_list_owner_and_transition_readiness():
    m = Memory()
    data = [0] * 16
    data[4] = 1
    put_task(m, 0, MYSTERY_GIFT_TASK, data)
    list_task(m, 1)
    ui = read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK)
    assert (ui.selected, ui.ready) == ("POTION", True)
    data[4] = 7
    put_task(m, 0, MYSTERY_GIFT_TASK, data)
    ui = read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK)
    assert ui.selected is None and ui.ready is False
    assert ui.details["gift_state"] == 7
    data[4] = 20
    data[6] = 1
    put_task(m, 0, MYSTERY_GIFT_TASK, data)
    assert read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK).selected == "VIEW WONDER NEWS"


def linked(callback, function=0):
    from pokebench_env.menus_extra import CRUSH_CALLBACK, DODRIO_CALLBACK, JUMP_CALLBACK

    m = Memory()
    body = bytearray(0x83B0)
    if callback == DODRIO_CALLBACK:
        m.put(0x02022C98, struct.pack("<I", SCREEN))
        body[0x24] = 2
        body[0x18] = function
    elif callback == JUMP_CALLBACK:
        m.put(0x02022CFC, struct.pack("<I", SCREEN))
        body[5] = 2
        body[0x70] = function
        struct.pack_into("<H", body, 10, 1 if function == 2 else 0)
    elif callback == CRUSH_CALLBACK:
        m.put(0x02022C90, struct.pack("<I", SCREEN))
        body[9] = 2
        commands = [0x08021001 + i * 16 for i in range(26)]
        m.put(0x082F43CC, struct.pack("<26I", *commands))
        struct.pack_into("<I", body, 4, commands[function])
    m.put(SCREEN, body)
    return m


@pytest.mark.parametrize(
    "callback,function", [(0x080261CD, 4), (0x0802AC6D, 2), (0x08020F89, 13), (0x08020F89, 14)]
)
def test_link_minigames_only_accept_input_during_gameplay(callback, function):
    m = linked(callback, function)
    assert read_extra_menu(m.read, callback).ready is True
    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_extra_menu(m.read, callback).ready is False
    m = linked(callback)
    assert read_extra_menu(m.read, callback).ready is False


@pytest.mark.parametrize(
    "callback,function,offset", [(0x080261CD, 7, 0x3174), (0x0802AC6D, 4, 10), (0x08020F89, 20, 12)]
)
def test_link_minigame_play_again_changes_selection_and_retains_score(callback, function, offset):
    m = linked(callback, function)
    m.put(SCREEN + offset, bytes([3 if callback == 0x080261CD else 2]))
    if callback == 0x080261CD:
        m.put(SCREEN + 0x3169, b"\x00")
        m.put(SCREEN + 0x3180, b"\x02")
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    ui = read_extra_menu(m.read, callback)
    assert (ui.selected, ui.ready, ui.diagnostic) == ("NO", True, None)
    if callback == 0x080261CD:
        m.put(SCREEN + 0x3180, b"\x03")
    else:
        window(m, 0, 0, 5, 4, False)
    assert read_extra_menu(m.read, callback).diagnostic


@pytest.mark.parametrize("callback", [0x080261CD, 0x0802AC6D, 0x08020F89])
def test_minigame_invalid_player_count_is_explicit_harness_bug(callback):
    m = linked(callback)
    offset = {0x080261CD: 0x24, 0x0802AC6D: 5, 0x08020F89: 9}[callback]
    m.put(SCREEN + offset, b"\x06")
    ui = read_extra_menu(m.read, callback)
    assert ui.ready is None and "harness bug" in ui.diagnostic
    assert "callback2" in ui.details


def test_contest_selection_reads_actual_moves_and_rejects_undrawn_choice():
    from pokebench_env.pokemon import MOVE_NAMES

    m = Memory()
    m.put(0x02039F34, struct.pack("<I", 0x02013000))
    m.put(0x02013000, struct.pack("<I", SCREEN))
    m.put(0x02039E1E, struct.pack("<4H", 55, 78, 0, 0))
    for move, label in [(55, "WATER GUN"), (78, "STUN SPORE")]:
        m.put(MOVE_NAMES + 13 * move, text(label) + b"\xff")
    put_task(m, 0, 0x080D8611, [])
    window(m, 5, 0, 5, 4, True)
    ui = read_extra_menu(m.read, 0x080D823D)
    assert ui.selected == "WATER GUN" and ui.details["options"] == ["WATER GUN", "STUN SPORE"]
    m.put(SCREEN, b"\x01")
    window(m, 6, 0, 5, 4, True)
    assert read_extra_menu(m.read, 0x080D823D).selected == "STUN SPORE"
    window(m, 6, 0, 5, 4, False)
    assert read_extra_menu(m.read, 0x080D823D).diagnostic
    put_task(m, 0, 0x080D8425, [])
    assert read_extra_menu(m.read, 0x080D823D).selected == "CONTINUE"
    m.put(TASKS + 4, b"\x00")
    assert read_extra_menu(m.read, 0x080D823D).ready is False


def test_blender_play_results_and_confirmation_read_different_owners():
    m = Memory()
    m.put(0x020322A4, struct.pack("<I", SCREEN))
    m.put(SCREEN + 0x7C, b"\x02")
    assert read_extra_menu(m.read, 0x08081899).ready is True
    m.put(SCREEN + 0x63, b"\x05")
    m.put(SCREEN, b"\x05")
    assert read_extra_menu(m.read, 0x08081FC9).selected == "CONTINUE"
    m.put(SCREEN + 0x63, b"\x0a")
    assert read_extra_menu(m.read, 0x08081FC9).diagnostic
    menu(m, 0, 1, 0)
    window(m, 0, 0, 5, 4, True)
    ui = read_extra_menu(m.read, 0x08081FC9)
    assert (ui.phase, ui.selected, ui.ready) == ("berry_blender_play_again", "YES", True)


def factory(selecting=True, function=None, state=1):
    from tests.env.test_pokemon import fixture

    m = Memory()
    raw, read = fixture()
    # Copy only fixture reads required by the actual Pokémon decoder.
    from pokebench_env.pokemon import BATTLE_MOVES, ITEMS, MOVE_NAMES, SPECIES_NAMES

    for address, length in [
        (SPECIES_NAMES + 11 * 280, 11),
        (ITEMS + 44 * 13, 44),
        *[(MOVE_NAMES + 13 * move, 13) for move in (55, 78, 33)],
        *[(BATTLE_MOVES + 12 * move + 4, 1) for move in (55, 78, 33)],
    ]:
        m.put(address, read(address, length))
    m.put(0x0300127C if selecting else 0x03001284, struct.pack("<I", SCREEN))
    put_task(m, 0, function or (0x0819B379 if selecting else 0x0819CE41), [state])
    if selecting:
        for i in range(6):
            m.put(SCREEN + 0x14 + 0x6C * i, raw)
    else:
        for base in (0x020244EC, 0x02024744):
            for i in range(3):
                m.put(base + 100 * i, raw)
        m.put(SCREEN + 0x11, b"\x04")
        m.put(SCREEN + 0x18, struct.pack("<I", 0x08550000))
        for i, action in enumerate([1, 1, 1, 3]):
            m.put(0x08550000 + 8 * i, bytes([action]))
    return m


def test_factory_rental_exposes_candidates_order_and_dynamic_deselect_action():
    m = factory()
    ui = read_extra_menu(m.read, 0x0819A4C9)
    assert (ui.selected, ui.ready, ui.diagnostic) == ("TORCHIC", True, None)
    assert len(ui.details["rental_identities"]) == 6
    put_task(m, 0, 0x0819B125, [3])
    m.put(SCREEN, b"\x01")
    assert read_extra_menu(m.read, 0x0819A4C9).selected == "RENT"
    m.put(SCREEN + 0x10, b"\x01")
    assert read_extra_menu(m.read, 0x0819A4C9).selected == "DESELECT"
    m.put(SCREEN + 0x10 + 0x6C, b"\x01")
    assert "order" in read_extra_menu(m.read, 0x0819A4C9).diagnostic


@pytest.mark.parametrize(
    "selecting,callback,function", [(True, 0x0819A4C9, 0x0819B02D), (False, 0x0819C7E1, 0x0819CB1D)]
)
def test_factory_yes_no_uses_custom_cursor_not_generic_menu(selecting, callback, function):
    m = factory(selecting, function, 4)
    assert read_extra_menu(m.read, callback).ready is False
    put_task(m, 0, function, [5])
    m.put(SCREEN + (7 if selecting else 16), b"\x01")
    assert read_extra_menu(m.read, callback).selected == "NO"
    m.put(SCREEN + (0x2A0 if selecting else 0x30), b"\x01")
    assert read_extra_menu(m.read, callback).ready is False


def test_factory_swap_table_cancel_and_species_failure_are_observable():
    m = factory(False)
    m.put(SCREEN + 3, b"\x03")
    assert read_extra_menu(m.read, 0x0819C7E1).selected == "CANCEL"
    m.put(0x08550000 + 24, b"\x02")
    assert "action table" in read_extra_menu(m.read, 0x0819C7E1).diagnostic
    m = factory(False)
    m.put(0x02024744 + 0x20, b"\x00")
    ui = read_extra_menu(m.read, 0x0819C7E1)
    assert "Pokémon decoding" in ui.diagnostic and "opponent_pokemon_raw" in ui.details


def test_easy_chat_transition_does_not_misclassify_undrawn_confirmation():
    m = chat(4)
    put_task(m, 0, EASY_CHAT_TASK, [0])
    ui = read_extra_menu(m.read, EASY_CHAT_CALLBACK)
    assert ui.ready is False and ui.diagnostic is None


def chat_room(function=1, state=0):
    from pokebench_env.menus_extra import CHAT_TASK

    m = Memory()
    m.put(0x02022C84, struct.pack("<I", SCREEN))
    put_task(m, 0, CHAT_TASK, [])
    raw = bytearray(0x1BC)
    struct.pack_into("<HH", raw, 4, function, state)
    raw[0xD] = 2
    raw[0x1A] = 0xFF
    for i in range(10):
        raw[0xB9 + 21 * i] = 0xFF
    m.put(SCREEN, raw)
    for page in range(3):
        for row in range(10):
            address = 0x08600000 + 32 * (page * 10 + row)
            m.put(0x082F2BA8 + 4 * (page * 10 + row), struct.pack("<I", address))
            m.put(address, text("ABCDE") + b"\xff")
    for i, label in enumerate(["UPPER", "lower", "SYMBOLS", "REGISTER", "EXIT"]):
        address = 0x08605000 + 32 * i
        m.put(0x082F2DC8 + 8 * i, struct.pack("<I", address))
        m.put(address, text(label) + b"\xff")
    return m


def test_chat_room_keyboard_message_and_emoji_are_observable_without_guessing():
    m = chat_room()
    m.put(SCREEN + 0x11, b"\x02\x00")
    m.put(SCREEN + 0x1A, text("HELLO") + b"\xff")
    ui = read_extra_menu(m.read, 0x0801DF39)
    assert (ui.selected, ui.ready) == ("C", True)
    assert ui.details["input_message"] == "HELLO"
    m.put(0x08600000, b"\xf9\xe7\xf9\xed\xf9\xee\xf9\xe8\xf9\xe9\xff")
    assert read_extra_menu(m.read, 0x0801DF39).selected == "EMOJI_WATER"
    m.put(0x08600000, b"\xf9\x18\xff")
    assert "multibyte glyph" in read_extra_menu(m.read, 0x0801DF39).diagnostic


def test_chat_room_registered_phrase_page_and_transition():
    m = chat_room()
    m.put(SCREEN + 0x10, b"\x03")
    m.put(SCREEN + 0xB9, text("HELLO") + b"\xff")
    assert read_extra_menu(m.read, 0x0801DF39).selected == "HELLO"
    m.put(SCREEN + 6, b"\x01\x00")
    assert read_extra_menu(m.read, 0x0801DF39).ready is False
    m = chat_room(2, 2)
    menu(m, 4, 4, 0)
    window(m, 0, 0, 5, 8, True)
    ui = read_extra_menu(m.read, 0x0801DF39)
    assert ui.selected == "EXIT" and ui.details["options"][1] == "lower"


@pytest.mark.parametrize("function,state", [(3, 2), (3, 8), (9, 2), (9, 5)])
def test_chat_room_quit_and_save_confirmations(function, state):
    m = chat_room(function, state)
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    assert read_extra_menu(m.read, 0x0801DF39).selected == "NO"
    window(m, 0, 0, 5, 4, False)
    assert read_extra_menu(m.read, 0x0801DF39).diagnostic


def test_chat_room_source_rejects_impossible_hole_phase():
    m = chat_room(3, 6)
    assert read_extra_menu(m.read, 0x0801DF39).diagnostic


def test_pokeblock_toss_result_keeps_slot_context():
    m = Memory()
    m.put(0x0203AB50, struct.pack("<I", SCREEN))
    m.put(0x0203CE7C, struct.pack("<H", 12))
    put_task(m, 0, 0x08136BC1, [])
    ui = read_extra_menu(m.read, 0x0813591D)
    assert ui.selected == "CONTINUE" and ui.details["pokeblock_slot"] == 12


@pytest.mark.parametrize(
    "quantity,available,valid", [(1, 5, True), (5, 5, True), (6, 5, False), (0, 5, False)]
)
def test_pyramid_toss_quantity_bounded_by_real_stack(quantity, available, valid):
    from pokebench_env.pokemon import ITEMS

    m = Memory()
    m.put(0x0203CF2C, struct.pack("<I", SCREEN))
    m.put(0x0203CE7C, struct.pack("<H", 13))
    m.put(ITEMS + 44 * 13, (text("POTION") + b"\xff").ljust(14, b"\x00") + struct.pack("<H", 13))
    data = [0, 0, available, 0, 0, 0, 0, 0, quantity]
    put_task(m, 0, 0x081C64B5, data)
    ui = read_extra_menu(m.read, 0x081C501D)
    assert (ui.diagnostic is None) == valid
    if valid:
        assert ui.selected == str(quantity) and ui.details["item_name"] == "POTION"


def test_trade_actions_and_party_slots_are_bound_to_live_trade_owner():
    m = factory(False)
    # Replace Factory task ownership; its Pokémon fixtures are also a valid linked team.
    m.put(TASKS + 4, b"\x00")
    m.put(0x0203229C, struct.pack("<I", SCREEN))
    m.put(SCREEN, bytes(0x80))
    m.put(SCREEN + 0x36, b"\x03\x03")
    m.put(SCREEN + 0x38, b"\x01" * 12)
    ui = read_extra_menu(m.read, 0x0807825D)
    assert ui.selected == "TORCHIC" and ui.details["selected_side"] == "player"
    m.put(SCREEN + 0x35, b"\x06")
    assert read_extra_menu(m.read, 0x0807825D).details["selected_side"] == "partner"
    m.put(SCREEN + 0x35, b"\x0c")
    assert read_extra_menu(m.read, 0x0807825D).selected == "CANCEL"
    m.put(SCREEN + 0x6F, b"\x01")
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    assert read_extra_menu(m.read, 0x0807825D).selected == "TRADE"
    m.put(SCREEN + 0x6F, b"\x03")
    assert read_extra_menu(m.read, 0x0807825D).selected == "NO"
    m.put(SCREEN + 0x6F, b"\xff")
    assert "callback" in read_extra_menu(m.read, 0x0807825D).diagnostic


@pytest.mark.parametrize(
    "callback,pointer,function",
    [(0x0813591D, 0x0203AB50, 0x081365C9), (0x081C501D, 0x0203CF2C, 0x081C5BC9)],
)
def test_case_lists_use_real_list_task_text_and_cancel_boundary(callback, pointer, function):
    m = Memory()
    m.put(pointer, struct.pack("<I", 0x02015000))
    put_task(m, 0, function, [1])
    list_task(m, 1)
    ui = read_extra_menu(m.read, callback)
    assert ui.selected == "POTION" and ui.details["selected_item_id"] == 13
    m.put(TASKS + 40 + 4, b"\x00")
    assert read_extra_menu(m.read, callback).diagnostic


def test_union_room_interaction_list_and_confirmation_use_distinct_owners():
    m = Memory()
    m.put(0x02022C30, struct.pack("<I", 0x02015000))
    put_task(m, 0, 0x080156E1, [])
    m.put(0x02015000 + 0x14, b"\x06\x00\x02")
    m.put(0x02015000 + 0x1C, b"\x01")
    list_task(m, 1)
    ui = read_extra_menu(m.read, 0x08085E5D)
    assert ui.selected == "POTION" and ui.ready is True
    m.put(0x02015000 + 0x14, b"\x09")
    menu(m, 1, 1, 0)
    window(m, 0, 0, 5, 4, True)
    assert read_extra_menu(m.read, 0x08085E5D).selected == "NO"
    m.put(0x02015000 + 0x14, b"\xff")
    assert read_extra_menu(m.read, 0x08085E5D).diagnostic


def test_contest_results_continuation_is_bound_to_result_task():
    m = Memory()
    m.put(0x0203A034, struct.pack("<I", 0x02013000))
    m.put(0x02013000, struct.pack("<II", SCREEN, 0x02014000))
    m.put(0x02014000, struct.pack("<iiII", 17, -10, 8, 9))
    assert read_extra_menu(m.read, 0x080F5C01).ready is False
    put_task(m, 0, 0x080F66B5, [])
    ui = read_extra_menu(m.read, 0x080F5C01)
    assert ui.selected == "CONTINUE" and ui.details["round_two_relative_points"][0] == -10


def test_feeding_records_pokemon_block_and_automatic_animation():
    m = factory(False)
    m.put(TASKS + 4, b"\x00")
    m.put(0x0203BD18, struct.pack("<I", SCREEN))
    m.put(0x03005D8C, struct.pack("<I", 0x02015000))
    m.put(0x02015000 + 0x848, bytes([1, 5, 6, 7, 8, 9, 12, 0]))
    ui = read_extra_menu(m.read, 0x08179B69)
    assert ui.selected == "TORCHIC" and ui.ready is False
    assert ui.details["pokeblock_flavors"] == [5, 6, 7, 8, 9]


@pytest.mark.parametrize(
    "callback,function,state,offset,delay",
    [(0x080261CD, 6, 4, 0x317C, 29), (0x08020F89, 18, 2, 0x138, 0), (0x0802AC6D, 7, 2, 0, 0)],
)
def test_results_prompts_delay_input_until_game_owned_transition(
    callback, function, state, offset, delay
):
    m = linked(callback, function)
    if callback == 0x080261CD:
        m.put(SCREEN + 0x3174, bytes([state]))
        m.put(SCREEN + offset, struct.pack("<H", delay))
    elif callback == 0x08020F89:
        m.put(SCREEN + 12, bytes([state]))
    else:
        m.put(SCREEN + 10, struct.pack("<H", state))
    ui = read_extra_menu(m.read, callback)
    assert ui.selected == "CONTINUE" and ui.ready is True
    if callback != 0x0802AC6D:
        m.put(SCREEN + offset, bytes([28 if callback == 0x080261CD else 1]))
        assert read_extra_menu(m.read, callback).ready is False


@pytest.mark.parametrize("function", [0x08022251, 0x0802E3E5])
def test_minigame_records_continuation_requires_drawn_owner_window(function):
    m = Memory()
    put_task(m, 0, function, [2, 0, 100, 200, 300, 400])
    m.put(0x03005D90, struct.pack("<I", SCREEN))
    m.put(SCREEN + 0x1FC, struct.pack("<4H2I", 12, 0, 6, 1, 0, 98765))
    assert read_extra_menu(m.read, 0x08085E5D).diagnostic
    window(m, 0, 0, 5, 4, True)
    ui = read_extra_menu(m.read, 0x08085E5D)
    assert ui.selected == "CONTINUE" and ui.ready is True
    if function == 0x0802E3E5:
        assert ui.details["best_jump_score"] == 98765
    else:
        assert ui.details["pressing_speeds_fixed_8_8"] == [100, 200, 300, 400]


def test_trade_animation_confirmation_is_only_for_in_game_final_message():
    m = factory(False)
    m.put(TASKS + 4, b"\x00")
    m.put(0x020322A0, struct.pack("<I", 0x02015000))
    m.put(0x02015000 + 0x94, struct.pack("<H", 71))
    ui = read_extra_menu(m.read, 0x0807B60D)
    assert ui.ready is True and ui.selected == "CONTINUE"
    m.put(0x02015000 + 0xEE, b"\x01")
    assert read_extra_menu(m.read, 0x0807EA11).ready is False
    m.put(0x02015000 + 0x94, struct.pack("<H", 2))
    assert "state" in read_extra_menu(m.read, 0x0807B60D).diagnostic


def test_contest_painting_winner_and_close_input_use_native_hold_state():
    from pokebench_env.pokemon import SPECIES_NAMES

    m = Memory()
    m.put(0x030061C0, struct.pack("<I", SCREEN))
    body = bytearray(32)
    struct.pack_into("<H", body, 8, 280)
    body[11:17] = text("BLAZE") + b"\xff"
    body[22:28] = text("HUMAN") + b"\xff"
    m.put(SCREEN, body)
    m.put(SPECIES_NAMES + 11 * 280, text("TORCHIC") + b"\xff")
    assert read_extra_menu(m.read, 0x0812FDF9).ready is False
    m.put(0x030011F0, b"\x01")
    ui = read_extra_menu(m.read, 0x0812FDF9)
    assert ui.selected == "CLOSE" and ui.details["pokemon_name"] == "BLAZE"
    m.put(0x030011F0, b"\x02")
    assert read_extra_menu(m.read, 0x0812FDF9).ready is False
    assert read_extra_menu(m.read, 0x0812FE0D).ready is False


def test_factory_opponent_side_and_swap_popup_use_their_actual_action_owners():
    m = factory(False)
    m.put(SCREEN + 0x0E, b"\x01")
    m.put(SCREEN + 0x11, b"\x05")
    m.put(SCREEN + 3, b"\x03")
    for i, action in enumerate([1, 1, 1, 2, 3]):
        m.put(0x08550000 + 8 * i, bytes([action]))
    ui = read_extra_menu(m.read, 0x0819C7E1)
    assert ui.selected == "POKÉMON FOR SWAP" and ui.ready
    assert ui.details["options"] == ["TORCHIC", "TORCHIC", "TORCHIC", "POKÉMON FOR SWAP", "CANCEL"]
    m = factory(False, 0x0819CD35, 3)
    m.put(SCREEN, b"\x02")
    ui = read_extra_menu(m.read, 0x0819C7E1)
    assert ui.phase == "factory_swap_actions" and ui.selected == "RECHOOSE" and ui.ready
    m.put(SCREEN, b"\x03")
    assert "cursor" in read_extra_menu(m.read, 0x0819C7E1).diagnostic


def test_factory_duplicate_species_message_and_transition_readiness():
    m = factory(False, 0x0819F489, 1)
    ui = read_extra_menu(m.read, 0x0819C7E1)
    assert ui.phase == "factory_swap_duplicate_species" and ui.selected == "CONTINUE" and ui.ready
    m.put(SCREEN + 0x30, b"\x01")
    assert read_extra_menu(m.read, 0x0819C7E1).ready is False
    for function, state in [(0x0819F489, 0), (0x0819CE41, 0), (0x0819CD35, 2), (0x0819CB1D, 4)]:
        ui = read_extra_menu(factory(False, function, state).read, 0x0819C7E1)
        assert ui.ready is False and ui.diagnostic is None
    assert read_extra_menu(factory(False, 0x0819F489, 5).read, 0x0819C7E1).diagnostic


def test_pyramid_bag_dynamic_action_labels_and_native_error_continuation():
    from pokebench_env.pokemon import ITEMS

    m = Memory()
    m.put(0x0203CF2C, struct.pack("<I", SCREEN))
    put_task(m, 0, 0x081C5F69, [0])
    window(m, 0, 0, 10, 8, True)
    menu(m, 1, 2, 0)
    m.put(SCREEN + 0x820, b"\x03")
    m.put(SCREEN + 0x818, struct.pack("<I", 0x08550000))
    m.put(0x08550000, bytes([0, 2, 5]))
    for action, label in [(0, "USE"), (2, "TOSS"), (5, "CANCEL")]:
        pointer = 0x08551000 + 64 * action
        m.put(0x0861F2D8 + 8 * action, struct.pack("<I", pointer))
        m.put(pointer, text(label) + b"\xff")
    ui = read_extra_menu(m.read, 0x081C501D)
    assert ui.phase == "pyramid_bag_actions" and ui.selected == "TOSS" and ui.ready
    assert ui.details["options"] == ["USE", "TOSS", "CANCEL"]
    m.put(0x08550000, bytes([0, 6, 5]))
    assert "action ID" in read_extra_menu(m.read, 0x081C501D).diagnostic
    m.put(0x0203CE7C, struct.pack("<H", 13))
    m.put(ITEMS + 44 * 13, (text("POTION") + b"\xff").ljust(14, b"\x00") + struct.pack("<H", 13))
    put_task(m, 0, 0x081C66ED, [0])
    ui = read_extra_menu(m.read, 0x081C501D)
    assert ui.phase == "pyramid_bag_error_message" and ui.selected == "CONTINUE"
