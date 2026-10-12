"""Locate and verify the operator-supplied Emerald ROM; expose it to the vendor server.

The ROM is never copied. The vendor server reads `Emerald-GBAdvance/rom.gba`
relative to its working directory; each run's server directory holds a
symlink there (see `run_server.prepare_server_dir`).
"""

import hashlib
from collections.abc import Mapping
from pathlib import Path

EMERALD_SHA1 = "f3ae088181bf583e55daf962a92bb46f4f1d07b7"
ROM_ENV = "POKEBENCH_ROM"
VENDOR_ROM_SLOT = Path("Emerald-GBAdvance") / "rom.gba"


class RomError(RuntimeError):
    pass


def resolve_rom(env: Mapping[str, str], expected_sha1: str = EMERALD_SHA1) -> Path:
    raw = env.get(ROM_ENV)
    if not raw:
        raise RomError(f"{ROM_ENV} is not set; point it at your Pokémon Emerald (USA) ROM")
    rom = Path(raw).expanduser().resolve()
    if not rom.is_file():
        raise RomError(f"{ROM_ENV} file does not exist: {rom}")
    digest = hashlib.sha1(rom.read_bytes(), usedforsecurity=False).hexdigest()
    if digest != expected_sha1:
        raise RomError(f"ROM SHA-1 is {digest}, expected {expected_sha1}: {rom}")
    return rom
