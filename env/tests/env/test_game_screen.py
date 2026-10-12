import pytest

from pokebench_env.game_screen import GMAIN, SCREENS, Screen, read_screen


def memory(callback1: int, callback2: int):
    calls: list[tuple[int, int]] = []

    def read(address: int, length: int) -> bytes:
        calls.append((address, length))
        return callback1.to_bytes(4, "little") + callback2.to_bytes(4, "little")

    return read, calls


@pytest.mark.parametrize(
    ("callback2", "kind"),
    [
        (0x0816CEAD, "intro"),
        (0x0816CC01, "title"),
        (0x080AA7A5, "main_menu"),
        (0x080AAB2D, "main_menu"),
        (0x0802F6B1, "birch_speech"),
        (0x080E2E05, "naming"),
        (0x080E4F59, "naming"),
        (0x08085E5D, "overworld"),
    ],
)
def test_known_callbacks_name_the_screen(callback2: int, kind: str) -> None:
    read, calls = memory(0, callback2)
    screen = read_screen(read)
    assert screen == Screen(kind=kind, callback1=0, callback2=callback2)
    assert screen.label == kind
    assert calls == [(GMAIN, 8)]


def test_an_unmapped_callback_is_reported_not_guessed() -> None:
    read, _ = memory(0x08085E05, 0x0812345B)
    screen = read_screen(read)
    assert screen.kind == "unknown"
    assert screen.label == "unknown (callback2 0x0812345B)"


def test_gmain_is_the_us_emerald_address() -> None:
    assert GMAIN == 0x030022C0
    assert len(SCREENS) == 8


def test_a_short_read_is_an_error() -> None:
    with pytest.raises(ValueError, match="gMain"):
        read_screen(lambda address, length: b"\x00" * 4)
