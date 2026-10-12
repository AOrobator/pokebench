"""The Gen III character encoding (pokeemerald `charmap.txt`)."""

import string

GBA_TEXT: dict[int, str] = {
    0x00: " ",
    **{0xA1 + i: d for i, d in enumerate(string.digits)},
    0xAB: "!",
    0xAC: "?",
    0xAD: ".",
    0xAE: "-",
    0xB0: "…",
    0xB4: "'",
    0xB5: "♂",
    0xB6: "♀",
    0xB8: ",",
    0xBA: "/",
    **{0xBB + i: c for i, c in enumerate(string.ascii_uppercase)},
    **{0xD5 + i: c for i, c in enumerate(string.ascii_lowercase)},
}


def decode_text(raw: bytes) -> str:
    out = []
    for byte in raw:
        if byte == 0xFF:
            break
        out.append(GBA_TEXT.get(byte, "?"))
    return "".join(out)
