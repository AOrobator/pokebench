"""Byte-preserving canonical RAM span and production injection contracts."""

import sys
import threading
from types import ModuleType, SimpleNamespace

import pytest

from pokebench_env import memory_reader, serve
from pokebench_env.memory_reader import SnapshotMemoryReader


class BusView:
    def __init__(self, result=b"bus"):
        self.result = result
        self.requests = []

    def __getitem__(self, item):
        self.requests.append(item)
        return self.result


class Pointer:
    def __init__(self, body, offset=0):
        self.body = body
        self.offset = offset

    def __add__(self, offset):
        return Pointer(self.body, self.offset + offset)


class FakeFfi:
    NULL = None

    def __init__(self):
        self.copies = []

    def new(self, declaration):
        assert declaration.replace(" ", "") == "size_t*"
        return [0]

    def cast(self, declaration, pointer):
        assert declaration.replace(" ", "") == "uint8_t*"
        return pointer

    def buffer(self, pointer, length):
        self.copies.append((pointer.offset, length))
        return memoryview(pointer.body)[pointer.offset : pointer.offset + length]


@pytest.fixture
def native(monkeypatch):
    ffi = FakeFfi()
    monkeypatch.setitem(sys.modules, "mgba._pylib", SimpleNamespace(ffi=ffi))
    ewram = bytes(range(256)) * 1024
    iwram = bytes(reversed(range(256))) * 128

    class Blocks:
        def __init__(self):
            self.blocks = {2: (Pointer(ewram), len(ewram)), 3: (Pointer(iwram), len(iwram))}
            self.calls = []

        def getMemoryBlock(self, owner, block, size):
            assert owner is self
            self.calls.append(block)
            pointer, length = self.blocks[block]
            size[0] = length
            return pointer

    blocks = Blocks()
    return SimpleNamespace(
        core=SimpleNamespace(_core=blocks), ffi=ffi, blocks=blocks, ewram=ewram, iwram=iwram
    )


def test_reader_optional_fast_path_uses_none_not_truthiness_and_preserves_raw_reader():
    view = BusView()
    requests = []
    raw_requests = []

    def fast(address, length):
        requests.append((address, length))
        return b"" if address == 0x02000000 else None

    reader = SnapshotMemoryReader(
        lambda: SimpleNamespace(memory=SimpleNamespace(u8=view)),
        lambda address, length: raw_requests.append((address, length)) or b"full-archive",
        fast_read=fast,
    )
    assert reader(0x02000000, 1) == b""
    assert view.requests == []
    assert reader(0x04000000, 1) == b"bus"
    assert requests == [(0x02000000, 1), (0x04000000, 1)]
    assert [(item.start, item.stop) for item in view.requests] == [(0x04000000, 0x04000001)]
    assert reader.raw_region(0x02000000, 0x40000) == b"full-archive"
    assert raw_requests == [(0x02000000, 0x40000)]
    assert len(requests) == 2


@pytest.mark.parametrize("address,length", [(0x02000000, 0), (-1, 3), (0x02000000, -2)])
def test_plain_reader_retains_original_slice_semantics(address, length):
    view = BusView(b"legacy-result")
    reader = SnapshotMemoryReader(lambda: SimpleNamespace(memory=SimpleNamespace(u8=view)))
    assert reader(address, length) == b"legacy-result"
    assert [(item.start, item.stop) for item in view.requests] == [(address, address + length)]


@pytest.mark.parametrize(
    "address,length,block,offset",
    [
        (0x02000000, 1, 2, 0),
        (0x02000123, 17, 2, 0x123),
        (0x0203FFFF, 1, 2, 0x3FFFF),
        (0x02000000, 0x40000, 2, 0),
        (0x03000000, 1, 3, 0),
        (0x03000123, 17, 3, 0x123),
        (0x03007FFF, 1, 3, 0x7FFF),
        (0x03000000, 0x8000, 3, 0),
    ],
)
def test_native_reads_exact_requested_bytes_without_whole_region_copy(
    native, address, length, block, offset
):
    expected = native.ewram if block == 2 else native.iwram
    actual = memory_reader.read_canonical_ram(native.core, address, length)
    assert actual == expected[offset : offset + length]
    assert type(actual) is bytes
    assert native.blocks.calls == [block]
    assert native.ffi.copies == [(offset, length)]


@pytest.mark.parametrize(
    "address,length",
    [
        (0x01FFFFFF, 1),
        (0x02040000, 1),
        (0x0203FFFF, 2),
        (0x02000000, 0x40001),
        (0x03008000, 1),
        (0x03007FFF, 2),
        (0x02040004, 4),
        (0x03008004, 4),
        (0x04000000, 4),
        (0x08000000, 4),
        (0x0A000000, 4),
        (0x0C000000, 4),
        (0x0E000000, 4),
        (0x0F000000, 4),
        (0x02000000, 0),
        (0x02000000, -1),
        (-1, 1),
        (0x02000000, True),
        (True, 1),
        (0x02000000, 1.5),
    ],
)
def test_noncanonical_or_invalid_request_never_resolves_a_native_block(native, address, length):
    assert memory_reader.read_canonical_ram(native.core, address, length) is None
    assert native.blocks.calls == []
    assert native.ffi.copies == []


@pytest.mark.parametrize("pointer_kind,size", [("null", 0x40000), ("valid", 0), ("valid", 0x40001)])
def test_native_null_or_wrong_allocation_size_preserves_bus_fallback(native, pointer_kind, size):
    pointer = None if pointer_kind == "null" else Pointer(native.ewram)
    native.blocks.blocks[2] = (pointer, size)
    view = BusView(b"legacy")
    native.core.memory = SimpleNamespace(u8=view)
    reader = SnapshotMemoryReader(
        lambda: native.core,
        fast_read=lambda address, length: memory_reader.read_canonical_ram(
            native.core, address, length
        ),
    )
    assert reader(0x02000010, 4) == b"legacy"
    assert native.ffi.copies == []
    assert len(view.requests) == 1


def test_native_allocation_pointer_and_contents_are_refreshed_on_every_call(native):
    address = 0x02000023
    assert memory_reader.read_canonical_ram(native.core, address, 4) == b"#$%&"
    replacement = bytearray(native.ewram)
    replacement[0x23:0x27] = b"next"
    native.blocks.blocks[2] = (Pointer(replacement), len(replacement))
    assert memory_reader.read_canonical_ram(native.core, address, 4) == b"next"
    replacement[0x23:0x27] = b"live"
    assert memory_reader.read_canonical_ram(native.core, address, 4) == b"live"
    assert native.blocks.calls == [2, 2, 2]
    assert native.ffi.copies == [(0x23, 4)] * 3


def test_production_reader_factory_uses_current_core_and_keeps_full_raw_region_separate(
    monkeypatch,
):
    active = SimpleNamespace(label="first")
    fast = []
    raw = []
    monkeypatch.setattr(
        serve,
        "read_canonical_ram",
        lambda core, address, length: fast.append((core, address, length)) or b"fast",
    )
    monkeypatch.setattr(
        serve,
        "copy_native_region",
        lambda core, address, length: raw.append((core, address, length)) or b"raw",
    )
    reader = serve.make_memory_reader(lambda: active)
    assert reader(0x02000010, 4) == b"fast"
    assert fast[0] == (active, 0x02000010, 4)
    active = SimpleNamespace(label="replacement")
    assert reader(0x03000010, 4) == b"fast"
    assert fast[-1] == (active, 0x03000010, 4)
    assert reader.raw_region(0x02000000, 0x40000) == b"raw"
    assert raw == [(active, 0x02000000, 0x40000)]
    assert len(fast) == 2


def test_actual_server_main_constructs_one_shared_optimized_reader(monkeypatch, tmp_path):
    core = SimpleNamespace(frame_counter=0)
    vendor = SimpleNamespace(
        app=object(),
        env=SimpleNamespace(core=core),
        frame_manager=object(),
        memory_lock=threading.Lock(),
        main=lambda: None,
    )
    pokemon_package = ModuleType("pokemon_env")
    emulator_module = ModuleType("pokemon_env.emulator")
    emulator_module.EmeraldEmulator = type("FakeEmulator", (), {})
    pokemon_package.emulator = emulator_module
    server_package = ModuleType("server")
    server_package.app = vendor
    monkeypatch.setitem(sys.modules, "pokemon_env", pokemon_package)
    monkeypatch.setitem(sys.modules, "pokemon_env.emulator", emulator_module)
    monkeypatch.setitem(sys.modules, "server", server_package)
    monkeypatch.setattr(serve, "install_deadline_frame_stream", lambda *_args: None)
    monkeypatch.setattr(serve, "install_battle_journal", lambda *_args: None)
    monkeypatch.setattr(
        serve, "resolve_rom", lambda _env: SimpleNamespace(read_bytes=lambda: b"test")
    )
    monkeypatch.setattr(serve.MapNames, "load", lambda _path: object())
    monkeypatch.setattr(serve, "RawRamArchive", lambda *_args: object())
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("POKEBENCH_HUMAN_TOKEN", raising=False)
    monkeypatch.setattr(sys, "argv", ["serve", "--port", "8181"])
    reader = object()
    owners = []

    def factory(owner):
        owners.append(owner())
        return reader

    monkeypatch.setattr(serve, "make_memory_reader", factory)
    received = []
    monkeypatch.setattr(serve, "run", lambda *args, **kwargs: received.append(kwargs))
    serve.main()
    assert owners == [core]
    assert received[0]["actions"][2] is reader
    assert received[0]["observation"][2] is reader
