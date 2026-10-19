"""Lossless writable GBA memory archives, independent of decoded observations."""

import base64
import gzip
import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import cast

from pokebench_env.boot import BootCpu
from pokebench_env.memory_reader import SnapshotMemoryReader
from pokebench_env.pokemon import PokemonCpu

REGIONS = (
    ("ewram", 0x02000000, 0x40000),
    ("iwram", 0x03000000, 0x8000),
    ("io", 0x04000000, 0x400),
    ("palette", 0x05000000, 0x400),
    ("vram", 0x06000000, 0x18000),
    ("oam", 0x07000000, 0x400),
    ("flash", 0x0E000000, 0x20000),
)
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def durable_write(path: Path, data: bytes) -> None:
    with path.open("xb") as file:
        file.write(data)
        file.flush()
        os.fsync(file.fileno())


class RawRamArchive:
    def __init__(self, directory: Path, rom_sha1: str) -> None:
        self.directory = directory
        self.rom_sha1 = rom_sha1
        self.sequence = 0
        # Pairing can come from /state, battle waits, and the slower observation
        # delivery path. Serialize every durable JSONL append at the archive.
        self._pair_lock = threading.Lock()
        directory.mkdir(parents=True, exist_ok=True)
        if (directory / "index.jsonl").exists():
            raise ValueError("raw RAM archive already exists; run directories are single-use")

    def capture(self, read: SnapshotMemoryReader, frame: int) -> dict[str, object]:
        regions = []
        for name, address, size in REGIONS:
            data = read.raw_region(address, size)
            if len(data) != size:
                raise ValueError(f"short raw RAM read: {name}: {len(data)} != {size}")
            regions.append(
                dict(
                    name=name,
                    address=address,
                    size=size,
                    data_base64=base64.b64encode(data).decode("ascii"),
                    sha256=digest(data),
                )
            )
        cpu = read.native_boot_cpu_context()
        metadata = dict(
            v=1,
            sequence=self.sequence,
            frame=frame,
            timestamp_ns=time.time_ns(),
            rom_sha1=self.rom_sha1,
            gprs=list(cpu.gprs),
            cpsr=cpu.cpsr,
        )
        data = gzip.compress(
            json.dumps(dict(**metadata, regions=regions), separators=(",", ":")).encode(),
            compresslevel=1,
            mtime=0,
        )
        path = f"{self.sequence:08d}.json.gz"
        durable_write(self.directory / path, data)
        receipt = dict(
            **metadata,
            path=path,
            sha256=digest(data),
            bytes=len(data),
            raw_bytes=sum(size for _, _, size in REGIONS),
        )
        with (self.directory / "index.jsonl").open("ab") as index:
            index.write(json.dumps(receipt, separators=(",", ":")).encode() + b"\n")
            index.flush()
            os.fsync(index.fileno())
        self.sequence += 1
        return receipt

    def pair(
        self, receipt: dict[str, object], decoded: dict[str, object], screenshot: str | None
    ) -> None:
        entry = dict(
            raw_ram=receipt,
            state=decoded,
            screenshot_sha256=None
            if screenshot is None
            else digest(base64.b64decode(screenshot, validate=True)),
        )
        with self._pair_lock:
            with (self.directory / "observations.jsonl").open("ab") as file:
                file.write(json.dumps(entry, separators=(",", ":")).encode() + b"\n")
                file.flush()
                os.fsync(file.fileno())


class ArchivedMemoryReader:
    def __init__(
        self,
        regions: list[tuple[int, bytes]],
        gprs: tuple[int, ...],
        cpsr: int,
        metadata: dict[str, object],
        rom: bytes | None = None,
    ) -> None:
        self.regions = regions
        self.gprs = gprs
        self.cpsr = cpsr
        self.metadata = metadata
        self.rom = rom

    def __call__(self, address: int, length: int) -> bytes:
        if length < 0:
            raise ValueError("negative memory read")
        for base, data in self.regions:
            if base <= address and address + length <= base + len(data):
                return data[address - base : address - base + length]
        if (
            self.rom is not None
            and 0x08000000 <= address
            and address + length <= 0x08000000 + len(self.rom)
        ):
            return self.rom[address - 0x08000000 : address - 0x08000000 + length]
        raise ValueError(f"read outside archived memory: {address:#x}+{length}")

    def pokemon_cpu_context(self) -> PokemonCpu | None:
        sp = self.gprs[13]
        if not ((0x02000000 <= sp <= 0x02040000 - 128) or (0x03000000 <= sp <= 0x03008000 - 128)):
            return None
        return PokemonCpu(self.gprs, self.cpsr, sp, self(sp, 128))

    def native_boot_cpu_context(self) -> BootCpu:
        return BootCpu(self.gprs, self.cpsr, self(0x03007E20, 32))


def load_raw_ram(
    path: Path, expected_sha256: str | None = None, *, rom: bytes | None = None
) -> ArchivedMemoryReader:
    data = path.read_bytes()
    if len(data) > MAX_ARCHIVE_BYTES or (
        expected_sha256 is not None and digest(data) != expected_sha256
    ):
        raise ValueError("raw RAM archive integrity failure")
    # Bound decompression even for untrusted/corrupted archives.
    from io import BytesIO

    with gzip.GzipFile(fileobj=BytesIO(data)) as file:
        decoded = file.read(MAX_ARCHIVE_BYTES + 1)
    if len(decoded) > MAX_ARCHIVE_BYTES:
        raise ValueError("raw RAM archive expanded beyond limit")
    value = json.loads(decoded)
    if not isinstance(value, dict) or type(value.get("v")) is not int or value.get("v") != 1:
        raise ValueError("invalid raw RAM archive version")
    records = value.get("regions")
    if not isinstance(records, list) or len(records) != len(REGIONS):
        raise ValueError("invalid raw RAM region table")
    regions = []
    for record, (name, address, size) in zip(records, REGIONS, strict=True):
        if not isinstance(record, dict) or (
            record.get("name"),
            record.get("address"),
            record.get("size"),
        ) != (name, address, size):
            raise ValueError("invalid raw RAM region layout")
        raw = base64.b64decode(record.get("data_base64", ""), validate=True)
        if len(raw) != size or digest(raw) != record.get("sha256"):
            raise ValueError("raw RAM region integrity failure")
        regions.append((address, raw))
    gprs = value.get("gprs")
    cpsr = value.get("cpsr")
    if (
        not isinstance(gprs, list)
        or len(gprs) != 16
        or any(type(n) is not int or not 0 <= n <= 0xFFFFFFFF for n in [*gprs, cpsr])
    ):
        raise ValueError("invalid raw RAM CPU registers")
    if rom is not None and hashlib.sha1(rom, usedforsecurity=False).hexdigest() != value.get(
        "rom_sha1"
    ):
        raise ValueError("raw RAM ROM identity mismatch")
    return ArchivedMemoryReader(regions, tuple(gprs), cast(int, cpsr), value, rom)


def raw_reference(receipt: dict[str, object]) -> dict[str, object]:
    return {key: receipt[key] for key in ("v", "sequence", "frame", "sha256")} | {
        "path": "raw-ram/" + str(receipt["path"])
    }
