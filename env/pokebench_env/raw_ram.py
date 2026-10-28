"""Lossless writable GBA memory archives, independent of decoded observations."""

import base64
import concurrent.futures
import gzip
import hashlib
import json
import multiprocessing
import os
import shutil
import tempfile
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

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
PERSIST_QUEUE = 8


class Executor(Protocol):
    def submit(self, fn: object, /, *args: object) -> concurrent.futures.Future[object]: ...


_pool_lock = threading.Lock()
_pool: concurrent.futures.ProcessPoolExecutor | None = None


def _process_pool() -> concurrent.futures.ProcessPoolExecutor:
    """One spawned persistence process per game-server process.

    Spawn is load-bearing: the writer must never inherit the emulator core,
    native locks, or its background threads. The archive's semaphore bounds
    admitted work before it reaches ProcessPoolExecutor's internal queue.
    """

    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = concurrent.futures.ProcessPoolExecutor(
                max_workers=1, mp_context=multiprocessing.get_context("spawn")
            )
        return _pool


def shutdown_persistence_worker() -> None:
    """Drain and stop the spawned writer during orderly server shutdown."""

    global _pool
    with _pool_lock:
        pool, _pool = _pool, None
    if pool is not None:
        pool.shutdown(wait=True, cancel_futures=False)


@dataclass(frozen=True)
class RawRamSnapshot:
    v: int
    sequence: int
    frame: int
    timestamp_ns: int
    rom_sha1: str
    gprs: tuple[int, ...]
    cpsr: int
    regions: tuple[tuple[str, int, int, bytes], ...]

    def reader(self, rom: bytes | None = None) -> "ArchivedMemoryReader":
        metadata = {
            "v": self.v,
            "sequence": self.sequence,
            "frame": self.frame,
            "timestamp_ns": self.timestamp_ns,
            "rom_sha1": self.rom_sha1,
            "gprs": list(self.gprs),
            "cpsr": self.cpsr,
        }
        return ArchivedMemoryReader(
            [(address, data) for _, address, _, data in self.regions],
            self.gprs,
            self.cpsr,
            metadata,
            rom,
        )


def _copy_raw_parts(
    read: SnapshotMemoryReader,
) -> tuple[tuple[tuple[str, int, int, bytes], ...], BootCpu]:
    regions = []
    for name, address, size in REGIONS:
        data = read.raw_region(address, size)
        if len(data) != size:
            raise ValueError(f"short raw RAM read: {name}: {len(data)} != {size}")
        regions.append((name, address, size, data))
    return tuple(regions), read.native_boot_cpu_context()


def copy_raw_snapshot(
    read: SnapshotMemoryReader, frame: int, rom_sha1: str, sequence: int = 0
) -> RawRamSnapshot:
    """Copy native bytes/CPU under the caller's frame lock; no encoding or I/O."""
    regions, cpu = _copy_raw_parts(read)
    return RawRamSnapshot(
        1, sequence, frame, time.time_ns(), rom_sha1, tuple(cpu.gprs), cpu.cpsr, regions
    )


def persist_diagnostic_window(
    directory: Path,
    revision: int,
    snapshots: tuple[RawRamSnapshot, ...],
    omitted_samples: int = 0,
) -> dict[str, object]:
    """Retain two bounded diagnostic windows, separate from mandatory observations."""
    if revision < 1 or not 1 <= len(snapshots) <= 8 or omitted_samples < 0:
        raise ValueError("invalid diagnostic window bounds")
    directory.mkdir(parents=True, exist_ok=True)
    name = f"window-{revision:012d}"
    destination = directory / name
    if not destination.exists():
        # Admission is bounded even when a previous publication/rollback failed.
        # Keep the actual published window, not a higher-numbered orphan.
        current_path = directory / "current.json"
        published = (
            json.loads(current_path.read_text())["directory"] if current_path.exists() else None
        )
        for old in directory.glob("window-*"):
            if old.is_dir() and old.name[7:].isdigit() and old.name != published:
                shutil.rmtree(old)
    created = False
    with tempfile.TemporaryDirectory(prefix=".window-", dir=directory) as temporary:
        staging = Path(temporary)
        receipts = [_persist_capture(staging, sample) for sample in snapshots]
        manifest: dict[str, object] = {
            "revision": revision,
            "directory": name,
            "samples": len(snapshots),
            "retained_windows": 2,
            "omitted_samples": omitted_samples,
            "archive_sha256": [receipt["sha256"] for receipt in receipts],
            "first_frame": snapshots[0].frame,
            "last_frame": snapshots[-1].frame,
            "raw_bytes": sum(sum(size for _, _, size, _ in sample.regions) for sample in snapshots),
        }
        durable_write(staging / "window.json", json.dumps(manifest).encode())
        if destination.exists():
            if json.loads((destination / "window.json").read_text()) != manifest:
                raise ValueError("diagnostic revision reused with different evidence")
        else:
            staging.rename(destination)
            created = True
    pointer_published = False
    try:
        with tempfile.NamedTemporaryFile(
            dir=directory, prefix=".current-", delete=False
        ) as current:
            pending = Path(current.name)
            try:
                current.write(json.dumps(manifest).encode())
                current.flush()
                os.fsync(current.fileno())
                os.replace(pending, directory / "current.json")
                pointer_published = True
            finally:
                if not pointer_published:
                    pending.unlink(missing_ok=True)
    except Exception:
        if created and not pointer_published:
            shutil.rmtree(destination)
        raise
    return manifest


class Reservation:
    def __init__(self, archive: "RawRamArchive") -> None:
        self._archive = archive
        self._released = False
        self._sequence: int | None = None
        self._submitted = False

    def release(self) -> None:
        if not self._released:
            self._released = True
            self._archive._slots.release()

    @property
    def active(self) -> bool:
        return not self._released


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def durable_write(path: Path, data: bytes) -> None:
    with path.open("xb") as file:
        file.write(data)
        file.flush()
        os.fsync(file.fileno())


def _persist_capture(directory: Path, snapshot: RawRamSnapshot) -> dict[str, object]:
    """CPU and I/O half of capture; safe to run in a spawned worker."""

    regions = [
        dict(
            name=name,
            address=address,
            size=size,
            data_base64=base64.b64encode(data).decode("ascii"),
            sha256=digest(data),
        )
        for name, address, size, data in snapshot.regions
    ]
    metadata = dict(
        v=snapshot.v,
        sequence=snapshot.sequence,
        frame=snapshot.frame,
        timestamp_ns=snapshot.timestamp_ns,
        rom_sha1=snapshot.rom_sha1,
        gprs=list(snapshot.gprs),
        cpsr=snapshot.cpsr,
    )
    data = gzip.compress(
        json.dumps(dict(**metadata, regions=regions), separators=(",", ":")).encode(),
        compresslevel=1,
        mtime=0,
    )
    path = f"{snapshot.sequence:08d}.json.gz"
    durable_write(directory / path, data)
    receipt: dict[str, object] = dict(
        **metadata,
        path=path,
        sha256=digest(data),
        bytes=len(data),
        raw_bytes=sum(size for _, _, size, _ in snapshot.regions),
    )
    with (directory / "index.jsonl").open("ab") as index:
        index.write(json.dumps(receipt, separators=(",", ":")).encode() + b"\n")
        index.flush()
        os.fsync(index.fileno())
    return receipt


def _persist_pair(
    directory: Path,
    receipt: dict[str, object],
    decoded: dict[str, object],
    screenshot: str | None,
) -> None:
    entry = dict(
        raw_ram=receipt,
        state=decoded,
        screenshot_sha256=None
        if screenshot is None
        else digest(base64.b64decode(screenshot, validate=True)),
    )
    with (directory / "observations.jsonl").open("ab") as file:
        file.write(json.dumps(entry, separators=(",", ":")).encode() + b"\n")
        file.flush()
        os.fsync(file.fileno())


class RawRamArchive:
    def __init__(
        self,
        directory: Path,
        rom_sha1: str,
        *,
        executor: Executor | None = None,
        queue_size: int = PERSIST_QUEUE,
    ) -> None:
        if queue_size < 1:
            raise ValueError("raw RAM persistence queue must be positive")
        self.directory = directory
        self.rom_sha1 = rom_sha1
        self.sequence = 0
        self._executor = executor
        self._slots = threading.BoundedSemaphore(queue_size)
        self._sequence_lock = threading.Lock()
        self._submit = threading.Condition()
        self._next_submit = 0
        self._failure: BaseException | None = None
        self._closed = False
        directory.mkdir(parents=True, exist_ok=True)
        if (directory / "index.jsonl").exists():
            raise ValueError("raw RAM archive already exists; run directories are single-use")

    def _raise_if_unavailable(self) -> None:
        if self._failure is not None:
            raise RuntimeError("raw RAM persistence worker failed") from self._failure
        if self._closed:
            raise RuntimeError("raw RAM archive is closed")

    @contextmanager
    def reserve(self) -> Iterator[Reservation]:
        """Bound work before callers enter the emulator memory lock."""

        self._raise_if_unavailable()
        self._slots.acquire()
        reservation = Reservation(self)
        try:
            self._raise_if_unavailable()
            yield reservation
        finally:
            if reservation._sequence is not None and not reservation._submitted:
                with self._submit:
                    self._failure = RuntimeError(
                        f"raw RAM snapshot {reservation._sequence} was abandoned"
                    )
                    self._submit.notify_all()
            reservation.release()

    def snapshot(
        self, reservation: Reservation, read: SnapshotMemoryReader, frame: int
    ) -> RawRamSnapshot:
        """Copy the atomic emulator-owned bytes; do no encoding or disk I/O."""

        self._raise_if_unavailable()
        if not reservation.active or reservation._archive is not self:
            raise ValueError("inactive raw RAM persistence reservation")
        regions, cpu = _copy_raw_parts(read)
        with self._sequence_lock:
            sequence = self.sequence
            self.sequence += 1
        reservation._sequence = sequence
        return RawRamSnapshot(
            v=1,
            sequence=sequence,
            frame=frame,
            timestamp_ns=time.time_ns(),
            rom_sha1=self.rom_sha1,
            gprs=tuple(cpu.gprs),
            cpsr=cpu.cpsr,
            regions=regions,
        )

    def start_capture(
        self, reservation: Reservation, snapshot: RawRamSnapshot
    ) -> concurrent.futures.Future[object]:
        """Submit snapshots in sequence order, after the emulator lock is free."""

        if not reservation.active or reservation._archive is not self:
            raise ValueError("inactive raw RAM persistence reservation")
        with self._submit:
            while snapshot.sequence != self._next_submit:
                self._raise_if_unavailable()
                if snapshot.sequence < self._next_submit:
                    raise ValueError("raw RAM snapshot was already submitted")
                self._submit.wait()
            self._raise_if_unavailable()
            try:
                executor = self._executor if self._executor is not None else _process_pool()
                future = executor.submit(_persist_capture, self.directory, snapshot)
            except BaseException as error:
                self._failure = error
                self._submit.notify_all()
                raise
            self._next_submit += 1
            reservation._submitted = True
            self._submit.notify_all()
            return cast(concurrent.futures.Future[object], future)

    def finish_capture(
        self, reservation: Reservation, future: concurrent.futures.Future[object]
    ) -> dict[str, object]:
        try:
            value = future.result()
            if not isinstance(value, dict):
                raise TypeError("raw RAM persistence worker returned an invalid receipt")
            return cast(dict[str, object], value)
        except BaseException as error:
            with self._submit:
                self._failure = error
                self._submit.notify_all()
            raise
        finally:
            reservation.release()

    def capture(self, read: SnapshotMemoryReader, frame: int) -> dict[str, object]:
        with self.reserve() as reservation:
            snapshot = self.snapshot(reservation, read, frame)
            future = self.start_capture(reservation, snapshot)
            return self.finish_capture(reservation, future)

    def pair(
        self, receipt: dict[str, object], decoded: dict[str, object], screenshot: str | None
    ) -> None:
        with self.reserve():
            executor = self._executor if self._executor is not None else _process_pool()
            future = executor.submit(_persist_pair, self.directory, receipt, decoded, screenshot)
            try:
                future.result()
            except BaseException as error:
                with self._submit:
                    self._failure = error
                    self._submit.notify_all()
                raise

    def close(self) -> None:
        """Reject future work after all synchronous callers have returned."""

        with self._submit:
            self._closed = True
            self._submit.notify_all()


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
        if self.rom is not None and 0x08000000 <= address and address + length <= 0x0E000000:
            # The cartridge bus exposes the same ROM through three 32 MiB
            # wait-state windows (0x08/0x0A/0x0C). Game readers legitimately
            # follow pointers through any of those physical mirrors.
            offset = (address - 0x08000000) % 0x02000000
            if offset + length <= len(self.rom):
                return self.rom[offset : offset + length]
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
