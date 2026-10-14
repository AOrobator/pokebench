"""Read-only emulator memory/CPU access under the caller's snapshot lock."""

from collections.abc import Callable
from typing import Protocol

from pokebench_env.boot import BootCpu
from pokebench_env.pokemon import PokemonCpu


class BytesView(Protocol):
    def __getitem__(self, index: slice) -> bytes: ...


class Memory(Protocol):
    u8: BytesView


class Registers(Protocol):
    def __getitem__(self, index: int) -> int: ...


class Psr(Protocol):
    packed: int


class Cpu(Protocol):
    gprs: Registers
    cpsr: Psr


class Core(Protocol):
    memory: Memory
    cpu: Cpu


class SnapshotMemoryReader:
    def __init__(self, core: Callable[[], Core]) -> None:
        self.core = core

    def __call__(self, address: int, length: int) -> bytes:
        return bytes(self.core().memory.u8[address : address + length])

    def pokemon_cpu_context(self) -> PokemonCpu | None:
        cpu = self.core().cpu
        registers = tuple(int(cpu.gprs[i]) & 0xFFFFFFFF for i in range(16))
        sp = registers[13]
        if not ((0x02000000 <= sp <= 0x02040000 - 128) or (0x03000000 <= sp <= 0x03008000 - 128)):
            return None
        return PokemonCpu(registers, int(cpu.cpsr.packed), sp, self(sp, 128))

    def native_boot_cpu_context(self) -> BootCpu:
        """Separate finite boot evidence; never relax Pokémon crypto IRQ guards."""
        cpu = self.core().cpu
        registers = tuple(int(cpu.gprs[i]) & 0xFFFFFFFF for i in range(16))
        return BootCpu(registers, int(cpu.cpsr.packed) & 0xFFFFFFFF, self(0x03007E20, 32))
