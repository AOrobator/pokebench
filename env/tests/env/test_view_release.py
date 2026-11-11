"""just view-release: unpack a release into a viewer run folder, all in memory."""

import base64
import gzip
import hashlib
import io
import json
import lzma
import tarfile
from pathlib import Path
from typing import BinaryIO

import pytest

from pokebench_env import view_release as vrl
from pokebench_env.raw_ram import REGIONS

RUN = "2026-11-10T15-37-43_opus-rayquaza-boot_67d7"
ROM_SHA1 = "f3ae088181bf583e55daf962a92bb46f4f1d07b7"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tar(
    members: dict[str, bytes],
    *,
    dirs: tuple[str, ...] = (),
    extra: list[tarfile.TarInfo] | None = None,
) -> bytes:
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w") as t:
        for d in dirs:
            info = tarfile.TarInfo(d)
            info.type = tarfile.DIRTYPE
            t.addfile(info)
        for name, body in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(body)
            t.addfile(info, io.BytesIO(body))
        for info in extra or []:
            t.addfile(info)
    return out.getvalue()


def snapshot_line(sequence: int, frame: int) -> bytes:
    regions = []
    for index, (name, address, size) in enumerate(REGIONS):
        data = bytes([(sequence * 13 + index) % 256]) * size
        regions.append(
            {
                "name": name,
                "address": address,
                "size": size,
                "data_base64": base64.b64encode(data).decode(),
                "sha256": sha256(data),
            }
        )
    record = {
        "v": 1,
        "sequence": sequence,
        "frame": frame,
        "timestamp_ns": 1_000_000 * (sequence + 1),
        "rom_sha1": ROM_SHA1,
        "gprs": [0] * 16,
        "cpsr": 0,
        "regions": regions,
    }
    return json.dumps(record, separators=(",", ":")).encode()


class Build:
    def __init__(self) -> None:
        self.snaps = [snapshot_line(0, 0), snapshot_line(1, 30)]
        self.ref_sha = [
            sha256(gzip.compress(line, compresslevel=1, mtime=0)) for line in self.snaps
        ]
        self.first: dict[str, object] = {
            "v": 1,
            "run": RUN,
            "seq": 0,
            "type": "run_start",
            "turn": 0,
        }
        self.frames = {"frames/000011_0.png": b"\x89PNG one", "frames/000023_0.png": b"\x89PNG two"}
        self.checkpoints = {
            "checkpoints/RUN_END.state": b"state",
            "checkpoints/RUN_END.json": b"{}",
        }
        self.frame_extra: list[tarfile.TarInfo] = []
        self.ext = ".xz"

    def events(self) -> bytes:
        lines = [
            self.first,
            {
                "v": 1,
                "run": RUN,
                "seq": 1,
                "type": "state",
                "raw_ram": {
                    "v": 1,
                    "sequence": 0,
                    "frame": 0,
                    "sha256": self.ref_sha[0],
                    "path": "raw-ram/00000000.json.gz",
                },
            },
            {
                "v": 1,
                "run": RUN,
                "seq": 2,
                "type": "state",
                "raw_ram": {
                    "v": 1,
                    "sequence": 1,
                    "frame": 30,
                    "sha256": self.ref_sha[1],
                    "path": "raw-ram/00000001.json.gz",
                },
            },
            {"v": 1, "run": RUN, "seq": 3, "type": "run_end", "turn": 1},
        ]
        return b"".join(json.dumps(line).encode() + b"\n" for line in lines)

    def files(self) -> dict[str, bytes]:
        pack = lzma.compress if self.ext == ".xz" else (lambda d: d)
        files = {
            "events-67d7.tar" + self.ext: pack(tar({"events.jsonl": self.events()})),
            "screenshots-67d7.tar" + self.ext: pack(
                tar(self.frames, dirs=("frames",), extra=self.frame_extra)
            ),
            "checkpoints-67d7.tar" + self.ext: pack(tar(self.checkpoints, dirs=("checkpoints",))),
            "raw-ram-67d7.jsonl" + self.ext: pack(b"".join(line + b"\n" for line in self.snaps)),
            "raw-ram-final.json.gz": gzip.compress(self.snaps[-1], compresslevel=1, mtime=0),
        }
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


class MemoryOutput:
    def __init__(self) -> None:
        self.published: dict[str, dict[str, bytes]] = {}
        self.markers: dict[str, str] = {}
        self.partial: dict[str, bytes] | None = None
        self.discarded: list[str] = []
        self.stray: set[str] = set()

    def existing(self, run_id: str) -> str | None:
        if run_id in self.stray:
            raise vrl.ReleaseError(f"runs/releases/{run_id} exists but is not a finished unpack")
        return self.markers.get(run_id)

    def begin(self, run_id: str) -> None:
        self.partial = {}

    def write(self, rel: str, chunks: object) -> None:
        assert self.partial is not None
        assert rel not in self.partial
        self.partial[rel] = b"".join(chunks)  # type: ignore[call-overload]

    def append(self, rel: str, data: bytes) -> None:
        assert self.partial is not None
        self.partial[rel] = self.partial.get(rel, b"") + data

    def publish(self, run_id: str, marker: str) -> None:
        assert self.partial is not None
        self.published[run_id] = self.partial
        self.markers[run_id] = marker
        self.partial = None

    def discard(self, run_id: str) -> None:
        self.partial = None
        self.discarded.append(run_id)


def unpack(
    files: dict[str, bytes], *, raw_ram: bool = False, output: MemoryOutput | None = None
) -> tuple[vrl.Unpacked, MemoryOutput]:
    out = output or MemoryOutput()
    return vrl.unpack(MemoryRelease(files), out, raw_ram=raw_ram), out


# --- unpack ---


@pytest.mark.parametrize("ext", ["", ".xz"])
def test_unpacks_events_frames_and_checkpoints(ext: str) -> None:
    build = Build()
    build.ext = ext
    result, out = unpack(build.files())
    assert result.run_id == RUN and not result.reused
    run = out.published[RUN]
    assert run["events.jsonl"] == build.events()
    assert run["frames/000011_0.png"] == b"\x89PNG one"
    assert run["checkpoints/RUN_END.state"] == b"state"
    assert not any(rel.startswith("raw-ram/") for rel in run)
    assert (result.frames, result.checkpoints, result.snapshots) == (2, 2, 0)


def test_raw_ram_is_rebuilt_byte_identical_and_checked_against_the_events() -> None:
    build = Build()
    result, out = unpack(build.files(), raw_ram=True)
    run = out.published[RUN]
    assert sha256(run["raw-ram/00000000.json.gz"]) == build.ref_sha[0]
    assert sha256(run["raw-ram/00000001.json.gz"]) == build.ref_sha[1]
    index = [json.loads(line) for line in run["raw-ram/index.jsonl"].splitlines()]
    assert index[1] == {
        "v": 1, "sequence": 1, "frame": 30, "timestamp_ns": 2_000_000, "rom_sha1": ROM_SHA1,
        "gprs": [0] * 16, "cpsr": 0, "path": "00000001.json.gz", "sha256": build.ref_sha[1],
        "bytes": len(run["raw-ram/00000001.json.gz"]), "raw_bytes": 527360,
    }  # fmt: skip
    assert result.snapshots == 2
    build.ref_sha[1] = "0" * 64
    with pytest.raises(vrl.ReleaseError, match="snapshot 1 .* does not match the event log"):
        unpack(build.files(), raw_ram=True)


def test_a_finished_unpack_of_the_same_release_is_reused() -> None:
    files = Build().files()
    _, out = unpack(files)
    release = MemoryRelease(files)
    result = vrl.unpack(release, out, raw_ram=False)
    assert result.reused
    other = Build()
    other.frames["frames/000099_0.png"] = b"\x89PNG three"
    with pytest.raises(vrl.ReleaseError, match="different release"):
        unpack(other.files(), output=out)
    stray = MemoryOutput()
    stray.stray.add(RUN)
    with pytest.raises(vrl.ReleaseError, match="not a finished unpack"):
        unpack(files, output=stray)


def test_reuse_still_checks_the_archives() -> None:
    files = Build().files()
    _, out = unpack(files)
    tampered = dict(files)
    tampered["screenshots-67d7.tar.xz"] = lzma.compress(
        tar({"frames/000011_0.png": b"other"}, dirs=("frames",))
    )
    with pytest.raises(vrl.ReleaseError, match="sha256 mismatch"):
        unpack(tampered, output=out)


# --- fail closed: nothing published (INV-1, INV-2) ---


def assert_nothing_published(files: dict[str, bytes], match: str, *, raw_ram: bool = False) -> None:
    out = MemoryOutput()
    with pytest.raises(vrl.ReleaseError, match=match):
        vrl.unpack(MemoryRelease(files), out, raw_ram=raw_ram)
    assert out.published == {}


def test_checksum_failures_publish_nothing() -> None:
    files = Build().files()
    bad = dict(files)
    bad["checkpoints-67d7.tar.xz"] = lzma.compress(
        tar({"checkpoints/RUN_END.state": b"swapped"}, dirs=("checkpoints",))
    )
    assert_nothing_published(bad, "checkpoints-67d7.tar.xz: sha256 mismatch")
    unlisted = dict(files)
    unlisted["SHA256SUMS"] = b"".join(
        line + b"\n" for line in files["SHA256SUMS"].splitlines() if b"screenshots" not in line
    )
    assert_nothing_published(unlisted, "screenshots-67d7.tar.xz: not listed in SHA256SUMS")
    assert_nothing_published(
        {k: v for k, v in files.items() if k != "SHA256SUMS"}, "missing SHA256SUMS"
    )
    missing = resum({k: v for k, v in files.items() if not k.startswith("screenshots")})
    assert_nothing_published(missing, "missing screenshots file")


@pytest.mark.parametrize(
    ("member", "match"),
    [
        ("frames/../evil.png", "unsafe"),
        ("/frames/000001_0.png", "unsafe"),
        ("frames/evil.txt", "unsafe"),
        ("frames/000011_0.png", "twice"),
    ],
)
def test_unsafe_screenshot_members_publish_nothing(member: str, match: str) -> None:
    build = Build()
    info = tarfile.TarInfo(member)
    info.size = 0
    build.frame_extra.append(info)
    assert_nothing_published(build.files(), match)


def test_links_and_oversized_frames_publish_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    build = Build()
    link = tarfile.TarInfo("frames/000077_0.png")
    link.type = tarfile.SYMTYPE
    link.linkname = "/etc/passwd"
    build.frame_extra.append(link)
    assert_nothing_published(build.files(), "link")
    monkeypatch.setattr(vrl, "FRAME_CAP", 4)
    assert_nothing_published(Build().files(), "larger than 4 bytes")
    monkeypatch.undo()
    monkeypatch.setattr(vrl, "MAX_FRAMES", 1)
    assert_nothing_published(Build().files(), "more than 1")


def test_checkpoint_members_follow_the_verify_release_rules() -> None:
    build = Build()
    build.checkpoints["checkpoints/lower.state"] = b"x"
    assert_nothing_published(build.files(), "unsafe")


@pytest.mark.parametrize(
    "first",
    [
        {"type": "turn_start"},
        {"type": "turn_start", "run": RUN},
        {"type": "run_start", "run": "../escape"},
        {"type": "run_start", "run": ""},
    ],
)
def test_the_run_id_comes_from_a_valid_run_start(first: dict[str, object]) -> None:
    build = Build()
    build.first = first
    assert_nothing_published(build.files(), "run_start")


def test_raw_ram_failures_publish_nothing() -> None:
    build = Build()
    build.snaps[1] = snapshot_line(5, 30)  # sequence gap
    assert_nothing_published(build.files(), "sequence", raw_ram=True)
    files = Build().files()
    files["raw-ram-67d7.jsonl.xz"] = lzma.compress(b"{not json\n")
    assert_nothing_published(resum(files), "raw-RAM log line 1", raw_ram=True)


def test_a_failure_after_the_unpack_began_discards_the_partial_folder() -> None:
    files = Build().files()
    files["checkpoints-67d7.tar.xz"] = lzma.compress(
        tar({"checkpoints/RUN_END.state": b"x"}, dirs=("checkpoints",))
    )
    out = MemoryOutput()
    with pytest.raises(vrl.ReleaseError, match="sha256 mismatch"):
        vrl.unpack(MemoryRelease(files), out, raw_ram=False)
    assert out.published == {} and out.partial is None and out.discarded == [RUN]


def test_a_frame_named_member_must_be_a_regular_file() -> None:
    build = Build()
    folder = tarfile.TarInfo("frames/000050_0.png")
    folder.type = tarfile.DIRTYPE
    build.frame_extra.append(folder)
    assert_nothing_published(build.files(), "unsafe or unexpected")


# --- the viewer command (INV-4) ---


def test_viewer_command_never_uses_8790_or_the_model_endpoint() -> None:
    environ = {
        "PATH": "/usr/bin",
        "POKEBENCH_ENDPOINT_FILE": "/x/endpoint.json",
        "POKEBENCH_VIEWER_ORIGINS": "https://h",
        "HOME": "/h",
    }
    argv, env = vrl.viewer_command(
        Path("/repo"), Path("/repo/runs/releases") / RUN, RUN, 51234, environ
    )
    assert argv == [
        "node",
        "/repo/packages/viewer/dist/cli.js",
        "--runs",
        f"/repo/runs/releases/{RUN}",
        "--port",
        "51234",
        RUN,
    ]
    assert "POKEBENCH_ENDPOINT_FILE" not in env and "POKEBENCH_VIEWER_ORIGINS" not in env
    assert env["PATH"] == "/usr/bin"
    with pytest.raises(vrl.ReleaseError, match="8790"):
        vrl.viewer_command(Path("/repo"), Path("/r"), RUN, 8790, environ)
    with pytest.raises(vrl.ReleaseError, match="port"):
        vrl.viewer_command(Path("/repo"), Path("/r"), RUN, 80, environ)


# --- the command ---


def test_main_unpacks_then_execs_the_viewer() -> None:
    files = Build().files()
    out = MemoryOutput()
    launched: list[tuple[list[str], dict[str, str]]] = []
    text = io.StringIO()
    code = vrl.main(
        ["rel", "--raw-ram"],
        {"PATH": "/usr/bin", "POKEBENCH_ENDPOINT_FILE": "/e"},
        repo=Path("/repo"),
        open_release=lambda _p: MemoryRelease(files),
        output_for=lambda root: out,
        free_port=lambda: 50123,
        exec_viewer=lambda argv, env: launched.append((argv, env)),
        out=text,
    )
    assert code == 0
    assert RUN in out.published and "raw-ram/index.jsonl" in out.published[RUN]
    assert launched[0][0][-3:] == ["--port", "50123", RUN]
    assert "unpacked" in text.getvalue() and "http://127.0.0.1:50123/" in text.getvalue()
    assert f"just party-art /repo/runs/releases/{RUN}/sprites/party-v1" in text.getvalue()
    assert "just trainer-card-art" in text.getvalue() and "just bag-art" in text.getvalue()
    launched.clear()
    vrl.main(
        ["rel", "--port", "50999"],
        {},
        repo=Path("/repo"),
        open_release=lambda _p: MemoryRelease(files),
        output_for=lambda root: out,
        free_port=lambda: 1,
        exec_viewer=lambda argv, env: launched.append((argv, env)),
        out=io.StringIO(),
    )
    assert launched[0][0][-3:] == ["--port", "50999", RUN]


def test_main_usage_and_failures() -> None:
    assert vrl.main([], {}, out=io.StringIO()) == 2
    assert vrl.main(["rel", "--port"], {}, out=io.StringIO()) == 2
    assert vrl.main(["rel", "--port", "x"], {}, out=io.StringIO()) == 2
    text = io.StringIO()

    def no_folder(_p: Path) -> MemoryRelease:
        raise NotADirectoryError("rel")

    assert vrl.main(["rel"], {}, open_release=no_folder, out=text) == 1
    assert "FAIL release folder" in text.getvalue()
    build = Build()
    build.first = {"type": "turn_start"}
    text = io.StringIO()
    files = build.files()
    code = vrl.main(
        ["rel"],
        {},
        repo=Path("/repo"),
        open_release=lambda _p: MemoryRelease(files),
        output_for=lambda root: MemoryOutput(),
        exec_viewer=lambda argv, env: None,
        out=text,
    )
    assert code == 1 and "FAIL unpack" in text.getvalue()


# --- review round 1: reuse modes, reference bounds, concurrent unpacks ---


def test_a_base_unpack_is_not_reused_for_raw_ram_but_a_raw_ram_one_serves_both() -> None:
    files = Build().files()
    _, out = unpack(files)
    assert out.markers[RUN].endswith(" base")
    with pytest.raises(vrl.ReleaseError, match="without --raw-ram"):
        unpack(files, raw_ram=True, output=out)
    _, full = unpack(files, raw_ram=True)
    assert full.markers[RUN].endswith(" raw-ram")
    assert vrl.unpack(MemoryRelease(files), full, raw_ram=True).reused
    assert vrl.unpack(MemoryRelease(files), full, raw_ram=False).reused


def test_raw_ram_references_are_validated_and_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    build = Build()
    build.ref_sha[0] = "x" * 8
    assert_nothing_published(build.files(), "without a sha256 digest", raw_ram=True)
    monkeypatch.setattr(vrl, "MAX_REFS", 1)
    assert_nothing_published(Build().files(), "more than 1 snapshots", raw_ram=True)


class MemoryFs:
    """Directories and files in memory, with rename semantics like the real disk."""

    def __init__(self) -> None:
        self.dirs: set[Path] = set()
        self.files: dict[Path, bytes] = {}
        self.counter = 0

    def entry(self, path: Path) -> str:
        if path in self.files:
            return "file"
        return "dir" if path in self.dirs else "missing"

    def read_text(self, path: Path) -> str:
        return self.files[path].decode()

    def make_unique_dir(self, parent: Path, prefix: str) -> Path:
        self.counter += 1
        path = parent / f"{prefix}{self.counter}.partial"
        self.dirs.add(path)
        return path

    def write_new(self, path: Path, chunks: object) -> None:
        assert path not in self.files
        self.files[path] = b"".join(chunks)  # type: ignore[call-overload]

    def append(self, path: Path, data: bytes) -> None:
        self.files[path] = self.files.get(path, b"") + data

    def rename_new(self, source: Path, target: Path) -> None:
        if target in self.dirs or target in self.files:
            raise FileExistsError(str(target))
        moved = {p: target / p.relative_to(source) for p in self.files if source in p.parents}
        for old, new in moved.items():
            self.files[new] = self.files.pop(old)
        self.dirs.discard(source)
        self.dirs.add(target)

    def remove_tree(self, path: Path) -> None:
        for p in [p for p in self.files if path in p.parents]:
            del self.files[p]
        self.dirs.discard(path)


def test_concurrent_unpacks_never_publish_a_mixed_or_partial_folder() -> None:
    fs = MemoryFs()
    root = Path("/repo/runs/releases")
    a, b = vrl.DiskOutput(root, fs), vrl.DiskOutput(root, fs)
    a.begin(RUN)
    a.write("events.jsonl", [b"events"])
    b.begin(RUN)  # the interleaving from review: B starts after A wrote its events
    a.write("frames/000011_0.png", [b"png"])
    a.publish(RUN, "sums base")
    b.write("events.jsonl", [b"events"])
    with pytest.raises(vrl.ReleaseError, match="finished first"):
        b.publish(RUN, "sums base")
    b.discard(RUN)
    final = root / RUN
    assert fs.files[final / RUN / "events.jsonl"] == b"events"
    assert fs.files[final / RUN / "frames/000011_0.png"] == b"png"
    assert vrl.DiskOutput(root, fs).existing(RUN) == "sums base"
    assert not any(".partial" in str(p) for p in fs.files)


def test_disk_output_discards_only_its_own_staging_and_rejects_stray_folders() -> None:
    fs = MemoryFs()
    root = Path("/r")
    a, b = vrl.DiskOutput(root, fs), vrl.DiskOutput(root, fs)
    a.begin(RUN)
    a.append("raw-ram/index.jsonl", b"one\n")
    a.append("raw-ram/index.jsonl", b"two\n")
    b.begin(RUN)
    b.write("events.jsonl", [b"b"])
    b.discard(RUN)
    b.discard(RUN)  # idempotent
    a.publish(RUN, "m raw-ram")
    assert fs.files[root / RUN / RUN / "raw-ram/index.jsonl"] == b"one\ntwo\n"
    assert vrl.DiskOutput(root, fs).existing("other") is None
    fs.dirs.add(root / "stray")
    with pytest.raises(vrl.ReleaseError, match="not a finished unpack"):
        vrl.DiskOutput(root, fs).existing("stray")
