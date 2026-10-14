import struct

import pytest
from test_game_state import Memory

from pokebench_env.party_ownership import FACILITY_MONS_POINTER, read_party_ownership
from pokebench_env.pokemon import PartyMon


def mon(personality, species=25, ot=0):
    return PartyMon(
        "PIKACHU",
        50,
        100,
        100,
        identity=f"{personality:08x}:{ot:08x}",
        species_id=species,
        personality=personality,
        ot_id=ot,
    )


def fixture(map_id=(26, 32), callback=0x08085E5D, table=0x085D97BC):
    m = Memory()
    save1, save2 = 0x02025000, 0x02030000
    m.put(0x03005D8C, struct.pack("<II", save1, save2))
    m.put(save1 + 4, bytes(map_id))
    m.put(0x030022C4, struct.pack("<I", callback))
    m.put(save1 + 0x234, b"\x01")
    body = bytearray(100)
    body[19] = 2
    struct.pack_into("<II", body, 0, 99, 4)
    m.put(save1 + 0x238, body)
    m.put(save1 + 0x153A, struct.pack("<H", 4))
    m.put(FACILITY_MONS_POINTER, struct.pack("<I", table))
    for index in range(3):
        m.put(save2 + 0xE70 + index * 12, struct.pack("<H2xIBB2x", index, index + 1, 31, 0))
        m.put(table + index * 16, struct.pack("<H", 25))
    m.put(save2 + 0xA, struct.pack("<I", 4))
    return m


@pytest.mark.parametrize("map_id", [(26, 31), (26, 32), (26, 33), (9, 2), (9, 3), (9, 4)])
def test_native_rentals_are_owned_outside_battle_in_factory_and_tent(map_id):
    s = read_party_ownership(fixture(map_id).read, tuple(mon(i) for i in (1, 2, 3)))
    assert s.owner == "rental" and s.original_identities == ("00000063:00000004",)


def test_resume_reconstructed_rental_player_ot_is_valid():
    s = read_party_ownership(fixture().read, tuple(mon(i, ot=4) for i in (1, 2, 3)))
    assert s.owner == "rental"


def test_unrelated_map_does_not_use_stale_rental_state_to_suppress_acquire():
    s = read_party_ownership(fixture((0, 16)).read, tuple(mon(i) for i in (1, 2, 3)))
    assert s.owner == "player" and not s.original_identities


def test_restored_original_ids_provide_owned_baseline():
    s = read_party_ownership(fixture().read, (mon(99, ot=4),))
    assert s.owner == "player" and s.source == "saved_original_party"


def test_genuine_new_player_mon_is_not_suppressed_by_factory_map():
    s = read_party_ownership(fixture().read, (mon(77, ot=4),))
    assert s.owner == "player" and s.source == "no_native_rental_match"


def test_native_partial_rental_copy_is_unavailable_instead_of_acquired():
    s = read_party_ownership(fixture().read, (mon(1), mon(99, ot=4)))
    assert s.owner is None and s.source == "native_rental_party_transition"


def test_rental_screen_initial_unselected_copy_has_unknown_owner():
    s = read_party_ownership(fixture(callback=0x0819A4C9).read, (mon(77),))
    assert s.owner is None


def test_pike_uses_original_party_even_if_rental_fields_are_stale():
    m = fixture()
    m.put(0x02025000 + 0x153A, struct.pack("<H", 5))
    s = read_party_ownership(m.read, (mon(99, ot=4),))
    assert s.owner == "player" and s.original_identities


def test_alt_slateport_tent_table_is_qualified():
    assert (
        read_party_ownership(
            fixture((9, 3), table=0x085DE02C).read, tuple(mon(i) for i in (1, 2, 3))
        ).owner
        == "rental"
    )


@pytest.mark.parametrize(
    "address,body,message",
    [
        (0x02025000 + 0x234, b"\x07", "count"),
        (FACILITY_MONS_POINTER, struct.pack("<I", 0x08500000), "table"),
        (0x085D97BC, b"\0\0", "species"),
    ],
)
def test_impossible_native_ownership_data_is_explicit_bug(address, body, message):
    m = fixture()
    m.put(address, body)
    s = read_party_ownership(m.read, tuple(mon(i) for i in (1, 2, 3)))
    assert s.owner is None and "harness bug" in s.diagnostic and message in s.diagnostic


def test_saved_original_copy_without_species_header_is_not_owned_baseline():
    m = fixture()
    m.put(0x02025000 + 0x238 + 19, b"\0")
    s = read_party_ownership(m.read, tuple(mon(i) for i in (1, 2, 3)))
    assert s.owner is None and not s.original_identities
    assert "harness bug" in s.diagnostic


def test_wrong_ot_does_not_get_classified_as_native_rental():
    s = read_party_ownership(fixture().read, tuple(mon(i, ot=777) for i in (1, 2, 3)))
    assert s.owner == "player"


def test_unavailable_decode_is_not_classified_by_map_alone():
    s = read_party_ownership(fixture().read, None)
    assert s.owner is None and s.source == "party_decode_unavailable" and s.original_identities


def test_ambiguous_original_and_rental_identity_is_explicit():
    m = fixture()
    m.put(0x02025000 + 0x234, b"\x03")
    for index in range(3):
        body = bytearray(100)
        body[19] = 2
        struct.pack_into("<II", body, 0, index + 1, 0)
        m.put(0x02025000 + 0x238 + index * 100, body)
    s = read_party_ownership(m.read, tuple(mon(i) for i in (1, 2, 3)))
    assert s.owner is None and "overlap" in s.diagnostic
    assert s.json()["owner"] is None


def test_uninitialized_rental_refs_do_not_classify_real_party_as_rentals():
    m = fixture()
    m.put(0x02030000 + 0xE70, b"\xff\xff")
    s = read_party_ownership(m.read, (mon(99, ot=4),))
    assert s.owner == "player"


def test_bad_save_pointer_is_not_an_ownership_default():
    m = fixture()
    m.put(0x03005D8C, bytes(4))
    s = read_party_ownership(m.read, (mon(99),))
    assert s.owner is None and "harness bug" in s.diagnostic


def test_native_rental_battle_flag_independently_establishes_ownership():
    m = fixture((0, 16))
    m.put(0x030026F9, b"\x02")
    m.put(0x02022FEC, struct.pack("<I", 1 << 19))
    m.put(0x02025000 + 0x153A, bytes(2))
    s = read_party_ownership(m.read, (mon(99, ot=4),))
    assert s.owner == "rental" and s.source == "native_rental_battle_flag"


@pytest.mark.parametrize("stacked", [False, True])
def test_wally_field_script_tracks_borrowed_party_during_messages(stacked):
    from dataclasses import replace

    from pokebench_env.party_ownership import SCRIPT_CONTEXT, WALLY_SCRIPT_START

    m = fixture((0, 1))
    context = bytearray(0x5C)
    context[0] = int(stacked)
    context[1] = 2 if stacked else 1
    struct.pack_into("<I", context, 8, 0x081A0000 if stacked else WALLY_SCRIPT_START)
    if stacked:
        struct.pack_into("<I", context, 12, WALLY_SCRIPT_START + 20)
    m.put(SCRIPT_CONTEXT, context)
    borrowed = replace(mon(33, species=288, ot=4), level=7)
    s = read_party_ownership(m.read, (borrowed, mon(99, ot=4)))
    assert s.owner == "tutorial" and s.source == "native_wally_tutorial_script"
    assert s.original_identities == ("00000063:00000004",)
    restored = read_party_ownership(m.read, (mon(99, ot=4),))
    assert restored.owner == "player" and restored.source == "saved_original_party"


def test_wally_battle_has_native_tutorial_owner_independently_of_species():
    m = fixture((0, 1))
    m.put(0x030026F9, b"\x02")
    m.put(0x02022FEC, struct.pack("<I", 1 << 9))
    s = read_party_ownership(m.read, (mon(33),))
    assert s.owner == "tutorial" and s.source == "native_wally_tutorial_battle_flag"


def test_stale_tutorial_flag_does_not_hide_real_player_party():
    m = fixture((0, 1))
    m.put(0x02022FEC, struct.pack("<I", 1 << 9))
    assert read_party_ownership(m.read, (mon(33, species=288),)).owner == "player"


def test_wally_script_unknown_copy_does_not_credit_player_acquire():
    from pokebench_env.party_ownership import SCRIPT_CONTEXT, WALLY_SCRIPT_START

    m = fixture((0, 1))
    m.put(SCRIPT_CONTEXT, b"\0\x01" + bytes(6) + struct.pack("<I", WALLY_SCRIPT_START))
    s = read_party_ownership(m.read, (mon(33),))
    assert s.owner is None and s.source == "native_tutorial_party_transition"


@pytest.mark.parametrize("mode,depth", [(0, 0), (1, 21)])
def test_impossible_wally_script_context_never_claims_tutorial_owner(mode, depth):
    from pokebench_env.party_ownership import SCRIPT_CONTEXT, WALLY_SCRIPT_START

    m = fixture((0, 1))
    context = bytearray(0x5C)
    context[0], context[1] = depth, mode
    struct.pack_into("<I", context, 8, WALLY_SCRIPT_START)
    m.put(SCRIPT_CONTEXT, context)
    state = read_party_ownership(m.read, (mon(33, species=288),))
    assert state.owner is None and "Wally script context" in state.diagnostic
