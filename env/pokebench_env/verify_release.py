"""Check a published PokeBench clear with nothing but the reader's ROM (`just verify-release`).

The release folder is an untrusted download. Each file this tool reads is streamed once,
read-only, through a sha256 tee, so the bytes checked are the bytes hashed. Nothing is extracted
or written. The headline (game clear, badges, Rayquaza) comes from native readers on the run's
final RAM snapshot, never from the run's own milestone events. The full raw-RAM log is not read
here; it is for the replay.
"""

import gzip
import hashlib
import io
import json
import lzma
import os
import re
import sys
import tarfile
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO, Protocol, TextIO, TypeVar, cast

from pokebench_env.game_state import BADGES, FLAG_BADGE01, PARTY, PARTY_COUNT
from pokebench_env.pokemon import PartyMon, decode_party_mon
from pokebench_env.raw_ram import MAX_ARCHIVE_BYTES, ArchivedMemoryReader, parse_raw_ram_record
from pokebench_env.rom import EMERALD_SHA1

T = TypeVar("T")

EVENT_LINE_CAP = 16 * 1024 * 1024
STATE_CAP = 8 * 1024 * 1024
SIDECAR_CAP = 1024 * 1024
SUMS_CAP = 1024 * 1024
EXTENSION_CAP = 64 * 1024
MAX_MEMBERS = 4096
ROM_CAP = 64 * 1024 * 1024
CHUNK = 1 << 20
MAX_PROBLEMS = 5

SAVE1_POINTER = 0x03005D8C
SAVE_FLAGS, FLAG_BYTES = 0x1270, 0x12C
EWRAM, EWRAM_END = 0x02000000, 0x02040000
FLAG_SYS_GAME_CLEAR = 0x864
SPECIES_RAYQUAZA = 406
TARGET = "GAME_CLEAR_CONFIRMED"
FINAL_SAVE = "GAME_CLEAR_FINAL"
RUN_END_SAVE = "RUN_END"
FORBIDDEN_EVENTS = ("human_input", "human_sample", "operator_control")

KINDS = {
    "events": re.compile(r"events[A-Za-z0-9._-]*\.(jsonl|tar)(\.gz|\.xz|\.zst)?"),
    "final snapshot": re.compile(r"raw-ram-final[A-Za-z0-9._-]*\.json(\.gz|\.xz|\.zst)?"),
    "checkpoints": re.compile(r"checkpoints[A-Za-z0-9._-]*\.tar(\.gz|\.xz|\.zst)?"),
}
SUM_LINE = re.compile(r"([0-9a-f]{64}) [ *]([A-Za-z0-9][A-Za-z0-9._+-]*)")
EVENT_MEMBER = re.compile(r"events[A-Za-z0-9._-]*\.jsonl")
MEMBER_NAME = re.compile(r"checkpoints/([A-Z0-9_]{1,128})\.(state|json)")


class ReleaseFiles(Protocol):
    """The release folder: plain file names and read-only byte streams. No write API."""

    def names(self) -> list[str]: ...

    def open(self, name: str) -> BinaryIO: ...


@dataclass(frozen=True)
class Check:
    name: str
    ok: bool
    detail: str


@dataclass
class Report:
    checks: list[Check]
    totals: list[str]

    @property
    def ok(self) -> bool:
        return all(check.ok for check in self.checks)


class ReleaseError(ValueError):
    pass


# --- streams ---


class _Tee(io.RawIOBase):
    """Hashes every byte as it is read, so a check and the integrity digest see the same bytes."""

    def __init__(self, raw: BinaryIO) -> None:
        self.raw = raw
        self.sha = hashlib.sha256()

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: memoryview) -> int:  # type: ignore[override]
        data = self.raw.read(len(buffer))
        self.sha.update(data)
        buffer[: len(data)] = data
        return len(data)

    def drain(self) -> str:
        while self.read(CHUNK):
            pass
        return self.sha.hexdigest()


def _decoder(name: str, raw: BinaryIO) -> BinaryIO:
    if name.endswith(".xz"):
        return cast(BinaryIO, lzma.LZMAFile(raw))
    if name.endswith(".gz"):
        return cast(BinaryIO, gzip.GzipFile(fileobj=raw))
    return raw


def _lines(stream: BinaryIO, cap: int, what: str) -> Iterator[tuple[int, bytes]]:
    number = 0
    while True:
        line = stream.readline(cap + 1)
        if not line:
            return
        number += 1
        if len(line) > cap:
            raise ReleaseError(f"{what} line {number} is longer than {cap} bytes")
        if not line.endswith(b"\n"):
            raise ReleaseError(f"{what} line {number} is truncated (no newline)")
        yield number, line


class Problems:
    def __init__(self) -> None:
        self.first: list[str] = []
        self.count = 0

    def add(self, message: str) -> None:
        self.count += 1
        if len(self.first) < MAX_PROBLEMS:
            self.first.append(message)

    def __bool__(self) -> bool:
        return self.count > 0

    def text(self) -> str:
        more = f" (+{self.count - len(self.first)} more)" if self.count > len(self.first) else ""
        return "; ".join(self.first) + more


def _check(name: str, problems: Problems, success: str) -> Check:
    return Check(name, not problems, problems.text() if problems else success)


# --- discovery and integrity ---


def discover(names: Sequence[str], listed: Sequence[str] = ()) -> dict[str, str | Check]:
    """One file per kind. Of several supported copies, the one SHA256SUMS lists wins."""
    found: dict[str, str | Check] = {}
    for kind, pattern in KINDS.items():
        matches = [name for name in names if pattern.fullmatch(name)]
        supported = [name for name in matches if not name.endswith(".zst")]
        vouched = [name for name in supported if name in listed]
        if len(supported) > 1 and len(vouched) == 1:
            found[kind] = vouched[0]
        elif len(supported) == 1:
            found[kind] = supported[0]
        elif supported:
            found[kind] = Check(kind, False, f"ambiguous {kind} files: {', '.join(supported)}")
        elif matches:
            found[kind] = Check(
                kind,
                False,
                f"only zstd copies of the {kind} file ({', '.join(matches)}); zstd is not "
                "supported, decompress it with `zstd -d --long=27` first",
            )
        else:
            found[kind] = Check(kind, False, f"missing {kind} file")
    return found


def parse_sums(data: bytes) -> tuple[dict[str, str], Problems]:
    problems = Problems()
    sums: dict[str, str] = {}
    for number, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
        match = SUM_LINE.fullmatch(line)
        if match is None or match.group(2) in (".", ".."):
            problems.add(f"SHA256SUMS line {number} is not `<sha256>  <plain file name>`")
            continue
        if match.group(2) in sums:
            problems.add(f"{match.group(2)}: listed twice in SHA256SUMS")
        sums[match.group(2)] = match.group(1)
    if not sums and not problems:
        problems.add("SHA256SUMS lists no files")
    return sums, problems


# --- event log ---


@dataclass(frozen=True)
class Milestone:
    seq: int
    name: str
    origin: object


@dataclass
class EventFacts:
    count: int = 0
    run: str | None = None
    run_start: dict[str, object] | None = None
    run_end: dict[str, object] | None = None
    last_type: str | None = None
    run_ends: int = 0
    turns: int = 0
    order: Problems = field(default_factory=Problems)
    turn_problems: Problems = field(default_factory=Problems)
    forbidden: dict[str, int] = field(default_factory=dict)
    last_ref: dict[str, object] | None = None
    last_ref_seq: int | None = None
    max_sequence: int = -1
    credits: set[int] = field(default_factory=set)
    milestones: list[Milestone] = field(default_factory=list)


def scan_events(stream: BinaryIO) -> EventFacts:
    facts = EventFacts()
    for number, line in _lines(stream, EVENT_LINE_CAP, "event log"):
        try:
            event = json.loads(line)
        except ValueError as error:
            raise ReleaseError(f"event log line {number} is not JSON: {error}") from None
        if not isinstance(event, dict):
            raise ReleaseError(f"event log line {number} is not an object")
        seq, kind, turn = event.get("seq"), event.get("type"), event.get("turn")
        if seq != facts.count or type(seq) is not int:
            facts.order.add(f"line {number} has seq {seq!r}, expected {facts.count}")
        if facts.run is None:
            facts.run = event.get("run") if isinstance(event.get("run"), str) else ""
        elif event.get("run") != facts.run:
            facts.order.add(f"line {number} has run id {event.get('run')!r}")
        facts.count += 1
        facts.last_type = kind if isinstance(kind, str) else None
        if number == 1 and kind == "run_start":
            facts.run_start = event
        if kind == "turn_start":
            if turn != facts.turns + 1:
                facts.turn_problems.add(
                    f"turn_start at seq {seq} is turn {turn!r}, expected {facts.turns + 1}"
                )
            facts.turns = turn if type(turn) is int else facts.turns + 1
        elif kind == "state" and type(seq) is int:
            ref = event.get("raw_ram")
            if isinstance(ref, dict) and type(ref.get("sequence")) is int:
                facts.last_ref, facts.last_ref_seq = ref, seq
                facts.max_sequence = max(facts.max_sequence, cast(int, ref["sequence"]))
            if event.get("screen") == "credits":
                facts.credits.add(seq)
        elif kind == "milestone" and type(seq) is int and isinstance(event.get("name"), str):
            facts.milestones.append(Milestone(seq, cast(str, event["name"]), event.get("origin")))
        elif kind == "run_end":
            facts.run_ends += 1
            facts.run_end = event
        if kind in FORBIDDEN_EVENTS:
            facts.forbidden[cast(str, kind)] = facts.forbidden.get(cast(str, kind), 0) + 1
    return facts


def scan_event_source(stream: BinaryIO, name: str) -> EventFacts:
    """An events*.jsonl (already decompressed by the caller), or a tar whose only member is one."""
    if ".tar" not in name:
        return scan_events(stream)
    facts: EventFacts | None = None
    with _open_tar(stream, name) as tar:
        for member in tar:
            if facts is not None:
                raise ReleaseError(f"event archive has a second member {member.name!r}")
            if member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE) or not EVENT_MEMBER.fullmatch(
                member.name
            ):
                raise ReleaseError(
                    f"event archive member {member.name!r} is not a plain events*.jsonl file"
                )
            body = tar.extractfile(member)
            assert body is not None
            facts = scan_events(cast(BinaryIO, body))
    if facts is None:
        raise ReleaseError("event archive is empty")
    return facts


def features_sha256(features: Mapping[str, bool]) -> str:
    """featuresSha256 (packages/agent/src/run-evaluation.ts): JSON.stringify of sorted entries.

    JavaScript sorts by UTF-16 code unit, so the key order here does too.
    """
    entries = sorted(features.items(), key=lambda item: item[0].encode("utf-16-be"))
    body = json.dumps([[k, v] for k, v in entries], separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(body.encode()).hexdigest()


def event_checks(facts: EventFacts, rom_sha1: str) -> list[Check]:
    start = Problems()
    first = facts.run_start
    if first is None:
        start.add("the first event is not run_start")
    else:
        state = first.get("start_state")
        if not isinstance(state, dict) or state.get("kind") != "boot":
            start.add(f"start_state is {state!r}, not boot")
        if first.get("rom_sha1") != rom_sha1:
            start.add(f"rom_sha1 is {first.get('rom_sha1')!r}, not {rom_sha1}")
    checks = [_check("events: run_start", start, f"boot start, ROM {rom_sha1[:12]}…")]
    checks.append(
        _check(
            "events: order",
            facts.order,
            f"{facts.count:,} events, seq 0-{facts.count - 1:,}, one run id",
        )
    )

    turns = Problems()
    for problem in facts.turn_problems.first:
        turns.add(problem)
    end = facts.run_end or {}
    if end.get("turns") != facts.turns:
        turns.add(f"run_end.turns is {end.get('turns')!r}, turn_start reached {facts.turns}")
    elif end.get("turn") != facts.turns:
        turns.add(f"run_end.turn is {end.get('turn')!r}, not {facts.turns}")
    checks.append(_check("events: turns", turns, f"turns 1-{facts.turns:,} contiguous"))

    operator = Problems()
    for kind, count in sorted(facts.forbidden.items()):
        operator.add(f"{count} {kind} event(s)")
    checks.append(
        _check(
            "events: no restores or operator steps",
            operator,
            "boot start; no human_input, human_sample or operator_control events",
        )
    )

    ending = Problems()
    if facts.last_type != "run_end" or facts.run_ends != 1:
        ending.add("run_end is not the last event (or appears more than once)")
    if end.get("reason") != "completed":
        ending.add(f"reason is {end.get('reason')!r}, not completed")
    proof = end.get("target_proof")
    if not isinstance(proof, dict) or proof.get("name") != TARGET:
        ending.add(f"target_proof is not {TARGET}")
    else:
        by_seq = {m.seq: m for m in facts.milestones}
        claimed = by_seq.get(cast(int, proof.get("milestone_seq")))
        if claimed is None or claimed.name != TARGET or claimed.origin != "observed":
            ending.add(
                f"target_proof.milestone_seq {proof.get('milestone_seq')!r} "
                f"is not an observed {TARGET} milestone"
            )
        evidence = proof.get("state_evidence")
        if (
            not isinstance(evidence, list)
            or not evidence
            or any(e not in facts.credits or claimed is None or e <= claimed.seq for e in evidence)
        ):
            ending.add("target_proof.state_evidence is not credits states after the milestone")
    checks.append(_check("events: run_end", ending, f"completed, target_proof {TARGET}"))

    digest = Problems()
    evaluation = first.get("evaluation") if first is not None else None
    features = evaluation.get("features") if isinstance(evaluation, dict) else None
    recorded = evaluation.get("features_sha256") if isinstance(evaluation, dict) else None
    if (
        not isinstance(features, dict)
        or not isinstance(recorded, str)
        or not all(isinstance(k, str) and type(v) is bool for k, v in features.items())
    ):
        digest.add("run_start.evaluation features or features_sha256 missing")
    elif features_sha256(features) != recorded:
        digest.add(f"recomputed digest does not match features_sha256 {recorded[:12]}…")
    count = len(features) if isinstance(features, dict) else 0
    checks.append(
        _check(
            "events: features digest",
            digest,
            f"{count} switches hash to the recorded features_sha256",
        )
    )
    return checks


# --- the final RAM snapshot ---


@dataclass
class FinalSnapshot:
    reader: ArchivedMemoryReader
    file_sha256: str


def read_final_snapshot(stream: BinaryIO, raw: "_Tee") -> FinalSnapshot:
    """One snapshot record, decompressed under the raw-RAM archive bound."""
    body = stream.read(MAX_ARCHIVE_BYTES + 1)
    if len(body) > MAX_ARCHIVE_BYTES:
        raise ReleaseError(f"final snapshot expands beyond {MAX_ARCHIVE_BYTES} bytes")
    reader = parse_raw_ram_record(json.loads(body))
    return FinalSnapshot(reader, raw.drain())


def _save_flags(read: ArchivedMemoryReader) -> bytes | None:
    save1 = int.from_bytes(read(SAVE1_POINTER, 4), "little")
    if save1 % 4 or not EWRAM <= save1 or save1 + SAVE_FLAGS + FLAG_BYTES > EWRAM_END:
        return None
    return read(save1 + SAVE_FLAGS, FLAG_BYTES)


def ram_checks(
    final: FinalSnapshot | None,
    name: str,
    facts: EventFacts | None,
    rom: bytes | None,
    rom_sha1: str,
    read_party: Callable[[ArchivedMemoryReader], tuple[PartyMon, ...]],
    unreadable: str,
) -> list[Check]:
    names = ("final snapshot", "native: game clear flag", "native: badges", "native: party")
    if final is None or facts is None:
        return [Check(check, False, unreadable) for check in names]
    meta = final.reader.metadata
    binding = Problems()
    ref = facts.last_ref
    if ref is None:
        binding.add("no state event references a raw-RAM snapshot")
    else:
        if ref.get("sequence") != facts.max_sequence:
            binding.add(
                f"an earlier state references snapshot {facts.max_sequence}, after the last one"
            )
        for key in ("sequence", "frame"):
            if meta.get(key) != ref.get(key):
                binding.add(f"{key} {meta.get(key)!r}; the last state event says {ref.get(key)!r}")
        if name.endswith(".gz") and final.file_sha256 != ref.get("sha256"):
            binding.add("file sha256 differs from the last state event's raw_ram.sha256")
    if meta.get("rom_sha1") != rom_sha1:
        binding.add(f"rom_sha1 {meta.get('rom_sha1')!r} is not {rom_sha1}")
    exact = (
        "byte-identical to the run's archive"
        if name.endswith(".gz")
        else "recompressed, so only sequence and frame bind it (the run's digest covers gzip bytes)"
    )
    checks = [
        _check(
            "final snapshot",
            binding,
            f"sequence {meta.get('sequence')}, frame {meta.get('frame')}: the last snapshot the "
            f"events reference; every region digest matches; {exact}",
        )
    ]
    flags = _save_flags(final.reader)
    if flags is None:
        reason = "the final snapshot has no valid save block pointer"
        checks += [
            Check("native: game clear flag", False, reason),
            Check("native: badges", False, reason),
        ]
    else:

        def flag(n: int) -> bool:
            return bool(flags[n >> 3] >> (n & 7) & 1)

        clear = flag(FLAG_SYS_GAME_CLEAR)
        checks.append(
            Check(
                "native: game clear flag",
                clear,
                f"FLAG_SYS_GAME_CLEAR {'set' if clear else 'NOT set'} in the final snapshot",
            )
        )
        missing = [badge for i, badge in enumerate(BADGES) if not flag(FLAG_BADGE01 + i)]
        checks.append(
            Check(
                "native: badges",
                not missing,
                "all 8 badge flags set"
                if not missing
                else f"badge flags not set: {', '.join(missing)}",
            )
        )
    checks.append(_party_check(final.reader, rom, read_party))
    return checks


def _party_check(
    final: ArchivedMemoryReader,
    rom: bytes | None,
    read_party: Callable[[ArchivedMemoryReader], tuple[PartyMon, ...]],
) -> Check:
    if rom is None:
        return Check("native: party", False, "needs the matching ROM to decode the party")
    reader = ArchivedMemoryReader(final.regions, final.gprs, final.cpsr, final.metadata, rom)
    try:
        mons = read_party(reader)
    except (ValueError, KeyError, IndexError) as error:
        return Check("native: party", False, f"party unreadable: {error}")
    shown = ", ".join(
        f"{mon.species} Lv {mon.level}"
        if mon.diagnostic is None
        else f"unreadable ({mon.diagnostic})"
        for mon in mons
    )
    found = any(m.species_id == SPECIES_RAYQUAZA and m.diagnostic is None for m in mons)
    return Check(
        "native: party", found, f"{'' if found else 'no RAYQUAZA: '}{shown or 'empty party'}"
    )


def read_final_party(read: ArchivedMemoryReader) -> tuple[PartyMon, ...]:
    count = read(PARTY_COUNT, 1)[0]
    if count > 6:
        raise ValueError(f"party count {count} is not a party")
    body = read(PARTY, 100 * count)
    cpu = read.pokemon_cpu_context()
    return tuple(
        decode_party_mon(
            body[100 * slot : 100 * (slot + 1)], read, address=PARTY + 100 * slot, cpu=cpu
        )
        for slot in range(count)
    )


# --- checkpoints ---


@dataclass
class CheckpointFacts:
    unsafe: Problems = field(default_factory=Problems)
    states: dict[str, tuple[str, int]] = field(default_factory=dict)
    sidecars: dict[str, object] = field(default_factory=dict)


EXTENSION_TYPES = (
    tarfile.XHDTYPE,
    tarfile.XGLTYPE,
    tarfile.SOLARIS_XHDTYPE,
    tarfile.GNUTYPE_LONGNAME,
    tarfile.GNUTYPE_LONGLINK,
)


class _BoundedTarInfo(tarfile.TarInfo):
    """tarfile reads PAX and GNU long-name payloads before yielding a member, so bound them here."""

    def _proc_member(self, tar: tarfile.TarFile) -> tarfile.TarInfo:
        if self.type in EXTENSION_TYPES and self.size > EXTENSION_CAP:
            raise ReleaseError(
                f"archive has a {self.size}-byte extension header (limit {EXTENSION_CAP})"
            )
        if self.type == tarfile.GNUTYPE_SPARSE:
            raise ReleaseError("archive has a sparse member")
        member: tarfile.TarInfo = super()._proc_member(tar)  # type: ignore[misc]
        return member

    # _proc_pax dispatches PAX sparse maps (GNU 0.0, 0.1, 1.0) through these before a member is
    # yielded; 1.0 reads a caller-sized map from the archive. Refuse them all before any of that.
    def _proc_gnusparse_00(self, *_args: object) -> None:
        raise ReleaseError("archive has a PAX sparse member")

    def _proc_gnusparse_01(self, *_args: object) -> None:
        raise ReleaseError("archive has a PAX sparse member")

    def _proc_gnusparse_10(self, *_args: object) -> None:
        raise ReleaseError("archive has a PAX sparse member")


def _open_tar(stream: BinaryIO, name: str) -> tarfile.TarFile:
    if name.endswith(".xz"):
        return tarfile.open(fileobj=stream, mode="r|xz", tarinfo=_BoundedTarInfo)
    if name.endswith(".gz"):
        return tarfile.open(fileobj=stream, mode="r|gz", tarinfo=_BoundedTarInfo)
    return tarfile.open(fileobj=stream, mode="r|", tarinfo=_BoundedTarInfo)


def scan_checkpoints(stream: BinaryIO, name: str) -> CheckpointFacts:
    """Stream the tar without extracting: hash states, parse sidecars, reject anything else."""
    found = CheckpointFacts()
    seen: set[str] = set()
    members = 0
    with _open_tar(stream, name) as tar:
        for member in tar:
            members += 1
            if members > MAX_MEMBERS:
                raise ReleaseError(f"checkpoint archive has more than {MAX_MEMBERS} members")
            if member.issym() or member.islnk():
                found.unsafe.add(f"{member.name!r} is a link")
                continue
            if member.isdir() and member.name.rstrip("/") == "checkpoints":
                continue
            match = MEMBER_NAME.fullmatch(member.name)
            if match is None:
                found.unsafe.add(f"{member.name!r} has an unsafe name")
                continue
            if not member.isreg():
                found.unsafe.add(f"{member.name!r} is not a regular file")
                continue
            if member.name in seen:
                found.unsafe.add(f"{member.name!r} appears twice")
                continue
            seen.add(member.name)
            base, suffix = match.group(1), match.group(2)
            cap = STATE_CAP if suffix == "state" else SIDECAR_CAP
            if member.size > cap:
                found.unsafe.add(f"{member.name!r} is larger than {cap} bytes")
                continue
            body = tar.extractfile(member)
            assert body is not None
            if suffix == "state":
                sha, size = hashlib.sha256(), 0
                while chunk := body.read(CHUNK):
                    sha.update(chunk)
                    size += len(chunk)
                found.states[base] = (sha.hexdigest(), size)
            else:
                try:
                    found.sidecars[base] = json.loads(body.read(cap + 1))
                except ValueError:
                    found.unsafe.add(f"{member.name!r} is not JSON")
    return found


def checkpoint_checks(
    found: CheckpointFacts | None, facts: EventFacts | None, rom_sha1: str, unreadable: str
) -> list[Check]:
    names = ("checkpoints: archive", "checkpoints: digests", "checkpoints: provenance")
    if found is None:
        return [Check(name, False, unreadable) for name in names]
    archive = Problems()
    for problem in found.unsafe.first:
        archive.add(problem)
    archive.count = max(archive.count, found.unsafe.count)
    pairs: list[tuple[str, dict[str, object], tuple[str, int]]] = []
    for base in sorted(set(found.states) | set(found.sidecars)):
        side, state = found.sidecars.get(base), found.states.get(base)
        if state is None or base not in found.sidecars:
            archive.add(f"{base}: .state and .json do not both exist")
        elif not isinstance(side, dict):
            archive.add(f"{base}.json is not a JSON object")
        else:
            pairs.append((base, side, state))
    if FINAL_SAVE not in found.states:
        archive.add(f"{FINAL_SAVE}.state is missing")
    milestones = sum(base not in (FINAL_SAVE, RUN_END_SAVE) for base, _, _ in pairs)
    extra = " + run-end save" if RUN_END_SAVE in found.states else ""
    checks = [
        _check(
            "checkpoints: archive",
            archive,
            f"{len(pairs)} state/JSON pairs ({milestones} milestones + final save{extra}); "
            "no links or unsafe names",
        )
    ]

    digests = Problems()
    for base, side, (sha, size) in pairs:
        recorded = side.get("state")
        if (
            not isinstance(recorded, dict)
            or recorded.get("sha256") != sha
            or recorded.get("bytes") != size
        ):
            digests.add(f"{base}: state sha256 or size differs from its JSON")
    checks.append(
        _check(
            "checkpoints: digests",
            digests,
            f"{len(pairs)} states match their recorded sha256 and size",
        )
    )

    provenance = Problems()
    if facts is None:
        provenance.add(unreadable)
    else:
        claimed = {(m.name, m.seq) for m in facts.milestones}
        proof = (facts.run_end or {}).get("target_proof")
        for base, side, _ in pairs:
            if side.get("run") != facts.run:
                provenance.add(f"{base}: run {side.get('run')!r} is not this run")
            if base == FINAL_SAVE:
                if side.get("save") != FINAL_SAVE or side.get("proof") != proof:
                    provenance.add(f"{base}: proof differs from run_end.target_proof")
                continue
            source = side.get("source")
            start = source.get("start_state") if isinstance(source, dict) else None
            event = side.get("milestone_event")
            if base == RUN_END_SAVE:
                end = facts.run_end or {}
                if (
                    side.get("kind") != "run_end"
                    or side.get("end_reason") != end.get("reason")
                    or side.get("turn") != end.get("turns")
                ):
                    provenance.add(f"{base}: kind, end_reason or turn differs from run_end")
            elif side.get("milestone") != base:
                provenance.add(f"{base}: names milestone {side.get('milestone')!r}")
            if not isinstance(start, dict) or start.get("kind") != "boot":
                provenance.add(f"{base}: source.start_state is not boot")
            if not isinstance(source, dict) or source.get("rom_sha1") != rom_sha1:
                provenance.add(f"{base}: source.rom_sha1 is not the ROM")
            if base != RUN_END_SAVE and (
                not isinstance(event, dict) or (base, event.get("seq")) not in claimed
            ):
                provenance.add(
                    f"{base}: milestone event is not a {base} milestone in the event log"
                )
    checks.append(
        _check(
            "checkpoints: provenance",
            provenance,
            "every milestone state from boot on this ROM and run; "
            f"{FINAL_SAVE} bound to run_end.target_proof; {RUN_END_SAVE} bound to run_end",
        )
    )
    return checks


# --- the whole check ---


def _failure(error: Exception) -> str:
    return f"{type(error).__name__}: {error}" if not isinstance(error, ReleaseError) else str(error)


def verify(
    files: ReleaseFiles,
    rom: bytes | None,
    *,
    rom_sha1: str = EMERALD_SHA1,
    read_party: Callable[[ArchivedMemoryReader], tuple[PartyMon, ...]] = read_final_party,
    rom_problem: str | None,
) -> Report:
    names = files.names()
    sums, sum_problems = _read_sums(files, names)
    found = discover(names, list(sums))
    digests: dict[str, str] = {}
    read_problems: dict[str, str] = {}

    def stream(kind: str, scan: Callable[[BinaryIO, str, _Tee], T]) -> tuple[T | None, str]:
        target = found[kind]
        if isinstance(target, Check):
            return None, target.detail
        try:
            raw = files.open(target)
        except OSError as error:
            read_problems[target] = f"cannot open: {error}"
            return None, f"{target}: cannot open: {error}"
        with raw:
            tee = _Tee(raw)
            result: T | None = None
            problem = ""
            try:
                buffered = cast(BinaryIO, io.BufferedReader(tee, CHUNK))
                # tarfile decompresses archives itself ("r|xz"/"r|gz").
                source = buffered if ".tar" in target else _decoder(target, buffered)
                result = scan(source, target, tee)
            except Exception as error:  # noqa: BLE001 - fail closed: any failure is a named FAIL
                problem = f"{target}: {_failure(error)}"
            try:
                digests[target] = tee.drain()
            except OSError as error:
                read_problems[target] = f"cannot be read to the end: {error}"
            return result, problem

    facts, event_problem = stream("events", lambda s, n, _t: scan_event_source(s, n))
    final, final_problem = stream("final snapshot", lambda s, _n, t: read_final_snapshot(s, t))
    cps, cp_problem = stream("checkpoints", lambda s, n, _t: scan_checkpoints(s, n))
    final_name = found["final snapshot"]

    checks = [
        _integrity(names, found, sums, sum_problems, digests, read_problems),
        _rom_check(rom, rom_problem, rom_sha1),
    ]
    if facts is None:
        checks += [Check(name, False, event_problem) for name in EVENT_CHECKS]
    else:
        checks += event_checks(facts, rom_sha1)
    usable_rom = (
        rom
        if rom is not None and hashlib.sha1(rom, usedforsecurity=False).hexdigest() == rom_sha1
        else None
    )
    checks += ram_checks(
        final,
        final_name if isinstance(final_name, str) else "",
        facts,
        usable_rom,
        rom_sha1,
        read_party,
        final_problem or f"not checked: the event log is unreadable ({event_problem})",
    )
    checks += checkpoint_checks(
        cps, facts, rom_sha1, cp_problem or (event_problem and f"not checked: {event_problem}")
    )
    return Report(checks, _totals(facts, final, cps, names))


EVENT_CHECKS = (
    "events: run_start",
    "events: order",
    "events: turns",
    "events: no restores or operator steps",
    "events: run_end",
    "events: features digest",
)


def _read_sums(files: ReleaseFiles, names: Sequence[str]) -> tuple[dict[str, str], Problems]:
    problems = Problems()
    if "SHA256SUMS" not in names:
        problems.add("missing SHA256SUMS")
        return {}, problems
    with files.open("SHA256SUMS") as raw:
        body = raw.read(SUMS_CAP + 1)
    if len(body) > SUMS_CAP:
        problems.add(f"SHA256SUMS is larger than {SUMS_CAP} bytes")
        return {}, problems
    return parse_sums(body)


def _integrity(
    names: Sequence[str],
    found: Mapping[str, str | Check],
    sums: Mapping[str, str],
    sum_problems: Problems,
    digests: dict[str, str],
    read_problems: Mapping[str, str],
) -> Check:
    problems = sum_problems
    if not sums and problems:
        return _check("integrity", problems, "")
    for target in found.values():
        if isinstance(target, str) and target not in sums:
            problems.add(f"{target}: not listed in SHA256SUMS")
    others = 0
    for name, expected in sums.items():
        if name not in names:
            problems.add(f"{name}: missing")
        elif name in read_problems:
            problems.add(f"{name}: {read_problems[name]}")
        elif name not in digests:
            others += 1  # not read here (raw-RAM log, screenshots, ...): sha256sum -c covers them
        elif digests[name] != expected:
            problems.add(f"{name}: sha256 mismatch")
    read = len(sums) - others
    note = f"; {others} other listed files present, not hashed here" if others else ""
    return _check("integrity", problems, f"{read} files read match SHA256SUMS{note}")


def _rom_check(rom: bytes | None, problem: str | None, rom_sha1: str) -> Check:
    if rom is None:
        return Check("rom", False, problem or "no ROM given")
    actual = hashlib.sha1(rom, usedforsecurity=False).hexdigest()
    if actual != rom_sha1:
        return Check(
            "rom", False, f"POKEBENCH_ROM sha1 {actual} is not Pokémon Emerald (U) {rom_sha1}"
        )
    return Check("rom", True, f"POKEBENCH_ROM sha1 {rom_sha1}")


def _totals(
    facts: EventFacts | None,
    final: FinalSnapshot | None,
    cps: CheckpointFacts | None,
    names: Sequence[str],
) -> list[str]:
    lines: list[str] = []
    if facts is not None:
        start, end = facts.run_start or {}, facts.run_end or {}
        model, sampling, harness = start.get("model"), start.get("sampling"), start.get("harness")
        wall = end.get("wall_ms")
        lines.append(f"run: {facts.run}")
        if type(wall) is int:
            seconds = wall // 1000
            lines.append(
                f"turns: {facts.turns:,}; wall time "
                f"{seconds // 3600}h{seconds // 60 % 60:02d}m{seconds % 60:02d}s"
            )
        if isinstance(model, dict):
            level = sampling.get("thinking_level") if isinstance(sampling, dict) else None
            lines.append(f"model: {model.get('id')}" + (f" (thinking {level})" if level else ""))
        if isinstance(harness, dict):
            lines.append(
                f"harness: {harness.get('commit')} "
                f"({'dirty' if harness.get('dirty') else 'clean'} tree)"
            )
        tokens = end.get("tokens")
        if isinstance(tokens, dict) and not any(tokens.values()):
            lines.append("tokens: not recorded (logged as 0)")
        elif isinstance(tokens, dict):
            lines.append(f"tokens: input {tokens.get('input')}, output {tokens.get('output')}")
        traces = [name for name in names if name.startswith("agent-trace")]
        lines.append(
            f"list cost: not computed here (the agent trace ships as {', '.join(traces)})"
            if traces
            else "list cost: not in this release (the agent trace is not shipped)"
        )
        lines.append(f"evidence: {facts.count:,} events, {len(facts.milestones)} milestones")
    if final is not None:
        meta = final.reader.metadata
        lines.append(
            f"final RAM snapshot: sequence {meta.get('sequence')}, frame {meta.get('frame')} "
            "(the full raw-RAM log is not read here)"
        )
    if cps is not None:
        lines.append(f"checkpoints: {len(cps.states)} states")
    lines.append(
        "next: `just replay-verify` replays the logged inputs from power-on and compares every "
        "snapshot byte for byte (separate tool, separate worklog)"
    )
    return lines


def render(report: Report) -> str:
    lines = [f"{'PASS' if c.ok else 'FAIL'} {c.name}: {c.detail}" for c in report.checks]
    lines += ["", "totals:"] + [f"  {line}" for line in report.totals] + [""]
    failures = sum(not c.ok for c in report.checks)
    total = len(report.checks)
    lines.append(
        f"verify-release: {total} checks, all PASS"
        if not failures
        else f"verify-release: {failures} of {total} checks FAILED"
    )
    return "\n".join(lines)


# The thin disk entrypoint; verify() is tested on in-memory releases.
class FolderRelease:  # pragma: no cover
    def __init__(self, folder: Path) -> None:
        if folder.is_symlink() or not folder.is_dir():
            raise NotADirectoryError(f"{folder} is not a folder (symlinks are refused)")
        self.folder = folder

    def names(self) -> list[str]:
        with os.scandir(self.folder) as entries:
            return sorted(e.name for e in entries if e.is_file(follow_symlinks=False))

    def open(self, name: str) -> BinaryIO:
        if "/" in name or name in (".", ".."):
            raise FileNotFoundError(name)
        return os.fdopen(os.open(self.folder / name, os.O_RDONLY | os.O_NOFOLLOW), "rb")


def _read_rom(path: Path) -> bytes:  # pragma: no cover - thin disk entrypoint
    with path.open("rb") as file:
        data = file.read(ROM_CAP + 1)
    if len(data) > ROM_CAP:
        raise OSError(f"{path} is larger than {ROM_CAP} bytes")
    return data


def main(
    argv: Sequence[str],
    environ: Mapping[str, str],
    *,
    open_release: Callable[[Path], ReleaseFiles] = FolderRelease,
    read_rom: Callable[[Path], bytes] = _read_rom,
    out: TextIO = sys.stdout,
    rom_sha1: str = EMERALD_SHA1,
    read_party: Callable[[ArchivedMemoryReader], tuple[PartyMon, ...]] = read_final_party,
) -> int:
    if len(argv) != 1:
        print("usage: just verify-release <release folder>", file=out)
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
        release = open_release(Path(argv[0]))
    except OSError as error:
        print(f"FAIL release folder: {error}", file=out)
        return 1
    report = verify(release, rom, rom_sha1=rom_sha1, read_party=read_party, rom_problem=problem)
    print(render(report), file=out)
    return 0 if report.ok else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:], os.environ))
