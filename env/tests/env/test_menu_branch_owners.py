"""Adversarial coherent snapshots and subsidiary native input phases."""

import struct

import pytest

from pokebench_env.game_screen import TASKS
from pokebench_env.menus import PALETTE_FADE
from pokebench_env.menus_extra import (
    EASY_CHAT_CALLBACK,
    EASY_CHAT_WORD_DATA,
    MAIL_CALLBACK,
    MYSTERY_GIFT_CALLBACK,
    MYSTERY_GIFT_TASK,
    read_extra_menu,
)
from pokebench_env.pokemon import MOVE_NAMES, SPECIES_NAMES
from tests.env.test_menus import put_task
from tests.env.test_menus_extra import MAIL, SCREEN, WORD_DATA, chat, factory, mail
from tests.env.test_ui_state import Memory, menu, text, window


@pytest.mark.parametrize(
    "code,label",
    [
        (280, "TORCHIC"),
        (21 * 512 + 280, "TORCHIC"),
        (18 * 512 + 55, "WATER GUN"),
        (19 * 512 + 55, "WATER GUN"),
    ],
)
def test_easy_chat_species_and_move_dictionary_words(code, label):
    m = chat()
    m.put(SPECIES_NAMES + 11 * 280, text("TORCHIC") + b"\xff")
    m.put(MOVE_NAMES + 13 * 55, text("WATER GUN") + b"\xff")
    m.put(SCREEN + 0x3C, struct.pack("<H", code))
    ui = read_extra_menu(m.read, EASY_CHAT_CALLBACK)
    assert ui.selected == label and ui.details["phrase_words"][0] == label


@pytest.mark.parametrize(
    "phase,address,payload,reason",
    [
        (0, SCREEN + 0x3C, struct.pack("<H", 22 * 512), "word group"),
        (0, SCREEN + 0x3C, struct.pack("<H", 0), "Pokémon word"),
        (0, SCREEN + 0x3C, struct.pack("<H", 18 * 512), "move word"),
        (0, SCREEN + 0x3C, struct.pack("<H", 513), "dictionary index"),
        (0, SCREEN, b"\x15", "layout"),
        (0, SCREEN + 7, b"\x00", "phrase length"),
        (1, SCREEN + 5, b"\x03", "footer cursor"),
        (2, SCREEN + 0xA, struct.pack("<bb", -1, 3), "keyboard button"),
        (2, EASY_CHAT_WORD_DATA, bytes(4), "word-data pointer"),
        (2, WORD_DATA, b"\x00\x00", "group cursor"),
        (2, WORD_DATA + 2, b"\x16\x00", "unlocked group"),
        (3, EASY_CHAT_WORD_DATA, bytes(4), "word-data pointer"),
    ],
)
def test_invalid_native_easy_chat_words_and_owner_fields_are_diagnosed(
    phase, address, payload, reason
):
    m = chat(phase)
    m.put(address, payload)
    ui = read_extra_menu(m.read, EASY_CHAT_CALLBACK)
    assert ui.ready is None and reason in ui.diagnostic


@pytest.mark.parametrize(
    "address,payload,reason",
    [
        (MAIL + 0x214, bytes(4), "mail data pointer"),
        (MAIL + 0x228, bytes(4), "layout pointer"),
        (0x08510000, b"\x00", "line count"),
        (MAIL, bytes(64), "unterminated mail"),
    ],
)
def test_mail_wrong_pointer_layout_and_unterminated_content_are_bugs(address, payload, reason):
    m = mail()
    m.put(address, payload)
    ui = read_extra_menu(m.read, MAIL_CALLBACK)
    assert ui.ready is None and reason in ui.diagnostic


@pytest.mark.parametrize("phase", [9, 11, 12, 22, 23])
def test_mystery_gift_prompt_readiness_is_bound_to_drawn_yes_no(phase):
    m = Memory()
    data = [0] * 16
    data[4] = phase
    put_task(m, 0, MYSTERY_GIFT_TASK, data)
    ui = read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK)
    assert ui.ready is False
    menu(m, 1, 1, 0)
    window(m, 0, 0, 8, 4, True)
    ui = read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK)
    assert ui.selected == "NO" and ui.ready is True
    m.put(PALETTE_FADE + 7, b"\x80")
    assert read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK).ready is False


def test_mystery_gift_owner_loss_and_card_content():
    m = Memory()
    assert "input task" in read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK).diagnostic
    data = [0] * 16
    data[4] = 20
    put_task(m, 0, MYSTERY_GIFT_TASK, data)
    assert read_extra_menu(m.read, MYSTERY_GIFT_CALLBACK).selected == "VIEW WONDER CARD"


def block():
    m = Memory()
    m.put(0x0203AB50, struct.pack("<I", SCREEN))
    put_task(m, 0, 0x081369E1, [0])
    m.put(SCREEN + 0x804, struct.pack("<I", 0x08550000))
    m.put(SCREEN + 0x808, b"\x03")
    m.put(0x08550000, bytes([0, 1, 5]))
    menu(m, 1, 2, 0)
    window(m, 0, 0, 10, 8, True)
    for action, label in [(0, "GIVE"), (1, "TOSS"), (5, "CANCEL")]:
        p = 0x08551000 + 64 * action
        m.put(0x085B2668 + 8 * action, struct.pack("<I", p))
        m.put(p, text(label) + b"\xff")
    return m


def test_pokeblock_dynamic_action_labels_and_selection():
    ui = read_extra_menu(block().read, 0x0813591D)
    assert ui.phase == "pokeblock_actions" and ui.selected == "TOSS" and ui.ready
    assert ui.details["options"] == ["GIVE", "TOSS", "CANCEL"]


@pytest.mark.parametrize(
    "address,payload,reason",
    [
        (TASKS + 4, b"\x00", "input owner"),
        (0x0203AB50, bytes(4), "menu pointer"),
        (SCREEN + 0x808, b"\x00", "action menu"),
        (SCREEN + 0x804, bytes(4), "action table"),
        (0x08550000, b"\x06", "action ID"),
    ],
)
def test_pokeblock_wrong_native_owner_or_action_table_is_a_bug(address, payload, reason):
    m = block()
    m.put(address, payload)
    ui = read_extra_menu(m.read, 0x0813591D)
    assert ui.ready is None and reason in ui.diagnostic


@pytest.mark.parametrize(
    "function,state,expected",
    [
        (0x0819B379, 0, None),
        (0x0819B379, 11, "CONTINUE"),
        (0x0819B125, 2, None),
        (0x0819B125, 9, None),
        (0x0819B02D, 4, None),
        (0x0819B02D, 10, None),
    ],
)
def test_factory_source_passive_and_message_states(function, state, expected):
    ui = read_extra_menu(factory(True, function, state).read, 0x0819A4C9)
    assert ui.selected == expected and ui.ready == (expected is not None) and ui.diagnostic is None


@pytest.mark.parametrize(
    "function,state,reason",
    [
        (0x0819B379, 12, "rental input phase"),
        (0x0819B125, 0, "rental action phase"),
        (0x0819B02D, 0, "rental confirmation phase"),
        (0x0819CD35, 0, "swap action phase"),
        (0x0819CE41, 2, "swap input phase"),
        (0x0819CB1D, 0, "swap confirmation phase"),
    ],
)
def test_factory_unassigned_state_holes_are_harness_bugs(function, state, reason):
    selecting = function in (0x0819B379, 0x0819B125, 0x0819B02D)
    ui = read_extra_menu(
        factory(selecting, function, state).read, 0x0819A4C9 if selecting else 0x0819C7E1
    )
    assert ui.ready is None and reason in ui.diagnostic


@pytest.mark.parametrize("kind", ["checksum", "graphics_task", "learning_phase", "move"])
def test_evolution_invalid_pokemon_or_owner_does_not_emit_ready_input(kind):
    from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
    from tests.env.test_menu_pokemon_lifecycle import evo

    m = evo(
        22 if kind in ("learning_phase", "move") else 8,
        move_state=13 if kind == "learning_phase" else 0,
    )
    if kind == "checksum":
        m.put(0x020244EC + 28, bytes(2))
    elif kind == "graphics_task":
        m.put(0x02024334, b"\x10")
    elif kind == "move":
        m.put(0x02022F58, bytes(2))
    ui = read_pokemon_lifecycle_menu(m.read, 0x0813E3A5)
    assert ui.ready is None and ui.diagnostic


def test_evolution_move_learning_outside_confirmation_is_passive():
    from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
    from tests.env.test_menu_pokemon_lifecycle import evo

    ui = read_pokemon_lifecycle_menu(evo(22, move_state=0).read, 0x0813E3A5)
    assert ui.phase == "evolution_move_learning" and ui.ready is False


@pytest.mark.parametrize("kind", ["owner", "count", "phase", "confirmation", "results"])
def test_pokeblock_recipient_malformed_phases_and_lists_are_explicit(kind):
    from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
    from tests.env.test_menu_pokemon_lifecycle import SCREEN as LIFE
    from tests.env.test_menu_pokemon_lifecycle import recipient

    m = recipient(
        0x08166A35 if kind == "results" else 0x08166635,
        6 if kind in ("confirmation", "results") else 0,
    )
    if kind == "owner":
        m.put(0x0203BC90, bytes(4))
    elif kind == "count":
        m.put(LIFE + 0x7FD0 + 0x70, b"\x00")
    elif kind == "phase":
        m.put(LIFE + 0x7FD0 + 0x50, b"\x02")
    ui = read_pokemon_lifecycle_menu(m.read, 0x0816631D)
    assert ui.ready is None and ui.diagnostic


def test_pokeblock_results_automatic_phase_remains_not_ready():
    from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
    from tests.env.test_menu_pokemon_lifecycle import recipient

    ui = read_pokemon_lifecycle_menu(recipient(0x08166A35, 0).read, 0x0816631D)
    assert ui.phase == "pokeblock_results" and ui.ready is False


@pytest.mark.parametrize("kind", ["owner", "state", "menu"])
def test_hatch_wrong_owner_phase_and_unavailable_confirmation_are_bugs(kind):
    from pokebench_env.menu_pokemon_lifecycle import read_pokemon_lifecycle_menu
    from tests.env.test_menu_pokemon_lifecycle import SCREEN as LIFE
    from tests.env.test_menu_pokemon_lifecycle import game

    m = game()
    m.put(0x03000DE0, struct.pack("<I", 0 if kind == "owner" else LIFE))
    m.put(LIFE + 2, bytes([13 if kind == "state" else 10]))
    ui = read_pokemon_lifecycle_menu(m.read, 0x08071A95)
    assert ui.ready is None and ui.diagnostic


@pytest.mark.parametrize(
    "kind",
    [
        "category",
        "inventory_pointer",
        "capacity",
        "inventory_id",
        "placement_command",
        "camera",
        "movement",
    ],
)
def test_decoration_native_inventory_and_placement_owner_corruption_is_visible(kind):
    from pokebench_env.menus_misc import SPRITES, read_misc_menu
    from tests.env.test_menus_misc import decor

    placing = kind in ("placement_command", "camera", "movement")
    m = decor(0x08128E19 if placing else 0x08126B81)
    if kind == "category":
        m.put(0x0203A173, b"\x08")
    elif kind == "inventory_pointer":
        m.put(0x0203BC40, bytes(4))
    elif kind == "capacity":
        m.put(0x0203BC40 + 4, b"\x09")
    elif kind == "inventory_id":
        m.put(0x02015000 + 128, b"\x79")
    elif kind == "placement_command":
        put_task(m, 0, 0x08128E19, [7, 8, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 2])
    elif kind == "camera":
        m.put(0x0203AA38, b"\x40")
    else:
        m.put(SPRITES + 0x36, struct.pack("<h", -1))
    ui = read_misc_menu(m.read, 0x08085E5D)
    assert ui.ready is None and ui.diagnostic


@pytest.mark.parametrize(
    "kind",
    [
        "empty_quantity",
        "nonberry",
        "counter",
        "current_box",
        "nickname",
        "script",
        "object_id",
        "object",
    ],
)
def test_resource_corrupt_subowners_are_bounded_native_diagnostics(kind):
    from pokebench_env.live_map import OBJECT_EVENTS
    from pokebench_env.resources import read_resources
    from tests.env.test_pokemon import fixture
    from tests.env.test_resources import KEY, SB1, SB2, STORAGE, memory

    m = memory()
    if kind == "empty_quantity":
        m.put(SB1 + 0x560, struct.pack("<HH", 0, 1 ^ (KEY & 0xFFFF)))
    elif kind == "nonberry":
        m.put(SB1 + 0x790, struct.pack("<HH", 13, 1 ^ (KEY & 0xFFFF)))
    elif kind == "counter":
        m.put(SB1 + 0x159C + 12, struct.pack("<I", 0x1000000 ^ KEY))
    elif kind == "current_box":
        m.put(STORAGE, b"\x0e")
    elif kind == "nickname":
        raw, rom = fixture()
        body = bytearray(raw[:80])
        body[8] = 0xFD
        body[18] = 2
        m.put(STORAGE + 4, body)
        original = m.read

        def read(a, n):
            return rom(a, n) if a >= 0x08000000 else original(a, n)
    elif kind == "script":
        m.put(0x03000E40 + 1, b"\x03")
    else:
        m.put(0x03000E40 + 1, b"\x01")
        m.put(0x03000E40 + 8, struct.pack("<I", 0x0827445C))
        m.put(0x03005DF0, b"\x10" if kind == "object_id" else b"\x00")
        m.put(OBJECT_EVENTS, bytes(0x24))
    result = read_resources(read if kind == "nickname" else m.read, SB1, SB2)
    assert result.diagnostics and all(
        d.message.startswith("harness bug:") for d in result.diagnostics
    )
    if kind == "nickname":
        assert result.storage.occupied[0].pokemon.species_id == 280
        assert result.diagnostics[0].owner == "storage_nickname:0:0"


@pytest.mark.parametrize(
    "kind",
    [
        "owned_pointer",
        "decoration_id",
        "table_id",
        "duplicate",
        "registry_count",
        "registry_item",
        "registry_menu",
        "hof_pointer",
    ],
)
def test_misc_bad_native_inventory_registry_and_hof_owners_are_bugs(kind):
    from pokebench_env.menus_misc import DECORATIONS, read_misc_menu
    from tests.env.test_menus import list_task
    from tests.env.test_menus_misc import SCREEN as MISC
    from tests.env.test_menus_misc import decor, decoration, hof

    m = decor()
    if kind in ("owned_pointer", "decoration_id", "table_id"):
        m.put(0x0203A151, b"\x01")
        m.put(0x0203A14C, struct.pack("<I", 0 if kind == "owned_pointer" else MISC + 32))
        m.put(MISC + 32, b"\x00" if kind == "decoration_id" else b"\x01")
        decoration(m, 1, "DESK")
        if kind == "table_id":
            m.put(DECORATIONS + 32, b"\x02")
    elif kind == "duplicate":
        put_task(m, 1, 0x08126B81, [0])
    elif kind == "registry_count":
        put_task(m, 0, 0x080E9C9D, [21])
    elif kind == "registry_item":
        put_task(m, 0, 0x080E9E91, [0, 0, 0, 0, 0, 1])
        list_task(m, 1)
        m.put(0x02011000 + 4, struct.pack("<i", 20))
    elif kind == "registry_menu":
        put_task(m, 0, 0x080E9FB1, [0])
        window(m, 0, 0, 18, 8, False)
    else:
        m = hof()
        m.put(0x0203BCD8, bytes(4))
    ui = read_misc_menu(m.read, 0x08173561 if kind == "hof_pointer" else 0x08085E5D)
    assert ui.ready is None and ui.diagnostic


def test_misc_unowned_message_and_initialization_do_not_claim_input():
    from pokebench_env.menus_misc import read_misc_menu
    from tests.env.test_menus_misc import decor, hof

    m = decor(0x08121F3D)
    m.put(0x0300117C, struct.pack("<I", 0x08000001))
    assert read_misc_menu(m.read, 0x08085E5D) is None
    m = decor(0x080E9C9D)
    assert read_misc_menu(m.read, 0x08085E5D).ready is False
    for function in (0x0817371D, 0x081738BD, 0x08174325, 0x081749A1):
        assert read_misc_menu(hof(function=function).read, 0x08173561).ready is False
