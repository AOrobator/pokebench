from types import SimpleNamespace

import pytest

from pokebench_env.memory_reader import SnapshotMemoryReader


def reader(short=False):
    class View:
        def __getitem__(self, item):
            return bytes(i & 255 for i in range(item.start, item.stop - int(short)))

    return SnapshotMemoryReader(
        lambda: SimpleNamespace(
            memory=SimpleNamespace(u8=View()),
            cpu=SimpleNamespace(gprs=list(range(16)), cpsr=SimpleNamespace(packed=0x1F)),
        )
    )


def test_native_block_reader_uses_bulk_copy_and_fails_closed(monkeypatch):
    import sys

    from pokebench_env.memory_reader import copy_native_region

    class Ffi:
        NULL = None

        def new(self, _):
            return [0]

        def sizeof(self, block):
            return len(block)

        def buffer(self, block, size):
            return block[:size]

    monkeypatch.setitem(sys.modules, "mgba._pylib", SimpleNamespace(ffi=Ffi()))

    class Blocks:
        def getMemoryBlock(self, core, block, length):
            assert block == 2
            length[0] = 4
            return b"abcd"

    core = SimpleNamespace(
        _core=Blocks(),
        memory=reader().core().memory,
        _native=SimpleNamespace(memory=SimpleNamespace(io=b"\x00\x01\x02\x03")),
    )
    assert copy_native_region(core, 0x02000000, 4) == b"abcd"
    assert copy_native_region(core, 0x04000000, 4) == b"\x00\x01\x02\x03"
    with pytest.raises(ValueError, match="I/O size"):
        copy_native_region(core, 0x04000000, 5)
    with pytest.raises(ValueError, match="unavailable"):
        copy_native_region(core, 0x02000000, 5)


@pytest.mark.parametrize("bank", [0, 1])
@pytest.mark.parametrize("invalid", [None, "null", "short"])
def test_raw_flash_copies_both_banks_from_allocation_base(monkeypatch, bank, invalid):
    import sys

    from pokebench_env.memory_reader import copy_native_region

    backing = b"L" * 0x10000 + b"R" * 0x10000
    copies = []

    class Ffi:
        NULL = None

        def new(self, _):
            return [0]

        def buffer(self, block, size):
            # Bound the fake span so the old overread fails without a segfault.
            assert size <= len(block), "native buffer overread from selected Flash bank"
            copies.append(size)
            return block[:size]

    class Blocks:
        def getMemoryBlock(self, core, block, length):
            assert block in (0x0E, 0x0F)
            length[0] = len(backing) - int(invalid == "short")
            if invalid == "null":
                return None
            return memoryview(backing)[bank * 0x10000 :] if block == 0x0E else backing

    monkeypatch.setitem(sys.modules, "mgba._pylib", SimpleNamespace(ffi=Ffi()))
    core = SimpleNamespace(_core=Blocks())
    if invalid is None:
        assert copy_native_region(core, 0x0E000000, 0x20000) == backing
        assert copies == [0x20000]
    else:
        with pytest.raises(ValueError, match="native raw memory block unavailable"):
            copy_native_region(core, 0x0E000000, 0x20000)
        assert copies == []
