import pytest

from pokebench_env.gba_text import decode_text
from pokebench_env.native_text import decode_native_text
from pokebench_env.pokemon import (
    decode_party_mon,
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


def test_native_payload_retains_control_argument_ff_and_rejects_malformed_text():
    from pokebench_env.native_text import native_text_payload

    raw = bytes.fromhex("bbfc04ff15ffbcfc10ff00f9e7ff000000")
    assert native_text_payload(raw) == raw[:-4]
    assert decode_native_text(raw) == "ABEMOJI_HEART"
    for invalid in (b"\xfc\x04\xff", b"\xbb", b"\xfc\x99\xff", b"\xfc\x0c\x18\xff"):
        with pytest.raises(ValueError):
            native_text_payload(invalid)
