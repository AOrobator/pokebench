import gzip
import json
from types import SimpleNamespace

import pytest

from pokebench_env.memory_reader import SnapshotMemoryReader
from pokebench_env.raw_ram import REGIONS, RawRamArchive, load_raw_ram


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


def test_full_memory_roundtrip_and_cpu(tmp_path):
    archive = RawRamArchive(tmp_path, "a" * 40)
    receipt = archive.capture(reader(), 42)
    frozen = load_raw_ram(tmp_path / receipt["path"], receipt["sha256"])
    for _, address, length in REGIONS:
        assert frozen(address, length) == reader()(address, length)
    assert frozen.native_boot_cpu_context().gprs == tuple(range(16))
    assert frozen.pokemon_cpu_context() is None
    assert receipt["frame"] == 42
    assert json.loads((tmp_path / "index.jsonl").read_text())["sha256"] == receipt["sha256"]
    with pytest.raises(ValueError, match="outside archived"):
        frozen(0x08000000, 4)
    with pytest.raises(ValueError):
        frozen(0x02000000, -1)
    with pytest.raises(ValueError, match="integrity"):
        load_raw_ram(tmp_path / receipt["path"], "0" * 64)


def test_short_read_fails_before_index_commit(tmp_path):
    archive = RawRamArchive(tmp_path, "a" * 40)
    with pytest.raises(ValueError, match="short raw"):
        archive.capture(reader(True), 1)
    assert not (tmp_path / "index.jsonl").exists()


def test_corrupt_region_rejected(tmp_path):
    archive = RawRamArchive(tmp_path, "a" * 40)
    receipt = archive.capture(reader(), 1)
    path = tmp_path / receipt["path"]
    data = json.loads(gzip.decompress(path.read_bytes()))
    data["regions"][0]["data_base64"] = "AAAA"
    path.write_bytes(gzip.compress(json.dumps(data).encode()))
    with pytest.raises(ValueError, match="region"):
        load_raw_ram(path)


def test_archive_failure_never_reuses_a_run(tmp_path):
    archive = RawRamArchive(tmp_path, "a" * 40)
    receipt = archive.capture(reader(), 0)
    assert receipt["sequence"] == 0
    with pytest.raises(ValueError, match="already exists"):
        RawRamArchive(tmp_path, "a" * 40)
    archive.pair(receipt, {"screen": "title"}, None)
    paired = json.loads((tmp_path / "observations.jsonl").read_text())
    assert paired["raw_ram"] == receipt and paired["screenshot_sha256"] is None


@pytest.mark.parametrize(
    "change",
    [
        {"v": 2},
        {"regions": []},
        {"gprs": [0]},
        {"cpsr": -1},
    ],
)
def test_rejects_malformed_archives(tmp_path, change):
    archive = RawRamArchive(tmp_path, "a" * 40)
    receipt = archive.capture(reader(), 1)
    path = tmp_path / receipt["path"]
    value = json.loads(gzip.decompress(path.read_bytes()))
    value.update(change)
    path.write_bytes(gzip.compress(json.dumps(value).encode()))
    with pytest.raises(ValueError):
        load_raw_ram(path)


def test_region_layout_and_bounded_expansion(tmp_path):
    archive = RawRamArchive(tmp_path, "a" * 40)
    receipt = archive.capture(reader(), 1)
    path = tmp_path / receipt["path"]
    value = json.loads(gzip.decompress(path.read_bytes()))
    value["regions"][0]["address"] += 1
    path.write_bytes(gzip.compress(json.dumps(value).encode()))
    with pytest.raises(ValueError, match="layout"):
        load_raw_ram(path)
    path.write_bytes(gzip.compress(b" " * (2 * 1024 * 1024 + 1)))
    with pytest.raises(ValueError, match="expanded"):
        load_raw_ram(path)


def test_rom_identity_and_cpu_stack(tmp_path):
    import hashlib

    rom = b"ROM reference"
    archive = RawRamArchive(tmp_path, hashlib.sha1(rom, usedforsecurity=False).hexdigest())
    r = reader()
    original = r.core()
    original.cpu.gprs[13] = 0x03007F00
    r.core = lambda: original
    receipt = archive.capture(r, 1)
    frozen = load_raw_ram(tmp_path / receipt["path"], rom=rom)
    assert frozen(0x08000000, len(rom)) == rom
    assert frozen.pokemon_cpu_context().stack_bytes == r(0x03007F00, 128)
    with pytest.raises(ValueError, match="ROM identity"):
        load_raw_ram(tmp_path / receipt["path"], rom=b"wrong")
    with pytest.raises(ValueError, match="outside"):
        frozen(0x08000000 + len(rom), 1)


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
