"""Open a downloaded release in the PokeBench viewer (`just view-release <folder>`).

The release's archives are checked against SHA256SUMS while they stream and are laid out as one run
folder under the gitignored runs/releases/<run-id>/: events.jsonl, frames/, checkpoints/ and, with
--raw-ram, raw-ram/ rebuilt byte for byte. The work happens in a partial folder that is renamed
into place only after everything verified. Then the viewer starts on that folder on 127.0.0.1, on
a port that is never the live viewer's 8790, with next-run controls off.
"""

import gzip
import hashlib
import io
import json
import os
import re
import shutil
import socket
import sys
import tarfile
import tempfile
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol, TextIO, cast

from pokebench_env import verify_release as vr
from pokebench_env.raw_ram import MAX_ARCHIVE_BYTES, parse_raw_ram_record
from pokebench_env.verify_release import Check, ReleaseError, ReleaseFiles

LIVE_VIEWER_PORT = 8790
REPO = Path(__file__).resolve().parents[2]
RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
FRAME_MEMBER = re.compile(r"frames/(\d{6}_\d+\.png)")
FRAME_CAP = 8 * 1024 * 1024
MAX_REFS = 500_000  # raw_ram references kept for --raw-ram checks; 67d7 has 48,201
SHA256 = re.compile(r"[0-9a-f]{64}")
MARKER_FILE = ".release-sha256sums"
MAX_FRAMES = 200_000
# The viewer reads these to find model endpoints and public origins; a release view has neither.
STRIPPED_ENV = ("POKEBENCH_ENDPOINT_FILE", "POKEBENCH_VIEWER_ORIGINS")
KINDS = {
    "events": vr.KINDS["events"],
    "screenshots": re.compile(r"screenshots[A-Za-z0-9._-]*\.tar(\.gz|\.xz|\.zst)?"),
    "checkpoints": vr.KINDS["checkpoints"],
}
RAW_RAM_KIND = {
    "raw-RAM log": re.compile(r"raw-ram(?!-final)[A-Za-z0-9._-]*\.jsonl(\.gz|\.xz|\.zst)?")
}
INDEX_KEYS = ("v", "sequence", "frame", "timestamp_ns", "rom_sha1", "gprs", "cpsr")


class Output(Protocol):
    """Where a run folder is built: a partial folder, published whole or discarded."""

    def existing(self, run_id: str) -> str | None: ...

    def begin(self, run_id: str) -> None: ...

    def write(self, rel: str, chunks: Iterable[bytes]) -> None: ...

    def append(self, rel: str, data: bytes) -> None: ...

    def publish(self, run_id: str, marker: str) -> None: ...

    def discard(self, run_id: str) -> None: ...


@dataclass(frozen=True)
class Unpacked:
    run_id: str
    reused: bool
    frames: int = 0
    checkpoints: int = 0
    snapshots: int = 0


# --- readers ---


def _stream(files: ReleaseFiles, target: str) -> tuple[vr._Tee, BinaryIO, BinaryIO]:
    raw = files.open(target)
    tee = vr._Tee(raw)
    buffered = cast(BinaryIO, io.BufferedReader(tee, vr.CHUNK))
    return tee, raw, buffered if vr._is_tar(target) else vr._decoder(target, buffered)


def _first_line(stream: BinaryIO) -> tuple[str, bytes]:
    line = stream.readline(vr.EVENT_LINE_CAP + 1)
    if len(line) > vr.EVENT_LINE_CAP or not line.endswith(b"\n"):
        raise ReleaseError("event log line 1 is too long or truncated")
    try:
        event = json.loads(line)
    except ValueError:
        raise ReleaseError("event log line 1 is not JSON") from None
    run = event.get("run") if isinstance(event, dict) else None
    if not isinstance(event, dict) or event.get("type") != "run_start" or not isinstance(run, str):
        raise ReleaseError("the event log does not start with a run_start naming its run")
    if RUN_ID.fullmatch(run) is None:
        raise ReleaseError(f"run_start names an invalid run id {run!r}")
    return run, line


def _peek_run_id(files: ReleaseFiles, target: str) -> str:
    """The run id from the first line only, without decoding the rest of the log.

    The full pass checks everything else (single member, digest, every line) before publishing.
    """
    _, raw, stream = _stream(files, target)
    with raw:
        if not vr._is_tar(target):
            return _first_line(stream)[0]
        with vr._open_tar(stream, target) as tar:
            member = tar.next()
            if (
                member is None
                or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE)
                or vr.EVENT_MEMBER.fullmatch(member.name) is None
            ):
                raise ReleaseError("event archive does not start with a plain events*.jsonl file")
            body = tar.extractfile(member)
            assert body is not None
            return _first_line(cast(BinaryIO, body))[0]


def _event_lines(stream: BinaryIO, first: bytes, refs: dict[int, str] | None) -> Iterator[bytes]:
    yield first
    for _, line in vr._lines(stream, vr.EVENT_LINE_CAP, "event log"):
        if refs is not None:
            try:
                event = json.loads(line)
            except ValueError:
                raise ReleaseError("event log has a line that is not JSON") from None
            ref = event.get("raw_ram") if isinstance(event, dict) else None
            if isinstance(ref, dict) and type(ref.get("sequence")) is int:
                digest = ref.get("sha256")
                if not isinstance(digest, str) or SHA256.fullmatch(digest) is None:
                    raise ReleaseError("event log has a raw_ram reference without a sha256 digest")
                refs[cast(int, ref["sequence"])] = digest
                if len(refs) > MAX_REFS:
                    raise ReleaseError(f"event log references more than {MAX_REFS:,} snapshots")
        yield line


def _chunks(body: BinaryIO) -> Iterator[bytes]:
    while chunk := body.read(vr.CHUNK):
        yield chunk


def _frames(stream: BinaryIO, name: str, output: Output) -> int:
    count = 0
    seen: set[str] = set()
    with vr._open_tar(stream, name) as tar:
        for member in tar:
            if member.issym() or member.islnk():
                raise ReleaseError(f"screenshots member {member.name!r} is a link")
            if member.isdir() and member.name.rstrip("/") == "frames":
                continue
            match = FRAME_MEMBER.fullmatch(member.name)
            if match is None or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE):
                raise ReleaseError(f"screenshots member {member.name!r} is unsafe or unexpected")
            if member.name in seen:
                raise ReleaseError(f"screenshots member {member.name!r} appears twice")
            if member.size > FRAME_CAP:
                raise ReleaseError(
                    f"screenshots member {member.name!r} is larger than {FRAME_CAP} bytes"
                )
            count += 1
            if count > MAX_FRAMES:
                raise ReleaseError(f"screenshots archive has more than {MAX_FRAMES} frames")
            seen.add(member.name)
            body = tar.extractfile(member)
            assert body is not None
            output.write(f"frames/{match.group(1)}", _chunks(cast(BinaryIO, body)))
    return count


def _checkpoints(stream: BinaryIO, name: str, output: Output) -> int:
    count = 0
    seen: set[str] = set()
    with vr._open_tar(stream, name) as tar:
        for member in tar:
            count += 1
            if count > vr.MAX_MEMBERS:
                raise ReleaseError(f"checkpoint archive has more than {vr.MAX_MEMBERS} members")
            if member.issym() or member.islnk():
                raise ReleaseError(f"checkpoint member {member.name!r} is a link")
            if member.isdir() and member.name.rstrip("/") == "checkpoints":
                count -= 1
                continue
            match = vr.MEMBER_NAME.fullmatch(member.name)
            if match is None or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE):
                raise ReleaseError(f"checkpoint member {member.name!r} is unsafe or unexpected")
            if member.name in seen:
                raise ReleaseError(f"checkpoint member {member.name!r} appears twice")
            cap = vr.STATE_CAP if match.group(2) == "state" else vr.SIDECAR_CAP
            if member.size > cap:
                raise ReleaseError(f"checkpoint member {member.name!r} is larger than {cap} bytes")
            seen.add(member.name)
            body = tar.extractfile(member)
            assert body is not None
            output.write(
                f"checkpoints/{match.group(1)}.{match.group(2)}", _chunks(cast(BinaryIO, body))
            )
    return count


def _raw_ram(stream: BinaryIO, output: Output, refs: Mapping[int, str]) -> int:
    """Rebuild raw-ram/ as the run wrote it: gzip level 1, mtime 0, of the exact JSON text."""
    count = 0
    for number, line in vr._lines(stream, MAX_ARCHIVE_BYTES + 1, "raw-RAM log"):
        body = line[:-1]
        try:
            value = json.loads(body)
            parse_raw_ram_record(value)
        except (ValueError, TypeError) as error:
            raise ReleaseError(f"raw-RAM log line {number}: {error}") from None
        if value.get("sequence") != count:
            raise ReleaseError(f"raw-RAM log line {number} has sequence {value.get('sequence')!r}")
        packed = gzip.compress(body, compresslevel=1, mtime=0)
        digest = hashlib.sha256(packed).hexdigest()
        expected = refs.get(count)
        if expected is not None and expected != digest:
            raise ReleaseError(
                f"rebuilt snapshot {count} (sha256 {digest[:12]}…) does not match the event log's "
                f"raw_ram.sha256 {expected[:12]}…"
            )
        name = f"{count:08d}.json.gz"
        output.write(f"raw-ram/{name}", [packed])
        entry = {key: value[key] for key in INDEX_KEYS if key in value}
        entry |= {
            "path": name,
            "sha256": digest,
            "bytes": len(packed),
            "raw_bytes": sum(r["size"] for r in value["regions"]),
        }
        output.append(
            "raw-ram/index.jsonl", json.dumps(entry, separators=(",", ":")).encode() + b"\n"
        )
        count += 1
    if count == 0:
        output.write("raw-ram/index.jsonl", [])
    return count


# --- unpack ---


def unpack(files: ReleaseFiles, output: Output, *, raw_ram: bool) -> Unpacked:
    names = files.names()
    sums, sum_problems = vr._read_sums(files, names)
    if sum_problems:
        raise ReleaseError(sum_problems.text())
    kinds = KINDS | (RAW_RAM_KIND if raw_ram else {})
    found = vr.discover(names, list(sums), kinds)
    targets: dict[str, str] = {}
    for kind, target in found.items():
        if isinstance(target, Check):
            raise ReleaseError(target.detail)
        if target not in sums:
            raise ReleaseError(f"{target}: not listed in SHA256SUMS")
        targets[kind] = target
    with files.open("SHA256SUMS") as raw:
        marker = hashlib.sha256(raw.read(vr.SUMS_CAP + 1)).hexdigest()

    def check(target: str, tee: vr._Tee) -> None:
        if tee.drain() != sums[target]:
            raise ReleaseError(f"{target}: sha256 mismatch")

    run_id = _peek_run_id(files, targets["events"])
    mode = "raw-ram" if raw_ram else "base"
    previous = output.existing(run_id)
    if previous is not None:
        previous_sums, _, previous_mode = previous.partition(" ")
        if previous_sums != marker:
            raise ReleaseError(f"runs/releases/{run_id} holds a different release; remove it first")
        if raw_ram and previous_mode != "raw-ram":
            raise ReleaseError(
                f"runs/releases/{run_id} was unpacked without --raw-ram; remove it and rerun"
            )
        for target in targets.values():
            tee, raw, _ = _stream(files, target)
            with raw:
                check(target, tee)
        return Unpacked(run_id, True)

    output.begin(run_id)
    try:
        refs: dict[int, str] | None = {} if raw_ram else None
        tee, raw, events = _stream(files, targets["events"])
        with raw:

            def write_events(stream: BinaryIO) -> None:
                again, line = _first_line(stream)
                if again != run_id:
                    raise ReleaseError("the event log changed while it was read")
                output.write("events.jsonl", _event_lines(stream, line, refs))

            vr.read_event_source(events, targets["events"], write_events)
            check(targets["events"], tee)
        tee, raw, shots = _stream(files, targets["screenshots"])
        with raw:
            frames = _frames(shots, targets["screenshots"], output)
            check(targets["screenshots"], tee)
        tee, raw, cps = _stream(files, targets["checkpoints"])
        with raw:
            checkpoints = _checkpoints(cps, targets["checkpoints"], output)
            check(targets["checkpoints"], tee)
        snapshots = 0
        if raw_ram:
            tee, raw, ram = _stream(files, targets["raw-RAM log"])
            with raw:
                snapshots = _raw_ram(ram, output, refs or {})
                check(targets["raw-RAM log"], tee)
        output.publish(run_id, f"{marker} {mode}")
    except BaseException:
        output.discard(run_id)
        raise
    return Unpacked(run_id, False, frames, checkpoints, snapshots)


# --- the viewer ---


def viewer_command(
    repo: Path, runs_root: Path, run_id: str, port: int, environ: Mapping[str, str]
) -> tuple[list[str], dict[str, str]]:
    if port == LIVE_VIEWER_PORT:
        raise ReleaseError(f"port {LIVE_VIEWER_PORT} is the live viewer's; pick another")
    if not 1024 <= port <= 65535:
        raise ReleaseError(f"port must be 1024-65535, got {port}")
    argv = [
        "node",
        str(repo / "packages" / "viewer" / "dist" / "cli.js"),
        "--runs",
        str(runs_root),
        "--port",
        str(port),
        run_id,
    ]
    env = {key: value for key, value in environ.items() if key not in STRIPPED_ENV}
    return argv, env


def art_note(runs_root: Path) -> str:
    """The card, party and bag pictures are ROM-derived, so a release cannot ship them."""
    sprites = runs_root / "sprites"
    recipes = ", ".join(
        f"just {recipe} {sprites / folder}"
        for recipe, folder in (
            ("trainer-card-art", "trainer-card-v1"),
            ("trainer-page-art", "trainer-page-v1"),
            ("party-art", "party-v1"),
            ("bag-art", "bag-v1"),
        )
    )
    return (
        "art: the trainer card, party and bag pictures come from your own ROM plus a pokeemerald "
        f"checkout ($POKEEMERALD); until you build them the viewer shows placeholders: {recipes}"
    )


class Fs(Protocol):
    """The few disk operations DiskOutput needs."""

    def entry(self, path: Path) -> str: ...  # "missing", "dir", "link" or "file"

    def read_text(self, path: Path) -> str: ...

    def make_unique_dir(self, parent: Path, prefix: str) -> Path: ...

    def write_new(self, path: Path, chunks: Iterable[bytes]) -> None: ...

    def append(self, path: Path, data: bytes) -> None: ...

    def rename_new(self, source: Path, target: Path) -> None: ...  # fails if target exists

    def remove_tree(self, path: Path) -> None: ...


class DiskOutput:
    """One invocation's run folder: its own uniquely named staging folder, renamed into place.

    Two invocations never share staging, never delete each other's, and the second to finish
    finds the published folder and fails rather than replacing it.
    """

    def __init__(self, root: Path, fs: "Fs | None" = None) -> None:
        self.root = root
        self.fs: Fs = fs if fs is not None else RealFs()
        self._staging: Path | None = None
        self._run_id: str | None = None

    def existing(self, run_id: str) -> str | None:
        final = self.root / run_id
        kind = self.fs.entry(final)
        if kind == "missing":
            return None
        if kind != "dir" or self.fs.entry(final / MARKER_FILE) != "file":
            raise ReleaseError(f"{final} exists but is not a finished unpack; remove it first")
        return self.fs.read_text(final / MARKER_FILE).strip()

    def begin(self, run_id: str) -> None:
        self._staging = self.fs.make_unique_dir(self.root, f".{run_id}.")
        self._run_id = run_id

    def _path(self, rel: str) -> Path:
        assert self._staging is not None and self._run_id is not None
        return self._staging / self._run_id / rel

    def write(self, rel: str, chunks: Iterable[bytes]) -> None:
        self.fs.write_new(self._path(rel), chunks)

    def append(self, rel: str, data: bytes) -> None:
        self.fs.append(self._path(rel), data)

    def publish(self, run_id: str, marker: str) -> None:
        assert self._staging is not None
        self.fs.write_new(self._staging / MARKER_FILE, [marker.encode() + b"\n"])
        try:
            self.fs.rename_new(self._staging, self.root / run_id)
        except FileExistsError:
            raise ReleaseError(
                f"another view-release of {run_id} finished first; run again to reuse it"
            ) from None
        self._staging = None

    def discard(self, run_id: str) -> None:
        if self._staging is not None:
            self.fs.remove_tree(self._staging)
            self._staging = None


# The thin disk and process entrypoints; everything above is tested in memory.
class RealFs:  # pragma: no cover
    def entry(self, path: Path) -> str:
        if path.is_symlink():
            return "link"
        if path.is_dir():
            return "dir"
        return "file" if path.exists() else "missing"

    def read_text(self, path: Path) -> str:
        return path.read_text()

    def make_unique_dir(self, parent: Path, prefix: str) -> Path:
        parent.mkdir(parents=True, exist_ok=True)
        return Path(tempfile.mkdtemp(prefix=prefix, suffix=".partial", dir=parent))

    def write_new(self, path: Path, chunks: Iterable[bytes]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "xb") as file:
            for chunk in chunks:
                file.write(chunk)

    def append(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "ab") as file:
            file.write(data)

    def rename_new(self, source: Path, target: Path) -> None:
        # mkdir claims the name atomically; rename onto that empty directory is then ours alone.
        target.mkdir()
        os.rename(source, target)

    def remove_tree(self, path: Path) -> None:
        shutil.rmtree(path, ignore_errors=True)


def _free_port() -> int:  # pragma: no cover
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _exec_viewer(argv: list[str], env: dict[str, str]) -> None:  # pragma: no cover
    sys.stdout.flush()
    os.execvpe(argv[0], argv, env)  # noqa: S606 - argv list; replaces this process with the viewer


def main(
    argv: Sequence[str],
    environ: Mapping[str, str],
    *,
    repo: Path = REPO,
    open_release: Callable[[Path], ReleaseFiles] = vr.FolderRelease,
    output_for: Callable[[Path], Output] = DiskOutput,
    free_port: Callable[[], int] = _free_port,
    exec_viewer: Callable[[list[str], dict[str, str]], None] = _exec_viewer,
    out: TextIO = sys.stdout,
) -> int:
    args = list(argv)
    usage = "usage: just view-release <release folder> [--raw-ram] [--port N]"
    raw_ram = "--raw-ram" in args
    if raw_ram:
        args.remove("--raw-ram")
    port: int | None = None
    if "--port" in args:
        at = args.index("--port")
        value = args[at + 1] if at + 1 < len(args) else ""
        if not value.isdigit():
            print(usage, file=out)
            return 2
        port = int(value)
        del args[at : at + 2]
    if len(args) != 1:
        print(usage, file=out)
        return 2
    try:
        release = open_release(Path(args[0]))
    except OSError as error:
        print(f"FAIL release folder: {error}", file=out)
        return 1
    releases = repo / "runs" / "releases"
    try:
        result = unpack(release, output_for(releases), raw_ram=raw_ram)
        runs_root = releases / result.run_id
        chosen = port if port is not None else free_port()
        command, env = viewer_command(repo, runs_root, result.run_id, chosen, environ)
    except Exception as error:  # noqa: BLE001 - every failure is reported, nothing half-published
        print(f"FAIL unpack: {vr._failure(error)}", file=out)
        return 1
    what = (
        "reused"
        if result.reused
        else (
            f"unpacked ({result.frames:,} frames, {result.checkpoints:,} checkpoint files"
            + (f", {result.snapshots:,} raw-RAM snapshots" if raw_ram else "")
            + ")"
        )
    )
    print(f"{what}: {runs_root / result.run_id}", file=out)
    print(f"viewer: http://127.0.0.1:{chosen}/#run={result.run_id} (Ctrl-C to stop)", file=out)
    print(art_note(runs_root), file=out)
    exec_viewer(command, env)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:], os.environ))
