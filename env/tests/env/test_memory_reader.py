from types import SimpleNamespace

from pokebench_env.memory_reader import SnapshotMemoryReader


def core(sp):
    registers = list(range(16))
    registers[13] = sp

    class View:
        def __getitem__(self, item):
            return bytes((i & 255) for i in range(item.start, item.stop))

    return SimpleNamespace(
        memory=SimpleNamespace(u8=View()),
        cpu=SimpleNamespace(gprs=registers, cpsr=SimpleNamespace(packed=0x6000001F)),
    )


def test_dynamic_core_owner_cpu_registers_and_stack_bounds():
    active = core(0x03007F80)
    reader = SnapshotMemoryReader(lambda: active)
    assert reader(0x02000001, 3) == b"\x01\x02\x03"
    cpu = reader.pokemon_cpu_context()
    assert cpu.gprs[13] == 0x03007F80
    assert cpu.cpsr == 0x6000001F
    assert len(cpu.stack_bytes) == 128
    active = core(0x02000000)
    assert reader.pokemon_cpu_context().stack_address == 0x02000000
    active = core(0x03007F81)
    assert reader.pokemon_cpu_context() is None
    active = core(0x08000000)
    assert reader.pokemon_cpu_context() is None


def test_boot_context_preserves_irq_tuple_without_relaxing_pokemon_guard():
    active = core(0x03007FA0)
    active.cpu.gprs[15] = 0x1C
    active.cpu.cpsr.packed = 0x80000092
    reader = SnapshotMemoryReader(lambda: active)
    assert reader.pokemon_cpu_context() is None
    boot = reader.native_boot_cpu_context()
    assert boot.gprs[13] == 0x03007FA0 and boot.gprs[15] == 0x1C
    assert boot.cpsr == 0x80000092 and len(boot.main_stack) == 32
