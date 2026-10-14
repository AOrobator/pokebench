"""The complete US Gen III charmap; unknown bytes are harness defects."""

from pokebench_env.native_text import ENGLISH_GLYPHS, decode_native_text

GBA_TEXT = ENGLISH_GLYPHS


def decode_text(raw: bytes) -> str:
    return decode_native_text(raw)
