"""Replay a published run from power-on and compare its RAM with every recorded snapshot.

`just replay-verify <release-folder> [--frames N | --all]`. The release's event log gives the inputs
(native_input changes; buttons hold until the next change) and, with the raw-RAM log's
timestamps, the wall clock the run saw. The emulator's RTC is pinned to that clock every frame.
At each frame, every snapshot recorded there is compared region by region. The first difference
stops the replay. Read-only: the release is streamed once through the integrity tee.
"""

import hashlib
import heapq
import io
import itertools
import json
import os
import re
import sys
import tempfile
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO, Protocol, TextIO, TypeVar, cast

from pokebench_env import verify_release as vr
from pokebench_env.raw_ram import MAX_ARCHIVE_BYTES, REGIONS, parse_raw_ram_record
from pokebench_env.rom import EMERALD_SHA1
from pokebench_env.verify_release import Check, ReleaseError, ReleaseFiles, Report

T = TypeVar("T")

DEFAULT_FRAMES = 150_000
SNAPSHOT_LINE_CAP = MAX_ARCHIVE_BYTES + 1
BUTTONS = frozenset({"A", "B", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT", "L", "R"})
KINDS = {
    "events": vr.KINDS["events"],
    "raw-RAM log": re.compile(r"raw-ram(?!-final)[A-Za-z0-9._-]*\.jsonl(\.gz|\.xz|\.zst)?"),
}
CHECKS = ("integrity", "rom", "replay")


class Emulator(Protocol):
    def set_rtc(self, ms: int) -> None: ...

    def run_frame(self, buttons: tuple[str, ...]) -> int: ...

    def region(self, address: int, size: int) -> bytes: ...


# --- the recorded clock ---


class Clock:
    """The hand replay's clock, computed while streaming.

    Samples merge by frame; each frame keeps its earliest sample; values never go backwards; between
    samples the time is interpolated linearly; before the first or after the last it is held.
    """

    def __init__(
        self, events: Iterable[tuple[int, float]], snapshots: Iterator[tuple[int, float]]
    ) -> None:
        self._samples = self._merged(heapq.merge(sorted(events), snapshots, key=lambda s: s[0]))
        self._prev: tuple[int, float] | None = None
        self._next = next(self._samples, None)

    @staticmethod
    def _merged(samples: Iterator[tuple[int, float]]) -> Iterator[tuple[int, float]]:
        last: float | None = None
        for frame, group in itertools.groupby(samples, key=lambda s: s[0]):
            ms = min(value for _, value in group)
            if last is not None and ms < last:
                ms = last
            last = ms
            yield frame, ms

    def at(self, frame: int) -> int:
        while self._next is not None and self._next[0] <= frame:
            self._prev, self._next = self._next, next(self._samples, None)
        if self._prev is None:
            if self._next is None:
                raise ReleaseError("no clock samples in the release")
            return int(self._next[1])
        if self._next is None:
            return int(self._prev[1])
        (fa, va), (fb, vb) = self._prev, self._next
        return int(va + (vb - va) * (frame - fa) / (fb - fa))


# --- readers ---


@dataclass
class RunInputs:
    inputs: dict[int, tuple[str, ...]] = field(default_factory=dict)
    samples: list[tuple[int, float]] = field(default_factory=list)
    actions: int = 0


def read_inputs(stream: BinaryIO) -> RunInputs:
    run = RunInputs()
    for number, line in vr._lines(stream, vr.EVENT_LINE_CAP, "event log"):
        if b'"native_action"' not in line:
            continue
        event = json.loads(line)
        if not isinstance(event, dict) or event.get("type") != "native_action":
            continue
        frame, stamp = event.get("frame"), event.get("server_timestamp")
        if type(frame) is not int or frame < 0:
            raise ReleaseError(f"event log line {number}: native_action frame {frame!r}")
        if type(stamp) not in (int, float):
            raise ReleaseError(f"event log line {number}: server_timestamp {stamp!r}")
        run.samples.append((frame, float(cast(float, stamp)) * 1000.0))
        run.actions += 1
        if event.get("kind") != "native_input":
            continue
        details = event.get("details")
        buttons = details.get("buttons") if isinstance(details, dict) else None
        if not isinstance(buttons, list) or not all(isinstance(b, str) for b in buttons):
            raise ReleaseError(f"event log line {number}: native_input without buttons")
        if not set(buttons) <= BUTTONS:
            raise ReleaseError(f"event log line {number}: unknown buttons {buttons}")
        if frame in run.inputs:
            raise ReleaseError(f"event log line {number}: two input changes at frame {frame}")
        run.inputs[frame] = tuple(buttons)
    return run


@dataclass(frozen=True)
class Snapshot:
    sequence: int
    frame: int
    timestamp_ms: float
    digests: tuple[tuple[str, int, int, str], ...]


def read_snapshots(stream: BinaryIO, rom_sha1: str) -> Iterator[Snapshot]:
    previous_frame = -1
    for number, line in vr._lines(stream, SNAPSHOT_LINE_CAP, "raw-RAM log"):
        try:
            value = json.loads(line)
            parse_raw_ram_record(value)
        except (ValueError, TypeError) as error:
            raise ReleaseError(f"raw-RAM log line {number}: {error}") from None
        sequence, frame, stamp = (
            value.get("sequence"),
            value.get("frame"),
            value.get("timestamp_ns"),
        )
        if sequence != number - 1:
            raise ReleaseError(f"raw-RAM log line {number} has sequence {sequence!r}")
        if type(frame) is not int or frame < previous_frame:
            raise ReleaseError(
                f"raw-RAM log line {number} has frame {frame!r} after {previous_frame}"
            )
        if type(stamp) is not int:
            raise ReleaseError(f"raw-RAM log line {number} has no integer timestamp_ns")
        if value.get("rom_sha1") != rom_sha1:
            raise ReleaseError(f"raw-RAM log line {number} has rom_sha1 {value.get('rom_sha1')!r}")
        previous_frame = frame
        digests = tuple((r["name"], r["address"], r["size"], r["sha256"]) for r in value["regions"])
        yield Snapshot(cast(int, sequence), frame, stamp / 1e6, digests)


# --- the replay ---


@dataclass(frozen=True)
class Divergence:
    frame: int
    detail: str


@dataclass
class ReplayResult:
    matched: int = 0
    last_frame: int = 0
    divergence: Divergence | None = None


def replay(
    emulator: Emulator, run: RunInputs, snapshots: Iterator[Snapshot], until: int | None
) -> ReplayResult:
    """Step frames 1..until (or to the last snapshot) and compare every snapshot on its frame."""
    for_clock, for_compare = itertools.tee(snapshots)
    clock = Clock(run.samples, ((s.frame, s.timestamp_ms) for s in for_clock))
    result = ReplayResult()
    pending = next(for_compare, None)

    def compare(frame: int) -> Divergence | None:
        nonlocal pending
        while pending is not None and pending.frame == frame:
            bad = [
                name
                for name, address, size, digest in pending.digests
                if hashlib.sha256(emulator.region(address, size)).hexdigest() != digest
            ]
            if bad:
                return Divergence(
                    frame,
                    f"first divergence at frame {frame:,} (snapshot {pending.sequence}): "
                    f"{', '.join(bad)} differ; {result.matched:,} matched before it",
                )
            result.matched += 1
            pending = next(for_compare, None)
        return None

    emulator.set_rtc(clock.at(0))
    result.divergence = compare(0)
    buttons: tuple[str, ...] = ()
    frame = 0
    while result.divergence is None:
        if (until is not None and frame >= until) or (until is None and pending is None):
            break
        frame += 1
        buttons = run.inputs.get(frame, buttons)
        emulator.set_rtc(clock.at(frame))
        counter = emulator.run_frame(buttons)
        if counter != frame:
            result.divergence = Divergence(frame, f"frame counter {counter} after step {frame}")
            break
        result.divergence = compare(frame)
    result.last_frame = frame
    return result


# --- the command ---


def verify(
    files: ReleaseFiles,
    rom: bytes | None,
    *,
    rom_sha1: str = EMERALD_SHA1,
    until: int | None,
    make_emulator: Callable[[bytes], Emulator],
    rom_problem: str | None,
) -> Report:
    names = files.names()
    sums, sum_problems = vr._read_sums(files, names)
    found = vr.discover(names, list(sums), KINDS)
    digests: dict[str, str] = {}
    read_problems: dict[str, str] = {}
    opened: list[tuple[str, vr._Tee, BinaryIO]] = []

    def open_input(kind: str) -> tuple[str, BinaryIO]:
        target = found[kind]
        if isinstance(target, Check):
            raise ReleaseError(target.detail)
        raw = files.open(target)
        tee = vr._Tee(raw)
        opened.append((target, tee, raw))
        buffered = cast(BinaryIO, io.BufferedReader(tee, vr.CHUNK))
        return target, buffered if vr._is_tar(target) else vr._decoder(target, buffered)

    ok_rom = rom is not None and hashlib.sha1(rom, usedforsecurity=False).hexdigest() == rom_sha1
    try:
        if not ok_rom:
            raise ReleaseError("not run: needs the matching ROM (POKEBENCH_ROM)")
        name, events = open_input("events")
        run = vr.read_event_source(events, name, read_inputs)
        _, ram = open_input("raw-RAM log")
        assert rom is not None
        result = replay(make_emulator(rom), run, read_snapshots(ram, rom_sha1), until)
        if result.divergence is not None:
            replay_check = Check("replay", False, result.divergence.detail)
        elif result.matched == 0:
            replay_check = Check(
                "replay", False, f"no raw-RAM snapshot in frames 0-{result.last_frame:,}"
            )
        else:
            replay_check = Check(
                "replay",
                True,
                f"frames 0-{result.last_frame:,} replayed from power-on with "
                f"{run.actions:,} logged actions; {result.matched:,} of {result.matched:,} "
                "snapshots match on all "
                f"{len(REGIONS)} regions",
            )
    except Exception as error:  # noqa: BLE001 - fail closed: any failure is a named FAIL
        replay_check = Check("replay", False, vr._failure(error))
    for target, tee, raw in opened:
        try:
            digests[target] = tee.drain()
        except OSError as error:
            read_problems[target] = f"cannot be read to the end: {error}"
        raw.close()
    integrity = vr._integrity(names, found, sums, sum_problems, digests, read_problems)
    return Report([integrity, vr._rom_check(rom, rom_problem, rom_sha1), replay_check], [])


def render(report: Report) -> str:
    lines = [f"{'PASS' if c.ok else 'FAIL'} {c.name}: {c.detail}" for c in report.checks]
    failures = sum(not c.ok for c in report.checks)
    lines.append(
        f"replay-verify: {len(report.checks)} checks, all PASS"
        if not failures
        else f"replay-verify: {failures} of {len(report.checks)} checks FAILED"
    )
    return "\n".join(lines)


# The thin emulator entrypoint; replay() is tested with a fake.
class MgbaEmulator:  # pragma: no cover
    """Set up as the run's game server was: a fresh ROM copy, no save, two resets, RTC pinned."""

    def __init__(self, rom: bytes) -> None:
        import mgba.core  # type: ignore[import-untyped]
        import mgba.image  # type: ignore[import-untyped]
        import mgba.log  # type: ignore[import-untyped]
        from mgba._pylib import lib  # type: ignore[import-untyped]

        mgba.log.silence()
        self._dir = tempfile.TemporaryDirectory(prefix="replay-verify-")
        path = Path(self._dir.name) / "rom.gba"
        path.write_bytes(rom)
        core = mgba.core.load_path(str(path))
        core.autoload_save()
        core.reset()
        width, height = core.desired_video_dimensions()
        self._buffer = mgba.image.Image(width, height)
        core.set_video_buffer(self._buffer)
        core.reset()
        self._core = core
        self._rtc = core._core.rtc
        self._rtc.override = lib.RTC_FIXED
        self._keys = {
            "A": lib.GBA_KEY_A, "B": lib.GBA_KEY_B, "START": lib.GBA_KEY_START,
            "SELECT": lib.GBA_KEY_SELECT, "UP": lib.GBA_KEY_UP, "DOWN": lib.GBA_KEY_DOWN,
            "LEFT": lib.GBA_KEY_LEFT, "RIGHT": lib.GBA_KEY_RIGHT, "L": lib.GBA_KEY_L,
            "R": lib.GBA_KEY_R,
        }  # fmt: skip
        self._audio = core.get_audio_channels()
        self._audio.set_rate(48000)
        self._audio.clear()

    def set_rtc(self, ms: int) -> None:
        self._rtc.value = ms

    def run_frame(self, buttons: tuple[str, ...]) -> int:
        mask = 0
        for button in buttons:
            mask |= 1 << self._keys[button]
        self._core._core.setKeys(self._core._core, mask)
        self._core.run_frame()
        self._audio.read(self._audio.available)  # drained as the server's spectator tap did
        return int(self._core.frame_counter)

    def region(self, address: int, size: int) -> bytes:
        from pokebench_env.memory_reader import copy_native_region

        return copy_native_region(self._core, address, size)


def _read_rom(path: Path) -> bytes:  # pragma: no cover - thin disk entrypoint
    return vr._read_rom(path)


def main(
    argv: Sequence[str],
    environ: Mapping[str, str],
    *,
    open_release: Callable[[Path], ReleaseFiles] = vr.FolderRelease,
    read_rom: Callable[[Path], bytes] = _read_rom,
    out: TextIO = sys.stdout,
    rom_sha1: str = EMERALD_SHA1,
    make_emulator: Callable[[bytes], Emulator] = MgbaEmulator,
) -> int:
    args = list(argv)
    until: int | None = DEFAULT_FRAMES
    usage = "usage: just replay-verify <release folder> [--frames N | --all]"
    if "--all" in args:
        args.remove("--all")
        until = None
        if "--frames" in args:
            print(usage, file=out)
            return 2
    if "--frames" in args:
        at = args.index("--frames")
        value = args[at + 1] if at + 1 < len(args) else ""
        if not value.isdigit() or int(value) < 1:
            print(usage, file=out)
            return 2
        until = int(value)
        del args[at : at + 2]
    if len(args) != 1:
        print(usage, file=out)
        return 2
    rom: bytes | None = None
    problem: str | None = None
    path = environ.get("POKEBENCH_ROM")
    if not path:
        problem = "POKEBENCH_ROM is not set (point it at your Pokémon Emerald (U) ROM)"
    else:
        try:
            rom = read_rom(Path(path))
        except OSError as error:
            problem = f"cannot read POKEBENCH_ROM: {error}"
    try:
        release = open_release(Path(args[0]))
    except OSError as error:
        print(f"FAIL release folder: {error}", file=out)
        return 1
    report = verify(
        release,
        rom,
        rom_sha1=rom_sha1,
        until=until,
        make_emulator=make_emulator,
        rom_problem=problem,
    )
    print(render(report), file=out)
    return 0 if report.ok else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:], os.environ))
