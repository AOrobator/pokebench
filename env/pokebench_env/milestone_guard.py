"""Replace the vendor's PLAYER_NAME_SET check (docs/findings F1) without editing vendor code.

The vendor reader returns the fallback "Player" while the SaveBlock2 pointer is
still null (the first frames after power-on), and its milestone check counts
that fallback as a real name. The guard reads the name bytes directly and only
counts a non-blank name at a non-null pointer.
"""

from collections.abc import Callable
from typing import Protocol

GUARDED_MILESTONE = "PLAYER_NAME_SET"
NAME_LENGTH = 8
_MARKER = "__pokebench_milestone_guard__"


class GuardError(RuntimeError):
    pass


class Addresses(Protocol):
    SAVE_BLOCK2_PTR: int


class NameReader(Protocol):
    addresses: Addresses

    def _read_u32(self, address: int) -> int: ...
    def _read_bytes(self, address: int, length: int) -> bytes: ...
    def _decode_pokemon_text(self, raw: bytes) -> str: ...


def player_name_set(reader: NameReader) -> bool:
    pointer = reader._read_u32(reader.addresses.SAVE_BLOCK2_PTR)
    if pointer == 0:
        return False
    return reader._decode_pokemon_text(reader._read_bytes(pointer, NAME_LENGTH)).strip() != ""


Check = Callable[[object, str, dict[str, object]], bool]


def install_milestone_guard(emulator_cls: type) -> None:
    original = getattr(emulator_cls, "_check_milestone_condition", None)
    if not callable(original):
        raise GuardError(f"{emulator_cls.__name__} has no _check_milestone_condition to guard")
    if getattr(original, _MARKER, False):
        return
    vendor_check: Check = original

    def guarded(self: object, milestone_id: str, game_state: dict[str, object]) -> bool:
        if milestone_id == GUARDED_MILESTONE:
            reader: NameReader | None = getattr(self, "memory_reader", None)
            return reader is not None and player_name_set(reader)
        return vendor_check(self, milestone_id, game_state)

    setattr(guarded, _MARKER, True)
    setattr(emulator_cls, "_check_milestone_condition", guarded)  # noqa: B010 - dynamic class
