import pytest

from pokebench_env.rom import EMERALD_SHA1, RomError, resolve_rom


def test_pinned_sha1_is_emerald_us() -> None:
    assert EMERALD_SHA1 == "f3ae088181bf583e55daf962a92bb46f4f1d07b7"


def test_missing_env_var_is_an_error() -> None:
    with pytest.raises(RomError, match="POKEBENCH_ROM"):
        resolve_rom({})
