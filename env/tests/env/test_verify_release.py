"""just verify-release: every check runs on an in-memory release built from two real 67d7 snapshots."""

import base64
import gzip
import hashlib
import io
import json
import lzma
import tarfile
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO

import pytest

from pokebench_env import verify_release as vr
from pokebench_env.pokemon import PartyMon
from pokebench_env.raw_ram import parse_raw_ram_record

FIXTURES = Path(__file__).parent / "fixtures"
# Read at import (collection), never inside a test: the no-I/O guard arms after collection.
FINAL_GZ = (FIXTURES / "verify-release-67d7-final.json.gz").read_bytes()
START_GZ = (FIXTURES / "verify-release-67d7-start.json.gz").read_bytes()
EVALUATION = json.loads((FIXTURES / "verify-release-67d7-evaluation.json").read_text())

ROM = b"pokebench verify-release test cartridge"
ROM_SHA1 = hashlib.sha1(ROM).hexdigest()
RUN = "2026-11-10T15-37-43_opus-rayquaza-boot_67d7"
T = "2026-11-10T15:38:09.109-05:00"
STATE = b"mgba-state-bytes"
FINAL_STATE = b"mgba-final-state"
RAYQUAZA = PartyMon("RAYQUAZA", 74, 200, 200, species_id=406)
SWAMPERT = PartyMon("SWAMPERT", 55, 180, 180, species_id=285)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def snapshot(gz: bytes, sequence: int) -> dict[str, object]:
    value: dict[str, object] = json.loads(gzip.decompress(gz))
    value["sequence"] = sequence
    value["rom_sha1"] = ROM_SHA1
    return value


def region(record: dict[str, object], name: str) -> dict[str, object]:
    regions = record["regions"]
    assert isinstance(regions, list)
    found = next(r for r in regions if r["name"] == name)
    assert isinstance(found, dict)
    return found


def poke(record: dict[str, object], address: int, data: bytes) -> None:
    for entry in record["regions"]:  # type: ignore[attr-defined]
        start, size = entry["address"], entry["size"]
        if start <= address < start + size:
            raw = bytearray(base64.b64decode(entry["data_base64"]))
            raw[address - start : address - start + len(data)] = data
            entry["data_base64"] = base64.b64encode(bytes(raw)).decode()
            entry["sha256"] = sha256(bytes(raw))
            return
    raise AssertionError(hex(address))


def save1(record: dict[str, object]) -> int:
    iwram = base64.b64decode(str(region(record, "iwram")["data_base64"]))
    return int.from_bytes(iwram[0x5D8C:0x5D90], "little")


def set_flag(record: dict[str, object], flag: int, on: bool) -> None:
    address = save1(record) + 0x1270 + (flag >> 3)
    ewram = base64.b64decode(str(region(record, "ewram")["data_base64"]))
    byte = ewram[address - 0x02000000]
    byte = byte | (1 << (flag & 7)) if on else byte & ~(1 << (flag & 7))
    poke(record, address, bytes([byte]))


def features_sha256(features: dict[str, bool]) -> str:
    entries = sorted(features.items(), key=lambda item: item[0].encode("utf-16-be"))
    return sha256(json.dumps([list(e) for e in entries], separators=(",", ":")).encode())


class Build:
    """A valid two-snapshot release; tests tamper with one part before packing it."""

    def __init__(self) -> None:
        self.start = snapshot(START_GZ, 0)
        self.final = snapshot(FINAL_GZ, 1)
        self.start_frame = int(self.start["frame"])  # type: ignore[call-overload]
        self.final_frame = int(self.final["frame"])  # type: ignore[call-overload]
        features = {"game-clear-completion-v1": True, "rq-slim-prompt-v1": False}
        self.events: list[dict[str, object]] = []
        self.add(
            "run_start",
            0,
            rom_sha1=ROM_SHA1,
            start_state={"kind": "boot"},
            model={"id": "claude-opus-5-5", "context_window": 262144},
            sampling={"thinking_level": "medium"},
            harness={"commit": "aaecbda1732db0f598dfd5489055ce671f063c98", "dirty": False},
            evaluation={"features": features, "features_sha256": features_sha256(features)},
        )
        self.state(0, 0, "title")  # seq 1
        self.add("milestone", 0, name="GAME_RUNNING", kind="legacy", origin="observed", evidence=[1])
        self.add("turn_start", 1)  # seq 3
        self.state(1, 1, "field")  # seq 4
        for name in ("RAIN_BADGE", "GAME_CLEAR_CONFIRMED"):
            self.add("milestone", 1, name=name, kind="story", origin="observed", evidence=[4])
        self.add("turn_start", 2)  # seq 7
        self.state(2, 1, "credits")  # seq 8
        self.add(
            "run_end",
            2,
            reason="completed",
            target_proof={"name": "GAME_CLEAR_CONFIRMED", "milestone_seq": 6, "state_evidence": [8]},
            turns=2,
            wall_ms=62190151,
            tokens={"input": 0, "output": 0},
        )
        self.sidecars: dict[str, object] = {
            "GAME_CLEAR_CONFIRMED.json": {
                "version": 1,
                "run": RUN,
                "milestone": "GAME_CLEAR_CONFIRMED",
                "milestone_event": {"seq": 6},
                "state": {"sha256": sha256(STATE), "bytes": len(STATE)},
                "source": {"rom_sha1": ROM_SHA1, "start_state": {"kind": "boot"}},
            },
            "GAME_CLEAR_FINAL.json": {
                "version": 1,
                "run": RUN,
                "save": "GAME_CLEAR_FINAL",
                "proof": {
                    "name": "GAME_CLEAR_CONFIRMED",
                    "milestone_seq": 6,
                    "state_evidence": [8],
                },
                "state": {"sha256": sha256(FINAL_STATE), "bytes": len(FINAL_STATE)},
            },
        }
        self.states = {"GAME_CLEAR_CONFIRMED.state": STATE, "GAME_CLEAR_FINAL.state": FINAL_STATE}
        self.extra_members: list[tuple[tarfile.TarInfo, bytes | None]] = []
        self.ext = ""
        self.names = {"events": "events-67d7.jsonl", "raw": "raw-ram-67d7.jsonl"}
        self.tar_name = "checkpoints-67d7.tar"

    def add(self, kind: str, turn: int, **body: object) -> None:
        self.events.append(
            {"v": 1, "run": RUN, "seq": len(self.events), "t": T, "type": kind, "turn": turn, **body}
        )

    def state(self, turn: int, sequence: int, screen: str) -> None:
        frame = self.start_frame if sequence == 0 else self.final_frame
        ref = {"v": 1, "sequence": sequence, "frame": frame, "sha256": "0" * 64}
        self.add("state", turn, started=True, screen=screen, raw_ram=ref)

    def event_bytes(self) -> bytes:
        return b"".join(json.dumps(e).encode() + b"\n" for e in self.events)

    def ram_bytes(self) -> bytes:
        return b"".join(json.dumps(s).encode() + b"\n" for s in (self.start, self.final))

    def tar_bytes(self) -> bytes:
        out = io.BytesIO()
        with tarfile.open(fileobj=out, mode="w") as tar:
            folder = tarfile.TarInfo("checkpoints")
            folder.type = tarfile.DIRTYPE
            tar.addfile(folder)
            parts = {k: json.dumps(v).encode() for k, v in self.sidecars.items()} | self.states
            for name, data in parts.items():
                info = tarfile.TarInfo(f"checkpoints/{name}")
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
            for info, data in self.extra_members:
                tar.addfile(info, None if data is None else io.BytesIO(data))
        return out.getvalue()

    def files(self) -> dict[str, bytes]:
        def pack(data: bytes) -> bytes:
            if self.ext == ".gz":
                return gzip.compress(data, mtime=0)
            if self.ext == ".xz":
                return lzma.compress(data)
            return data

        files = {
            self.names["events"] + self.ext: pack(self.event_bytes()),
            self.names["raw"] + self.ext: pack(self.ram_bytes()),
            self.tar_name + self.ext: pack(self.tar_bytes()),
        }
        sums = "".join(f"{sha256(data)}  {name}\n" for name, data in files.items())
        return files | {"SHA256SUMS": sums.encode()}


class MemoryRelease:
    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = files
        self.opened: list[str] = []

    def names(self) -> list[str]:
        return sorted(self.files)

    def open(self, name: str) -> BinaryIO:
        self.opened.append(name)
        if name not in self.files:
            raise FileNotFoundError(name)
        return io.BytesIO(self.files[name])


def party(*mons: PartyMon) -> Callable[[vr.ArchivedMemoryReader], tuple[PartyMon, ...]]:
    return lambda _read: mons


def run(
    files: dict[str, bytes],
    *,
    rom: bytes | None = ROM,
    mons: tuple[PartyMon, ...] = (RAYQUAZA, SWAMPERT),
) -> vr.Report:
    return vr.verify(
        MemoryRelease(files), rom, rom_sha1=ROM_SHA1, read_party=party(*mons), rom_problem=None
    )


def result(report: vr.Report, name: str) -> vr.Check:
    return next(check for check in report.checks if check.name == name)


def failed(report: vr.Report) -> dict[str, str]:
    return {check.name: check.detail for check in report.checks if not check.ok}


ALL_CHECKS = {
    "integrity",
    "rom",
    "events: run_start",
    "events: order",
    "events: turns",
    "events: no restores or operator steps",
    "events: run_end",
    "events: features digest",
    "raw RAM: snapshots",
    "raw RAM: event references",
    "native: game clear flag",
    "native: badges",
    "native: party",
    "native: milestones",
    "checkpoints: archive",
    "checkpoints: digests",
    "checkpoints: provenance",
}


# --- the clean release, in each supported compression ---


@pytest.mark.parametrize("ext", ["", ".gz", ".xz"])
def test_clean_release_passes_every_check(ext: str) -> None:
    build = Build()
    build.ext = ext
    report = run(build.files())
    assert {check.name for check in report.checks} == ALL_CHECKS
    assert failed(report) == {}
    assert report.ok
    text = vr.render(report)
    assert text.splitlines()[0].startswith("PASS integrity: 3 files match SHA256SUMS")
    assert "verify-release: 17 checks, all PASS" in text
    assert "RAYQUAZA Lv 74" in result(report, "native: party").detail
    assert "2 of 3 claimed milestones have a native reader" in result(
        report, "native: milestones"
    ).detail
    assert any("claude-opus-5-5" in line for line in report.totals)
    assert any("tokens: not recorded" in line for line in report.totals)
    assert any("just replay-verify" in line for line in report.totals)


# --- INV-2: the headline comes from RAM, not from milestone events ---


def test_events_claiming_game_clear_without_the_ram_flag_fail() -> None:
    build = Build()
    set_flag(build.final, vr.FLAG_SYS_GAME_CLEAR, False)
    report = run(build.files())
    bad = failed(report)
    assert set(bad) == {"native: game clear flag", "native: milestones"}
    assert "GAME_CLEAR_CONFIRMED" in bad["native: milestones"]
    assert result(report, "events: run_end").ok


def test_a_missing_badge_flag_fails() -> None:
    build = Build()
    set_flag(build.final, 0x86E, False)
    bad = failed(run(build.files()))
    assert "RAIN" in bad["native: badges"]
    assert "RAIN_BADGE" in bad["native: milestones"]


def test_a_party_without_rayquaza_fails() -> None:
    bad = failed(run(Build().files(), mons=(SWAMPERT,)))
    assert set(bad) == {"native: party"}
    assert "SWAMPERT" in bad["native: party"]


def test_a_mangled_rayquaza_does_not_count() -> None:
    mangled = PartyMon(None, None, None, None, species_id=406, diagnostic="harness bug: x")
    assert "native: party" in failed(run(Build().files(), mons=(mangled,)))


def test_an_unreadable_party_fails_closed() -> None:
    def broken(_read: vr.ArchivedMemoryReader) -> tuple[PartyMon, ...]:
        raise ValueError("read outside archived memory")

    report = vr.verify(
        MemoryRelease(Build().files()), ROM, rom_sha1=ROM_SHA1, read_party=broken, rom_problem=None
    )
    assert "read outside archived memory" in failed(report)["native: party"]


def test_milestone_seen_only_after_its_event_fails() -> None:
    build = Build()
    milestone = build.events[5]
    milestone["evidence"] = [1]  # the boot snapshot, where the badge flag is not set
    bad = failed(run(build.files()))
    assert "RAIN_BADGE" in bad["native: milestones"]


def test_milestone_without_ram_evidence_fails() -> None:
    build = Build()
    build.events[5]["evidence"] = [3]  # a turn_start, not a state with raw RAM
    assert "RAIN_BADGE" in failed(run(build.files()))["native: milestones"]


def test_final_snapshot_without_a_save_block_fails() -> None:
    build = Build()
    poke(build.final, 0x03005D8C, bytes(4))
    bad = failed(run(build.files()))
    assert "save block" in bad["native: game clear flag"]
    assert "save block" in bad["native: badges"]


def test_default_party_reader_with_the_wrong_rom_fails_closed() -> None:
    report = vr.verify(MemoryRelease(Build().files()), ROM, rom_sha1=ROM_SHA1, rom_problem=None)
    assert "native: party" in failed(report)


def test_default_party_reader_counts() -> None:
    class Read:
        def __init__(self, count: int) -> None:
            self.count = count

        def __call__(self, address: int, length: int) -> bytes:
            if address == vr.PARTY_COUNT:
                return bytes([self.count])
            return bytes(length)

        def pokemon_cpu_context(self) -> None:
            return None

    assert vr.read_final_party(Read(0)) == ()  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="party count"):
        vr.read_final_party(Read(7))  # type: ignore[arg-type]


# --- INV-3: fail closed on every missing, unsupported or malformed input ---


@pytest.mark.parametrize("kind", ["events", "raw", "tar"])
def test_missing_inputs_fail_by_name(kind: str) -> None:
    files = Build().files()
    victim = {"events": "events-67d7.jsonl", "raw": "raw-ram-67d7.jsonl", "tar": "checkpoints-67d7.tar"}
    del files[victim[kind]]
    bad = failed(run(files))
    assert any("missing" in detail for detail in bad.values())
    assert not run(files).ok


def test_zstd_only_is_a_named_failure_and_a_supported_copy_wins() -> None:
    files = Build().files()
    files["events-67d7.jsonl.zst"] = files.pop("events-67d7.jsonl")
    bad = failed(run(files))
    assert "zstd" in bad["events: run_start"]
    both = Build().files() | {"events-67d7.jsonl.zst": b"\x28\xb5\x2f\xfd"}
    assert "events: run_start" not in failed(run(both))


def test_two_supported_copies_are_ambiguous() -> None:
    build = Build()
    files = build.files()
    files["events-67d7.jsonl.gz"] = gzip.compress(build.event_bytes())
    assert "ambiguous" in failed(run(files))["events: run_start"]


def test_integrity_failures() -> None:
    files = Build().files()
    assert "missing SHA256SUMS" in failed(run({k: v for k, v in files.items() if k != "SHA256SUMS"}))[
        "integrity"
    ]
    tampered = dict(files)
    tampered["raw-ram-67d7.jsonl"] = files["raw-ram-67d7.jsonl"] + b""
    tampered["events-67d7.jsonl"] = files["events-67d7.jsonl"].replace(b"medium", b"MEDIUM")
    assert "events-67d7.jsonl: sha256 mismatch" in failed(run(tampered))["integrity"]
    listed = dict(files)
    listed["SHA256SUMS"] += f"{'0' * 64}  screenshots.tar.zst\n".encode()
    assert "screenshots.tar.zst: missing" in failed(run(listed))["integrity"]
    unlisted = dict(files)
    unlisted["SHA256SUMS"] = b"".join(
        line + b"\n" for line in files["SHA256SUMS"].splitlines() if b"events" not in line
    )
    assert "events-67d7.jsonl: not listed" in failed(run(unlisted))["integrity"]
    for bad_line in (b"nonsense\n", f"{'0' * 64}  ../escape\n".encode(), f"{'0' * 64}  a/b\n".encode()):
        broken = dict(files)
        broken["SHA256SUMS"] = files["SHA256SUMS"] + bad_line
        assert "line" in failed(run(broken))["integrity"]
    duplicate = dict(files)
    duplicate["SHA256SUMS"] = files["SHA256SUMS"] + files["SHA256SUMS"].splitlines()[0] + b"\n"
    assert "listed twice" in failed(run(duplicate))["integrity"]
    empty = dict(files)
    empty["SHA256SUMS"] = b""
    assert "lists no files" in failed(run(empty))["integrity"]


def test_rom_failures() -> None:
    files = Build().files()
    assert "sha1" in failed(run(files, rom=b"other rom"))["rom"]
    report = vr.verify(
        MemoryRelease(files), None, rom_sha1=ROM_SHA1, read_party=party(RAYQUAZA),
        rom_problem="POKEBENCH_ROM is not set",
    )
    bad = failed(report)
    assert bad["rom"] == "POKEBENCH_ROM is not set"
    assert "ROM" in bad["native: party"]


# --- event-log shape ---


def tamper_events(change: Callable[[Build], None]) -> dict[str, str]:
    build = Build()
    change(build)
    return failed(run(build.files()))


def test_event_order_failures() -> None:
    def gap(b: Build) -> None:
        b.events[3]["seq"] = 30

    assert "seq" in tamper_events(gap)["events: order"]

    def other_run(b: Build) -> None:
        b.events[3]["run"] = "another-run"

    assert "run id" in tamper_events(other_run)["events: order"]


def test_turn_failures() -> None:
    def skip(b: Build) -> None:
        b.events[7]["turn"] = 3

    assert "turn_start" in tamper_events(skip)["events: turns"]

    def count(b: Build) -> None:
        b.events[-1]["turns"] = 5

    assert "run_end.turns" in tamper_events(count)["events: turns"]


def test_operator_steps_and_restores_fail() -> None:
    def human(b: Build) -> None:
        b.events.insert(4, {"type": "human_input", "turn": 1})
        for seq, event in enumerate(b.events):
            event.update(v=1, run=RUN, seq=seq, t=T)

    bad = tamper_events(human)
    assert "human_input" in bad["events: no restores or operator steps"]

    def restored(b: Build) -> None:
        b.events[0]["start_state"] = {"kind": "checkpoint", "milestone": "RUSTBORO_CITY"}

    assert "boot" in tamper_events(restored)["events: run_start"]


def test_run_start_failures() -> None:
    def first(b: Build) -> None:
        b.events[0]["type"] = "turn_start"

    assert "run_start" in tamper_events(first)["events: run_start"]

    def rom(b: Build) -> None:
        b.events[0]["rom_sha1"] = "f" * 40

    assert "rom_sha1" in tamper_events(rom)["events: run_start"]


def test_run_end_failures() -> None:
    def budget(b: Build) -> None:
        b.events[-1]["reason"] = "budget"

    assert "completed" in tamper_events(budget)["events: run_end"]

    def proof(b: Build) -> None:
        b.events[-1]["target_proof"] = {"name": "GAME_CLEAR_CONFIRMED", "milestone_seq": 5, "state_evidence": [8]}

    assert "milestone_seq" in tamper_events(proof)["events: run_end"]

    def evidence(b: Build) -> None:
        b.events[-1]["target_proof"] = {"name": "GAME_CLEAR_CONFIRMED", "milestone_seq": 6, "state_evidence": [4]}

    assert "credits" in tamper_events(evidence)["events: run_end"]

    def not_last(b: Build) -> None:
        b.add("turn_start", 3)

    assert "last event" in tamper_events(not_last)["events: run_end"]

    def name(b: Build) -> None:
        b.events[-1]["target_proof"] = {"name": "HALL_OF_FAME_ENTERED", "milestone_seq": 6, "state_evidence": [8]}

    assert "GAME_CLEAR_CONFIRMED" in tamper_events(name)["events: run_end"]


def test_features_digest_failures() -> None:
    def flipped(b: Build) -> None:
        evaluation = b.events[0]["evaluation"]
        assert isinstance(evaluation, dict)
        evaluation["features"]["rq-slim-prompt-v1"] = True

    assert "does not match" in tamper_events(flipped)["events: features digest"]

    def missing(b: Build) -> None:
        b.events[0]["evaluation"] = {"features": {}}

    assert "missing" in tamper_events(missing)["events: features digest"]


def test_features_digest_matches_the_agent_for_the_real_67d7_switches() -> None:
    assert vr.features_sha256(EVALUATION["features"]) == EVALUATION["features_sha256"]


def test_unreadable_event_lines_fail_every_event_check() -> None:
    build = Build()
    files = build.files()
    files["events-67d7.jsonl"] = build.event_bytes()[:-1]  # last line has no newline
    files["SHA256SUMS"] = "".join(
        f"{sha256(v)}  {k}\n" for k, v in files.items() if k != "SHA256SUMS"
    ).encode()
    bad = failed(run(files))
    assert "truncated" in bad["events: order"]
    assert "events: run_end" in bad and "native: milestones" in bad
    files["events-67d7.jsonl"] = b"{not json\n" + build.event_bytes()
    files["SHA256SUMS"] = "".join(
        f"{sha256(v)}  {k}\n" for k, v in files.items() if k != "SHA256SUMS"
    ).encode()
    assert "line 1" in failed(run(files))["events: order"]


# --- raw RAM ---


def test_raw_ram_failures() -> None:
    build = Build()
    build.final["sequence"] = 5
    assert "sequence" in failed(run(build.files()))["raw RAM: snapshots"]
    build = Build()
    build.final["rom_sha1"] = "f" * 40
    assert "rom_sha1" in failed(run(build.files()))["raw RAM: snapshots"]
    build = Build()
    region(build.final, "vram")["sha256"] = "0" * 64
    bad = failed(run(build.files()))
    assert "integrity" in bad["raw RAM: snapshots"]
    assert "native: game clear flag" in bad
    build = Build()
    build.final["frame"] = 1
    assert "frame" in failed(run(build.files()))["raw RAM: snapshots"]


def test_event_references_must_name_recorded_snapshots() -> None:
    build = Build()
    ref = build.events[8]["raw_ram"]
    assert isinstance(ref, dict)
    ref["frame"] = 12
    assert "frame" in failed(run(build.files()))["raw RAM: event references"]
    build = Build()
    ref = build.events[8]["raw_ram"]
    assert isinstance(ref, dict)
    ref["sequence"] = 9
    assert "not in the raw RAM" in failed(run(build.files()))["raw RAM: event references"]


def test_oversized_lines_fail_without_buffering(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vr, "RAM_LINE_CAP", 1024)
    monkeypatch.setattr(vr, "EVENT_LINE_CAP", 64)
    bad = failed(run(Build().files()))
    assert "longer than 1024 bytes" in bad["raw RAM: snapshots"]
    assert "longer than 64 bytes" in bad["events: order"]


# --- checkpoints ---


def member(name: str, kind: bytes = tarfile.REGTYPE, data: bytes | None = b"x") -> tuple[
    tarfile.TarInfo, bytes | None
]:
    info = tarfile.TarInfo(name)
    info.type = kind
    if kind == tarfile.SYMTYPE or kind == tarfile.LNKTYPE:
        info.linkname = "/etc/passwd"
        data = None
    else:
        info.size = 0 if data is None else len(data)
    return info, data


@pytest.mark.parametrize(
    ("entry", "reason"),
    [
        (member("checkpoints/EVIL.state", tarfile.SYMTYPE), "link"),
        (member("checkpoints/EVIL.state", tarfile.LNKTYPE), "link"),
        (member("checkpoints/../EVIL.state"), "unsafe name"),
        (member("/checkpoints/EVIL.state"), "unsafe name"),
        (member("other/EVIL.state"), "unsafe name"),
        (member("checkpoints/GAME_CLEAR_FINAL.state"), "twice"),
        (member("checkpoints/fifo", tarfile.FIFOTYPE, None), "unsafe name"),
        (member("checkpoints/ODD.state", tarfile.FIFOTYPE, None), "not a regular file"),
    ],
)
def test_unsafe_tar_members_fail(entry: tuple[tarfile.TarInfo, bytes | None], reason: str) -> None:
    build = Build()
    build.extra_members.append(entry)
    assert reason in failed(run(build.files()))["checkpoints: archive"]


def test_checkpoint_size_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vr, "STATE_CAP", 4)
    assert "larger than" in failed(run(Build().files()))["checkpoints: archive"]


def test_checkpoint_member_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vr, "MAX_MEMBERS", 2)
    assert "more than 2" in failed(run(Build().files()))["checkpoints: archive"]


def test_checkpoint_pairs_digests_and_provenance() -> None:
    build = Build()
    del build.states["GAME_CLEAR_CONFIRMED.state"]
    assert "GAME_CLEAR_CONFIRMED" in failed(run(build.files()))["checkpoints: archive"]
    build = Build()
    build.states["GAME_CLEAR_CONFIRMED.state"] = b"swapped"
    assert "GAME_CLEAR_CONFIRMED" in failed(run(build.files()))["checkpoints: digests"]
    build = Build()
    side = build.sidecars["GAME_CLEAR_CONFIRMED.json"]
    assert isinstance(side, dict)
    side["source"] = {"rom_sha1": ROM_SHA1, "start_state": {"kind": "checkpoint"}}
    assert "boot" in failed(run(build.files()))["checkpoints: provenance"]
    build = Build()
    final = build.sidecars["GAME_CLEAR_FINAL.json"]
    assert isinstance(final, dict)
    final["proof"] = {"name": "GAME_CLEAR_CONFIRMED", "milestone_seq": 1, "state_evidence": [8]}
    assert "proof" in failed(run(build.files()))["checkpoints: provenance"]
    build = Build()
    side = build.sidecars["GAME_CLEAR_CONFIRMED.json"]
    assert isinstance(side, dict)
    side["milestone_event"] = {"seq": 5}
    assert "milestone event" in failed(run(build.files()))["checkpoints: provenance"]
    build = Build()
    side = build.sidecars["GAME_CLEAR_CONFIRMED.json"]
    assert isinstance(side, dict)
    side["run"] = "other"
    assert "run" in failed(run(build.files()))["checkpoints: provenance"]
    build = Build()
    del build.sidecars["GAME_CLEAR_FINAL.json"], build.states["GAME_CLEAR_FINAL.state"]
    assert "GAME_CLEAR_FINAL" in failed(run(build.files()))["checkpoints: archive"]
    build = Build()
    build.sidecars["GAME_CLEAR_CONFIRMED.json"] = ["not", "an", "object"]
    assert "GAME_CLEAR_CONFIRMED" in failed(run(build.files()))["checkpoints: archive"]


def test_corrupt_tar_fails() -> None:
    files = Build().files()
    files["checkpoints-67d7.tar"] = b"not a tar archive" * 100
    files["SHA256SUMS"] = "".join(
        f"{sha256(v)}  {k}\n" for k, v in files.items() if k != "SHA256SUMS"
    ).encode()
    bad = failed(run(files))
    assert {"checkpoints: archive", "checkpoints: digests", "checkpoints: provenance"} <= set(bad)


# --- INV-1 and INV-4: read-only, in memory, each file read once ---


def test_verifier_only_reads_and_reads_each_file_once() -> None:
    release = MemoryRelease(Build().files())
    report = vr.verify(release, ROM, rom_sha1=ROM_SHA1, read_party=party(RAYQUAZA), rom_problem=None)
    assert report.ok
    assert sorted(release.opened) == sorted(release.files)
    assert not hasattr(release, "write")


# --- the milestone table and the raw-RAM record split ---


def test_native_milestone_predicates() -> None:
    flags = bytearray(0x12C)
    flags[0x864 >> 3] |= 1 << (0x864 & 7)
    variables = bytearray(0x200)
    variables[2 * (0x405E - 0x4000)] = 2
    table = vr.parse_milestone_table(
        {
            "milestones": [
                {"name": "A", "flag": 0x864},
                {"name": "B", "anyFlags": [1, 0x864]},
                {"name": "C", "allFlags": [1, 0x864]},
                {"name": "D", "variable": 0x405E, "maximum": 3, "values": [2]},
                {"name": "E", "variable": 0x405E, "maximum": 1, "values": [2]},
            ]
        }
    )
    reached = {n: m.reached(bytes(flags), bytes(variables)) for n, m in table.items()}
    assert reached == {"A": True, "B": True, "C": False, "D": True, "E": False}


@pytest.mark.parametrize(
    "bad",
    [
        {},
        {"milestones": [{"name": "A"}]},
        {"milestones": [{"name": "A", "flag": 0x12C * 8}]},
        {"milestones": [{"name": "A", "flag": True}]},
        {"milestones": [{"name": "A", "variable": 0x4100, "maximum": 1, "values": [1]}]},
        {"milestones": [{"name": "A", "flag": 1}, {"name": "A", "flag": 2}]},
        {"milestones": [{"name": 3, "flag": 1}]},
        {"milestones": [{"name": "A", "anyFlags": []}]},
    ],
)
def test_milestone_table_rejects_malformed_rows(bad: object) -> None:
    with pytest.raises(ValueError):
        vr.parse_milestone_table(bad)


def test_shipped_table_has_the_headline_flags() -> None:
    assert vr.MILESTONES["GAME_CLEAR_CONFIRMED"].flags == (0x864,)
    assert vr.MILESTONES["RAIN_BADGE"].flags == (0x86E,)


def test_parse_raw_ram_record_is_the_load_raw_ram_validation() -> None:
    value = snapshot(FINAL_GZ, 1)
    reader = parse_raw_ram_record(value)
    assert reader.metadata["frame"] == value["frame"]
    with pytest.raises(ValueError, match="ROM identity"):
        parse_raw_ram_record(value, rom=b"other")
    assert parse_raw_ram_record(value, rom=ROM).rom == ROM
    for change, message in (
        (lambda v: v.update(v=2), "version"),
        (lambda v: v.update(regions=[]), "region table"),
        (lambda v: v["regions"][0].update(address=0), "region layout"),
        (lambda v: v["regions"][0].update(sha256="0" * 64), "region integrity"),
        (lambda v: v.update(gprs=[0] * 15), "CPU registers"),
    ):
        broken = json.loads(json.dumps(value))
        change(broken)
        with pytest.raises(ValueError, match=message):
            parse_raw_ram_record(broken)
    with pytest.raises(ValueError, match="version"):
        parse_raw_ram_record(["not", "a", "record"])


# --- the command ---


def test_main_prints_one_line_per_check_and_exits_by_result() -> None:
    out = io.StringIO()
    files = Build().files()
    code = vr.main(
        ["release"],
        {"POKEBENCH_ROM": "rom.gba"},
        open_release=lambda _p: MemoryRelease(files),
        read_rom=lambda _p: ROM,
        out=out,
        rom_sha1=ROM_SHA1,
        read_party=party(RAYQUAZA),
    )
    lines = out.getvalue().splitlines()
    assert code == 0
    assert sum(line.startswith("PASS ") for line in lines) == 17
    out = io.StringIO()
    code = vr.main(["release"], {}, open_release=lambda _p: MemoryRelease(files), out=out)
    assert code == 1
    assert "FAIL rom: POKEBENCH_ROM is not set" in out.getvalue()


def test_main_usage_and_unreadable_inputs() -> None:
    out = io.StringIO()
    assert vr.main([], {}, out=out) == 2
    assert "usage" in out.getvalue()

    def no_folder(_path: Path) -> MemoryRelease:
        raise NotADirectoryError("release")

    out = io.StringIO()
    assert vr.main(["x"], {}, open_release=no_folder, out=out) == 1
    assert "FAIL release folder" in out.getvalue()

    def no_rom(_path: Path) -> bytes:
        raise FileNotFoundError("rom.gba")

    out = io.StringIO()
    files = Build().files()
    code = vr.main(
        ["x"], {"POKEBENCH_ROM": "rom.gba"}, open_release=lambda _p: MemoryRelease(files),
        read_rom=no_rom, out=out,
    )
    assert code == 1
    assert "FAIL rom: cannot read POKEBENCH_ROM" in out.getvalue()
