"""The BAG page art build finds the real gItemIconTable, not a stray copy of its first pair.

Covers scripts/bag-art/build_bag_art.py and the shared lz77 reader in
scripts/trainer-card/build_art.py.
"""

import importlib.util
import struct
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[3] / "scripts"


def load(name: str, path: Path) -> object:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


build_art = load("build_art", SCRIPTS / "trainer-card" / "build_art.py")
bag = load("build_bag_art", SCRIPTS / "bag-art" / "build_bag_art.py")
BASE = 0x08000000


def lz(blob: bytes) -> bytes:
    """A literal-only LZ77 block, padded to 4 bytes, as gbagfx would accept."""
    out = bytearray(b"\x10" + len(blob).to_bytes(3, "little"))
    for i in range(0, len(blob), 8):
        out.append(0)
        out += blob[i : i + 8]
    while len(out) % 4:
        out.append(0)
    return bytes(out)


ENTRIES = [
    (bytes([1]) * 32, bytes([2]) * 32),
    (bytes([3]) * 32, bytes([4]) * 32),
    (bytes([5]) * 32, bytes([6]) * 32),
]


def rom_with(decoy: bool, bad_pointer: bool = False) -> tuple[object, int]:
    data = bytearray(b"\xff" * 16)
    offs: dict[bytes, int] = {}
    for icon, pal in ENTRIES:
        for blob in (icon, pal):
            offs[blob] = len(data)
            data += lz(blob)
    head = struct.pack("<II", BASE + offs[ENTRIES[0][0]], BASE + offs[ENTRIES[0][1]])
    if decoy:
        # The first pair again, then pointers that leave the ROM: what a raw find() hits first.
        data += head + struct.pack("<II", 0x09FFFFF0, 0x07000000) + b"\x00" * 8
    table = len(data)
    for n, (icon, pal) in enumerate(ENTRIES):
        icon_ptr = BASE + offs[icon]
        if bad_pointer and n == 2:
            icon_ptr = BASE + len(data) + 0x100000
        data += struct.pack("<II", icon_ptr, BASE + offs[pal])
    return build_art.Rom(bytes(data)), table  # type: ignore[attr-defined]


def test_skips_a_decoy_copy_of_the_first_pair_and_finds_the_real_table() -> None:
    rom, table = rom_with(decoy=True)
    assert rom.data.find(rom.data[table : table + 8]) < table
    assert bag.find_icon_table(rom, ENTRIES) == table  # type: ignore[attr-defined]


def test_a_table_pointer_outside_the_rom_is_a_verify_error_not_a_crash() -> None:
    rom, _ = rom_with(decoy=True, bad_pointer=True)
    with pytest.raises(build_art.VerifyError, match="no gItemIconTable"):  # type: ignore[attr-defined]
        bag.find_icon_table(rom, ENTRIES)  # type: ignore[attr-defined]


def test_missing_first_item_art_is_a_verify_error() -> None:
    rom, _ = rom_with(decoy=False)
    with pytest.raises(build_art.VerifyError, match="not LZ77 blocks"):  # type: ignore[attr-defined]
        bag.find_icon_table(rom, [(bytes([9]) * 32, bytes([8]) * 32)])  # type: ignore[attr-defined]


def test_lz77_reads_nothing_outside_the_data() -> None:
    data = lz(bytes(8))
    assert build_art.lz77(data, 0) == bytes(8)  # type: ignore[attr-defined]
    assert build_art.lz77(data, len(data)) is None  # type: ignore[attr-defined]
    assert build_art.lz77(data, -4) is None  # type: ignore[attr-defined]
    assert build_art.Rom(data).decompress(10_000) is None  # type: ignore[attr-defined]
