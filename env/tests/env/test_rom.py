import hashlib
from pathlib import Path

import pytest

from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom


@pytest.fixture
def fake_rom(tmp_path: Path) -> tuple[Path, str]:
    rom = tmp_path / "Pokemon - Emerald Version (USA, Europe); $(rm -rf).gba"
    rom.write_bytes(b"not really a rom")
    return rom, hashlib.sha1(rom.read_bytes()).hexdigest()


def test_pinned_sha1_is_emerald_us() -> None:
    assert EMERALD_SHA1 == "f3ae088181bf583e55daf962a92bb46f4f1d07b7"


def test_missing_env_var_is_an_error() -> None:
    with pytest.raises(RomError, match="POKEBENCH_ROM"):
        resolve_rom({})


def test_missing_file_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(RomError, match="does not exist"):
        resolve_rom({"POKEBENCH_ROM": str(tmp_path / "nope.gba")})


def test_wrong_hash_is_an_error(fake_rom: tuple[Path, str]) -> None:
    rom, _ = fake_rom
    with pytest.raises(RomError, match="SHA-1"):
        resolve_rom({"POKEBENCH_ROM": str(rom)})


def test_matching_hash_resolves_to_absolute_path(fake_rom: tuple[Path, str]) -> None:
    rom, digest = fake_rom
    assert resolve_rom({"POKEBENCH_ROM": str(rom)}, expected_sha1=digest) == rom.resolve()
