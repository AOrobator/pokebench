import ast
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from pokebench_env.launcher import VENDOR_DIR
from pokebench_env.milestone_guard import GuardError, install_milestone_guard, player_name_set

SAVE_BLOCK2_PTR = 0x03005D90


@dataclass
class Addresses:
    SAVE_BLOCK2_PTR: int = SAVE_BLOCK2_PTR


@dataclass
class FakeReader:
    pointer: int
    name_bytes: bytes = b"\x00" * 8
    addresses: Addresses = field(default_factory=Addresses)
    reads: list[tuple[int, int]] = field(default_factory=list)

    def _read_u32(self, address: int) -> int:
        assert address == SAVE_BLOCK2_PTR
        return self.pointer

    def _read_bytes(self, address: int, length: int) -> bytes:
        self.reads.append((address, length))
        return self.name_bytes

    def _decode_pokemon_text(self, raw: bytes) -> str:
        return "".join(" " if b == 0 else chr(b) for b in raw if b != 0xFF)


def test_null_save_block_pointer_is_not_a_set_name() -> None:
    assert player_name_set(FakeReader(pointer=0)) is False


def test_blank_name_bytes_are_not_a_set_name() -> None:
    assert player_name_set(FakeReader(pointer=0x2024A54)) is False


def test_decoded_name_at_the_pointer_is_a_set_name() -> None:
    reader = FakeReader(pointer=0x2024A54, name_bytes=b"MAY\xff\xff\xff\xff\x00")
    assert player_name_set(reader) is True
    assert reader.reads == [(0x2024A54, 8)]


def test_a_player_literally_named_player_counts() -> None:
    reader = FakeReader(pointer=0x2024A54, name_bytes=b"Player\xff\x00")
    assert player_name_set(reader) is True


class Emulator:
    def __init__(self, reader: FakeReader | None) -> None:
        self.memory_reader = reader
        self.calls: list[str] = []

    def _check_milestone_condition(self, milestone_id: str, game_state: dict[str, object]) -> bool:
        self.calls.append(milestone_id)
        return True


def guarded_class() -> type[Emulator]:
    cls = type("GuardedEmulator", (Emulator,), {})
    install_milestone_guard(cls)
    return cls


def test_guard_replaces_only_player_name_set() -> None:
    cls = guarded_class()
    emulator = cls(FakeReader(pointer=0))
    assert (
        emulator._check_milestone_condition("PLAYER_NAME_SET", {"player": {"name": "Player"}})
        is False
    )
    assert emulator._check_milestone_condition("LITTLEROOT_TOWN", {}) is True
    assert emulator.calls == ["LITTLEROOT_TOWN"]


def test_guard_without_a_memory_reader_reports_not_set() -> None:
    cls = guarded_class()
    assert (
        cls(None)._check_milestone_condition("PLAYER_NAME_SET", {"player": {"name": "MAY"}})
        is False
    )


def test_guard_installs_once() -> None:
    cls = guarded_class()
    first = cls._check_milestone_condition
    install_milestone_guard(cls)
    assert cls._check_milestone_condition is first
    emulator = cls(FakeReader(pointer=0))
    emulator._check_milestone_condition("OTHER", {})
    assert emulator.calls == ["OTHER"]


def test_guard_refuses_a_class_without_the_patch_point() -> None:
    with pytest.raises(GuardError, match="_check_milestone_condition"):
        install_milestone_guard(type("NoPatchPoint", (), {}))


def _vendor_class(path: Path, name: str) -> ast.ClassDef:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == name:
            return node
    raise AssertionError(f"{name} not found in {path}")


def _method_names(cls: ast.ClassDef) -> set[str]:
    return {node.name for node in cls.body if isinstance(node, ast.FunctionDef)}


def test_pinned_vendor_still_has_the_patch_point_and_reader_helpers() -> None:
    emulator = _vendor_class(VENDOR_DIR / "pokemon_env" / "emulator.py", "EmeraldEmulator")
    reader = _vendor_class(VENDOR_DIR / "pokemon_env" / "memory_reader.py", "PokemonEmeraldReader")
    assert "_check_milestone_condition" in _method_names(emulator)
    assert {
        "_read_u32",
        "_read_bytes",
        "_decode_pokemon_text",
        "read_player_name",
    } <= _method_names(reader)
    source = (VENDOR_DIR / "pokemon_env" / "memory_reader.py").read_text(encoding="utf-8")
    assert "SAVE_BLOCK2_PTR" in source
