"""just replay-verify: the replay loop, clock and readers, driven by a fake emulator in memory."""

import base64
import bisect
import gzip
import hashlib
import io
import json
import lzma
import tarfile
from collections.abc import Iterable
from typing import BinaryIO

import pytest

from pokebench_env import replay_verify as rv
from pokebench_env.raw_ram import REGIONS

ROM = b"pokebench replay-verify test cartridge"
ROM_SHA1 = hashlib.sha1(ROM).hexdigest()
RUN = "2026-11-10T15-37-43_opus-rayquaza-boot_67d7"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# The hand replay's clock (runs/release-staging/67d7/replay/replay.py), ported as the reference.
def reference_clock(samples: Iterable[tuple[int, float]]) -> tuple[list[int], list[float]]:
    frames: list[int] = []
    values: list[float] = []
    for fr, ms in sorted(samples):
        if frames and fr == frames[-1]:
            continue
        if values and ms < values[-1]:
            ms = values[-1]
        frames.append(fr)
        values.append(ms)
    return frames, values


def reference_clock_at(clock: tuple[list[int], list[float]], frame: int) -> int:
    frames, values = clock
    i = bisect.bisect_right(frames, frame)
    a, b = max(0, i - 1), min(len(frames) - 1, i)
    if a == b or frames[b] == frames[a]:
        return int(values[a])
    return int(values[a] + (values[b] - values[a]) * (frame - frames[a]) / (frames[b] - frames[a]))


def fill(frame: int, buttons: tuple[str, ...], rtc: int, index: int) -> int:
    return (frame * 31 + sum(map(ord, "".join(buttons))) + rtc + index * 17) % 256


class FakeEmulator:
    def __init__(self) -> None:
        self.frame = 0
        self.buttons: tuple[str, ...] = ()
        self.rtc = 0
        self.rtc_log: list[tuple[int, int]] = []
        self.slip_at: int | None = None

    def set_rtc(self, ms: int) -> None:
        self.rtc = ms

    def run_frame(self, buttons: tuple[str, ...]) -> int:
        self.frame += 1
        self.buttons = buttons
        self.rtc_log.append((self.frame, self.rtc))
        return self.frame + (1 if self.slip_at == self.frame else 0)

    def region(self, address: int, size: int) -> bytes:
        index = [a for _, a, _ in REGIONS].index(address)
        return bytes([fill(self.frame, self.buttons, self.rtc, index)]) * size


class Run:
    """Events plus snapshots consistent with what the fake emulator will compute."""

    def __init__(self) -> None:
        # (frame, timestamp ms, buttons or None for a non-input action)
        self.actions: list[tuple[int, float, list[str] | None]] = [
            (1, 1000.0, []),
            (2, 1010.0, ["A"]),
            (2, 1005.0, None),  # same frame, earlier time: the earliest sample wins
            (4, 1003.0, ["A", "UP"]),  # goes backwards: clamped
            (7, 1100.0, []),
        ]
        # (frame, timestamp ms) of each snapshot, in sequence order
        self.snaps: list[tuple[int, float]] = [
            (0, 999.0),
            (3, 1020.0),
            (5, 1050.0),
            (5, 1051.0),
            (9, 1200.0),
        ]
        self.rom_sha1 = ROM_SHA1
        self.tamper: dict[int, str] = {}  # sequence -> region name whose content is altered

    def samples(self) -> list[tuple[int, float]]:
        # The values a reader gets back: server_timestamp seconds * 1000, timestamp_ns / 1e6.
        return [(f, (ms / 1000.0) * 1000.0) for f, ms, _ in self.actions] + [
            (f, int(ms * 1e6) / 1e6) for f, ms in self.snaps
        ]

    def state_at(self, frame: int) -> tuple[tuple[str, ...], int]:
        clock = reference_clock(self.samples())
        buttons: tuple[str, ...] = ()
        for f, _, b in sorted(self.actions, key=lambda a: a[0]):
            if b is not None and f <= frame:
                buttons = tuple(b)
        return buttons, reference_clock_at(clock, frame)

    def event_bytes(self) -> bytes:
        lines = [{"v": 1, "run": RUN, "seq": 0, "type": "run_start", "turn": 0}]
        for f, ms, b in self.actions:
            details = {"buttons": b} if b is not None else {"press": "A"}
            kind = "native_input" if b is not None else "native_press"
            lines.append(
                {
                    "type": "native_action",
                    "frame": f,
                    "server_timestamp": ms / 1000.0,
                    "kind": kind,
                    "details": details,
                }
            )
        lines.append({"type": "assistant", "text": 'I see "native_action" in my notes'})
        return b"".join(json.dumps(line).encode() + b"\n" for line in lines)

    def record(self, sequence: int, frame: int, ms: float) -> dict[str, object]:
        buttons, rtc = self.state_at(frame)
        regions = []
        for index, (name, address, size) in enumerate(REGIONS):
            value = fill(frame, buttons if frame else (), rtc, index)
            if self.tamper.get(sequence) == name:
                value ^= 0xFF
            data = bytes([value]) * size
            regions.append(
                {
                    "name": name,
                    "address": address,
                    "size": size,
                    "data_base64": base64.b64encode(data).decode(),
                    "sha256": sha256(data),
                }
            )
        return {
            "v": 1,
            "sequence": sequence,
            "frame": frame,
            "timestamp_ns": int(ms * 1e6),
            "rom_sha1": self.rom_sha1,
            "gprs": [0] * 16,
            "cpsr": 0,
            "regions": regions,
        }

    def ram_bytes(self) -> bytes:
        return b"".join(
            json.dumps(self.record(i, f, ms)).encode() + b"\n"
            for i, (f, ms) in enumerate(self.snaps)
        )


def pack(data: bytes, ext: str) -> bytes:
    if ext == ".gz":
        return gzip.compress(data, mtime=0)
    if ext == ".xz":
        return lzma.compress(data)
    return data


def release(run: Run, ext: str = "", events_tar: bool = False) -> dict[str, bytes]:
    events = run.event_bytes()
    if events_tar:
        out = io.BytesIO()
        with tarfile.open(fileobj=out, mode="w") as tar:
            info = tarfile.TarInfo("events.jsonl")
            info.size = len(events)
            tar.addfile(info, io.BytesIO(events))
        files = {"events-67d7.tar" + ext: pack(out.getvalue(), ext)}
    else:
        files = {"events-67d7.jsonl" + ext: pack(events, ext)}
    files["raw-ram-67d7.jsonl" + ext] = pack(run.ram_bytes(), ext)
    files["raw-ram-final.json.gz"] = b"final snapshot: never read by the replay"
    return resum(files)


def resum(files: dict[str, bytes]) -> dict[str, bytes]:
    files["SHA256SUMS"] = "".join(
        f"{sha256(v)}  {k}\n" for k, v in files.items() if k != "SHA256SUMS"
    ).encode()
    return files


class MemoryRelease:
    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = files
        self.opened: list[str] = []

    def names(self) -> list[str]:
        return sorted(self.files)

    def open(self, name: str) -> BinaryIO:
        self.opened.append(name)
        return io.BytesIO(self.files[name])


def verify(
    files: dict[str, bytes],
    *,
    until: int | None = 100,
    rom: bytes | None = ROM,
    emulator: FakeEmulator | None = None,
) -> rv.Report:
    fake = emulator or FakeEmulator()
    return rv.verify(
        MemoryRelease(files),
        rom,
        rom_sha1=ROM_SHA1,
        until=until,
        make_emulator=lambda _rom: fake,
        rom_problem=None,
    )


def failed(report: rv.Report) -> dict[str, str]:
    return {c.name: c.detail for c in report.checks if not c.ok}


def result(report: rv.Report, name: str) -> rv.Check:
    return next(c for c in report.checks if c.name == name)


# --- the clock (INV-4) ---


def test_streamed_clock_equals_the_hand_replays_clock() -> None:
    samples = [
        (1, 1000.0),
        (2, 1010.0),
        (2, 1005.0),
        (4, 1003.0),
        (7, 1100.0),
        (0, 999.0),
        (3, 1020.0),
        (5, 1050.0),
        (5, 1049.0),
        (9, 1200.0),
        (9, 1190.0),
    ]
    reference = reference_clock(samples)
    events = sorted(s for i, s in enumerate(samples) if i % 2 == 0)
    snaps = [s for i, s in enumerate(samples) if i % 2 == 1]
    snaps.sort(
        key=lambda s: s[0]
    )  # frame order, as a raw-RAM log is; ms order within a frame is not promised
    clock = rv.Clock(events, iter(snaps))
    for frame in range(0, 14):
        assert clock.at(frame) == reference_clock_at(reference, frame), frame


def test_clock_before_the_first_and_after_the_last_sample() -> None:
    clock = rv.Clock([(10, 500.0)], iter([(20, 700.0)]))
    assert [clock.at(f) for f in (0, 10, 15, 20, 99)] == [500, 500, 600, 700, 700]
    with pytest.raises(rv.ReleaseError, match="no clock samples"):
        rv.Clock([], iter([])).at(0)


# --- readers ---


def test_read_inputs_keeps_input_changes_and_every_clock_sample() -> None:
    inputs = rv.read_inputs(io.BytesIO(Run().event_bytes()))
    assert inputs.inputs == {1: (), 2: ("A",), 4: ("A", "UP"), 7: ()}
    assert sorted(inputs.samples) == sorted(
        (f, (ms / 1000.0) * 1000.0) for f, ms, _ in Run().actions
    )
    assert inputs.actions == 5


@pytest.mark.parametrize(
    ("line", "message"),
    [
        (
            {
                "type": "native_action",
                "frame": 3,
                "server_timestamp": 1.0,
                "kind": "native_input",
                "details": {"buttons": ["TURBO"]},
            },
            "unknown buttons",
        ),
        (
            {
                "type": "native_action",
                "frame": "3",
                "server_timestamp": 1.0,
                "kind": "native_input",
                "details": {"buttons": []},
            },
            "frame",
        ),
        (
            {
                "type": "native_action",
                "frame": 3,
                "server_timestamp": None,
                "kind": "native_input",
                "details": {"buttons": []},
            },
            "server_timestamp",
        ),
        (
            {
                "type": "native_action",
                "frame": 3,
                "server_timestamp": 1.0,
                "kind": "native_input",
                "details": {},
            },
            "buttons",
        ),
    ],
)
def test_read_inputs_rejects_malformed_actions(line: dict[str, object], message: str) -> None:
    with pytest.raises(rv.ReleaseError, match=message):
        rv.read_inputs(io.BytesIO(json.dumps(line).encode() + b"\n"))


def test_read_inputs_rejects_two_inputs_for_one_frame() -> None:
    line = {
        "type": "native_action",
        "frame": 3,
        "server_timestamp": 1.0,
        "kind": "native_input",
        "details": {"buttons": []},
    }
    with pytest.raises(rv.ReleaseError, match="two input changes"):
        rv.read_inputs(io.BytesIO((json.dumps(line) + "\n" + json.dumps(line) + "\n").encode()))


def test_read_snapshots_validates_order_rom_and_digests() -> None:
    run = Run()
    snaps = list(rv.read_snapshots(io.BytesIO(run.ram_bytes()), ROM_SHA1))
    assert [(s.sequence, s.frame) for s in snaps] == [(0, 0), (1, 3), (2, 5), (3, 5), (4, 9)]
    assert snaps[1].timestamp_ms == 1020.0 and len(snaps[1].digests) == 7

    def lines(*records: dict[str, object]) -> io.BytesIO:
        return io.BytesIO(b"".join(json.dumps(r).encode() + b"\n" for r in records))

    with pytest.raises(rv.ReleaseError, match="sequence"):
        list(rv.read_snapshots(lines(run.record(0, 0, 1.0), run.record(2, 3, 2.0)), ROM_SHA1))
    with pytest.raises(rv.ReleaseError, match="frame"):
        list(rv.read_snapshots(lines(run.record(0, 5, 1.0), run.record(1, 3, 2.0)), ROM_SHA1))
    with pytest.raises(rv.ReleaseError, match="rom_sha1"):
        list(rv.read_snapshots(lines(run.record(0, 0, 1.0)), "f" * 40))
    broken = run.record(0, 0, 1.0)
    broken["regions"][0]["sha256"] = "0" * 64  # type: ignore[index]
    with pytest.raises(rv.ReleaseError, match="integrity"):
        list(rv.read_snapshots(lines(broken), ROM_SHA1))
    no_time = run.record(0, 0, 1.0)
    del no_time["timestamp_ns"]
    with pytest.raises(rv.ReleaseError, match="timestamp_ns"):
        list(rv.read_snapshots(lines(no_time), ROM_SHA1))


# --- the replay (INV-2) ---


@pytest.mark.parametrize("ext", ["", ".gz", ".xz"])
@pytest.mark.parametrize("events_tar", [False, True])
def test_a_faithful_replay_passes(ext: str, events_tar: bool) -> None:
    fake = FakeEmulator()
    report = verify(release(Run(), ext, events_tar), until=None, emulator=fake)
    assert failed(report) == {}
    detail = result(report, "replay").detail
    assert "frames 0-9" in detail and "5 of 5 snapshots match on all 7 regions" in detail
    run = Run()
    assert fake.rtc_log == [(f, run.state_at(f)[1]) for f in range(1, 10)]
    assert result(report, "integrity").detail.startswith("2 files read match SHA256SUMS")


def test_the_first_divergence_stops_the_replay() -> None:
    run = Run()
    run.tamper = {2: "vram"}
    fake = FakeEmulator()
    report = verify(release(run), until=None, emulator=fake)
    detail = failed(report)["replay"]
    assert (
        "frame 5" in detail
        and "snapshot 2" in detail
        and "vram" in detail
        and "2 matched before it" in detail
    )
    assert fake.frame == 5  # nothing ran after the divergence


def test_a_frame_counter_slip_is_a_divergence() -> None:
    fake = FakeEmulator()
    fake.slip_at = 4
    detail = failed(verify(release(Run()), until=None, emulator=fake))["replay"]
    assert "frame counter 5 after step 4" in detail
    assert fake.frame == 4


def test_a_prefix_compares_only_its_snapshots() -> None:
    fake = FakeEmulator()
    report = verify(release(Run()), until=5, emulator=fake)
    assert "frames 0-5" in result(report, "replay").detail
    assert "4 of 4 snapshots" in result(report, "replay").detail
    assert fake.frame == 5


def test_replay_needs_at_least_one_snapshot_in_range() -> None:
    run = Run()
    run.snaps = [(50, 2000.0)]
    assert "no raw-RAM snapshot" in failed(verify(release(run), until=10))["replay"]


# --- integrity and inputs (INV-3) ---


def test_inputs_must_be_listed_present_and_supported() -> None:
    files = release(Run())
    tampered = dict(files)
    tampered["raw-ram-67d7.jsonl"] += b""
    tampered["events-67d7.jsonl"] = files["events-67d7.jsonl"].replace(b'"A"', b'"B"')
    assert "events-67d7.jsonl: sha256 mismatch" in failed(verify(tampered))["integrity"]
    unlisted = dict(files)
    unlisted["SHA256SUMS"] = b"".join(
        line + b"\n" for line in files["SHA256SUMS"].splitlines() if b"raw-ram-67d7" not in line
    )
    assert "raw-ram-67d7.jsonl: not listed" in failed(verify(unlisted))["integrity"]
    missing = {k: v for k, v in files.items() if k != "raw-ram-67d7.jsonl"}
    bad = failed(verify(resum(missing)))
    assert "missing raw-RAM log" in bad["replay"]
    zst = {k: v for k, v in files.items() if k != "raw-ram-67d7.jsonl"} | {
        "raw-ram-67d7.jsonl.zst": b"z"
    }
    assert "zstd" in failed(verify(resum(zst)))["replay"]


def test_rom_must_match() -> None:
    files = release(Run())
    assert "sha1" in failed(verify(files, rom=b"other"))["rom"]
    report = rv.verify(
        MemoryRelease(files),
        None,
        rom_sha1=ROM_SHA1,
        until=10,
        make_emulator=lambda _r: FakeEmulator(),
        rom_problem="POKEBENCH_ROM is not set",
    )
    bad = failed(report)
    assert bad["rom"] == "POKEBENCH_ROM is not set"
    assert "ROM" in bad["replay"]


def test_oversized_lines_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rv, "SNAPSHOT_LINE_CAP", 1024)
    assert "longer than 1024 bytes" in failed(verify(release(Run())))["replay"]


def test_reads_only_the_two_inputs_and_never_the_final_snapshot() -> None:
    release_files = MemoryRelease(release(Run()))
    rv.verify(
        release_files,
        ROM,
        rom_sha1=ROM_SHA1,
        until=None,
        make_emulator=lambda _r: FakeEmulator(),
        rom_problem=None,
    )
    assert sorted(release_files.opened) == ["SHA256SUMS", "events-67d7.jsonl", "raw-ram-67d7.jsonl"]


# --- the command ---


def test_main_parses_frames_and_all() -> None:
    files = release(Run())
    for argv, frames in (
        (["rel"], "frames 0-150,000"),
        (["rel", "--frames", "5"], "frames 0-5"),
        (["rel", "--all"], "frames 0-9"),
    ):
        out = io.StringIO()
        code = rv.main(
            argv,
            {"POKEBENCH_ROM": "rom.gba"},
            open_release=lambda _p: MemoryRelease(files),
            read_rom=lambda _p: ROM,
            out=out,
            rom_sha1=ROM_SHA1,
            make_emulator=lambda _r: FakeEmulator(),
        )
        assert code == 0, out.getvalue()
        assert frames in out.getvalue()
        assert "replay-verify: 3 checks, all PASS" in out.getvalue()
    assert rv.DEFAULT_FRAMES == 150_000
    out = io.StringIO()
    assert rv.main([], {}, out=out) == 2
    assert rv.main(["rel", "--frames", "0"], {}, out=io.StringIO()) == 2
    assert rv.main(["rel", "--frames", "5", "--all"], {}, out=io.StringIO()) == 2

    def no_folder(_path: object) -> MemoryRelease:
        raise NotADirectoryError("rel")

    out = io.StringIO()
    assert rv.main(["rel"], {}, open_release=no_folder, out=out) == 1
    assert "FAIL release folder" in out.getvalue()
    out = io.StringIO()
    code = rv.main(
        ["rel"],
        {},
        open_release=lambda _p: MemoryRelease(files),
        out=out,
        make_emulator=lambda _r: FakeEmulator(),
    )
    assert code == 1 and "FAIL rom: POKEBENCH_ROM is not set" in out.getvalue()

    def no_rom(_path: object) -> bytes:
        raise FileNotFoundError("rom.gba")

    out = io.StringIO()
    code = rv.main(
        ["rel"],
        {"POKEBENCH_ROM": "rom.gba"},
        open_release=lambda _p: MemoryRelease(files),
        read_rom=no_rom,
        out=out,
    )
    assert code == 1 and "cannot read POKEBENCH_ROM" in out.getvalue()
