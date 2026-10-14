import hashlib
import re
import struct
from pathlib import Path

import pytest

from pokebench_env.gba_text import decode_text
from pokebench_env.native_text import decode_native_text
from pokebench_env.pokemon import (
    BATTLE_MOVES,
    ITEMS,
    MOVE_NAMES,
    SUBSTRUCT_ORDERS,
    decode_party_mon,
    read_item_name,
)
from tests.env.test_pokemon import fixture


def test_source_accent_ligature_punctuation_and_language_controls():
    assert decode_text(bytes.fromhex("cac9c51b00bcbbc6c6ff")) == "POKé BALL"
    assert decode_text(bytes.fromhex("555657585900bdbbcdbfff")) == "POKéBLOCK CASE"
    assert decode_native_text(bytes.fromhex("fc159f59737efc16bbff")) == "ポケモンA"
    assert decode_native_text(bytes.fromhex("f9e7ff")) == "EMOJI_HEART"
    assert decode_native_text(bytes.fromhex("fc0ce7ff")) == "EMOJI_HEART"
    assert decode_text(bytes([0xAC, 0xFF])) == "?"  # literal source glyph, not unknown replacement


def test_control_argument_bytes_do_not_change_language_or_line_breaks():
    raw = bytes([0xBB, 0xFC, 4, 0xFE, 0x15, 0xFB, 0xFC, 0x10, 0xFA, 0, 0xFE, 0xBC, 0xFF])
    assert decode_native_text(raw, line_breaks={0xFE: " "}) == "A B"
    assert decode_text(bytes([0, 0xBB, 0, 0xFF])) == " A "


@pytest.mark.parametrize(
    "raw", [b"\x0a\xff", b"\xfc", b"\xfc\x04\x01", b"\xf9", b"\xf9\x18\xff", b"\xfd\x01\xff"]
)
def test_unknown_truncated_or_unexpanded_text_is_explicit(raw):
    with pytest.raises(ValueError):
        decode_native_text(raw)


def test_pokemon_own_name_and_language_do_not_invalidate_secure_fields():
    body, read = fixture()
    raw = bytearray(body)
    raw[8:12] = bytes.fromhex("9f59737e")
    raw[12] = 0xFF
    raw[0x12] = 1
    mon = decode_party_mon(bytes(raw), read)
    assert mon.species == "TORCHIC" and mon.nickname == "ポケモン" and mon.language == 1
    raw[0x12] = 0xFE
    mon = decode_party_mon(bytes(raw), read)
    assert mon.species == "TORCHIC" and mon.diagnostic is None
    assert mon.nickname is None and "nickname language" in mon.nickname_diagnostic
    assert mon.raw_hex == raw.hex()


def exact_rom():
    path = Path.home() / ".roms/pokemon-emerald.gba"
    if not path.exists():
        pytest.skip("qualified local Emerald ROM unavailable")
    rom = path.read_bytes()
    assert hashlib.sha1(rom).hexdigest() == "f3ae088181bf583e55daf962a92bb46f4f1d07b7"

    def read(address, length):
        return rom[address - 0x08000000 : address - 0x08000000 + length]

    return read


def test_all_real_species_moves_and_item_rows_through_production_decoder():
    read = exact_rom()
    source = Path("/Users/user/dev/pokeemerald")
    if not source.exists():
        pytest.skip("pinned primary source unavailable")
    definitions = {
        name: int(value)
        for name, value in re.findall(
            r"#define\s+(SPECIES_\w+)\s+(\d+)\b",
            (source / "include/constants/species.h").read_text(),
        )
    }
    names = {
        definitions[name]: value
        for name, value in re.findall(
            r'\[(SPECIES_\w+)\]\s*= _\("([^\"]+)"\)',
            (source / "src/data/text/species_names.h").read_text(),
        )
        if name in definitions
    }
    decoded = 0
    for species in range(1, 412):
        body, _ = fixture(species=species)
        mon = decode_party_mon(body, read)
        if 252 <= species <= 276:
            assert mon.species_id == species and "reserved OLD_UNOWN" in mon.diagnostic
        else:
            assert mon.diagnostic is None, (species, mon.diagnostic)
            assert mon.species == names[species]
            decoded += 1
    assert decoded == 386
    assert names[29] == "NIDORAN♀" and names[32] == "NIDORAN♂"
    assert names[83] == "FARFETCH'D" and names[122] == "MR. MIME"
    body, _ = fixture(plain=True)
    order = SUBSTRUCT_ORDERS[int.from_bytes(body[:4], "little") % 24]
    growth = 0x20 + 12 * order.index("G")
    attacks = 0x20 + 12 * order.index("A")
    for move in range(1, 355):
        raw = bytearray(body)
        raw[growth + 8] = 0
        struct.pack_into(
            "<4H4B", raw, attacks, move, 0, 0, 0, read(BATTLE_MOVES + 12 * move + 4, 1)[0], 0, 0, 0
        )
        struct.pack_into("<H", raw, 0x1C, sum(struct.unpack("<24H", raw[0x20:0x50])) & 0xFFFF)
        mon = decode_party_mon(bytes(raw), read)
        assert mon.diagnostic is None, (move, mon.diagnostic)
        assert mon.moves[0].name == decode_text(read(MOVE_NAMES + 13 * move, 13))
    used = 0
    for item in range(1, 377):
        table_id = int.from_bytes(read(ITEMS + 44 * item + 14, 2), "little")
        if table_id == 0:
            with pytest.raises(ValueError, match="unused/reserved"):
                read_item_name(read, item)
        else:
            assert table_id == item
            assert read_item_name(read, item) == decode_text(read(ITEMS + 44 * item, 14))
            used += 1
    assert used > 300
    assert read_item_name(read, 4) == "POKé BALL"
    assert read_item_name(read, 273) == "POKéBLOCK CASE"


def test_native_payload_retains_control_argument_ff_and_rejects_malformed_text():
    from pokebench_env.native_text import native_text_payload

    raw = bytes.fromhex("bbfc04ff15ffbcfc10ff00f9e7ff000000")
    assert native_text_payload(raw) == raw[:-4]
    assert decode_native_text(raw) == "ABEMOJI_HEART"
    for invalid in (b"\xfc\x04\xff", b"\xbb", b"\xfc\x99\xff", b"\xfc\x0c\x18\xff"):
        with pytest.raises(ValueError):
            native_text_payload(invalid)
