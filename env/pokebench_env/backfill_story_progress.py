"""Recover measurement fields beside immutable logs, including bounded live prefixes."""

import hashlib
import json
import os
import re
import sys
import tempfile
from dataclasses import replace
from pathlib import Path

from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.story_progress import read_story_progress

SOURCE = "raw-ram-all-gym-story-v1"
ROM_SHA1 = "f3ae088181bf583e55daf962a92bb46f4f1d07b7"


def backfill(run: Path) -> dict[str, object]:
    if run.is_symlink() or (run / "raw-ram").is_symlink():
        raise ValueError("refusing symlinked run or raw RAM")
    derived = run / "derived"
    if derived.is_symlink() or (derived.exists() and not derived.is_dir()):
        raise ValueError("derived must be a plain directory")
    derived.mkdir(exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=derived, prefix=".story-progress.", suffix=".tmp")
    digest = hashlib.sha256()
    count, size, expected = 0, 0, 0
    header: dict[str, object] = {}
    try:
        with os.fdopen(fd, "w") as output, (run / "events.jsonl").open("rb") as log:
            # The footer binds the streamed prefix without buffering or editing the log.
            limit = os.fstat(log.fileno()).st_size
            while log.tell() < limit:
                line = log.readline(limit - log.tell())
                if not line.endswith(b"\n"):
                    break
                event = json.loads(line)
                if event.get("run") != run.name or event.get("seq") != expected:
                    raise ValueError("source run identity/order mismatch")
                if expected == 0 and event.get("type") != "run_start":
                    raise ValueError("no run_start")
                expected += 1
                digest.update(line)
                size += len(line)
                if event.get("type") == "run_start":
                    if expected != 1 or event.get("rom_sha1") != ROM_SHA1:
                        raise ValueError("unsupported source ROM or run_start")
                    if "all-gym-story-milestones-v1" in event.get("harness_features", []):
                        raise ValueError("run records native story progress already")
                if event.get("type") != "state" or not event.get("started"):
                    continue
                ref = event.get("raw_ram")
                if not isinstance(ref, dict):
                    continue
                path, sha = ref.get("path"), ref.get("sha256")
                if not isinstance(path, str) or not re.fullmatch(
                    r"raw-ram/[0-9]{8,}\.json\.gz", path
                ):
                    raise ValueError("invalid archive path")
                if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
                    raise ValueError("invalid archive hash")
                archive = run / path
                if archive.is_symlink():
                    raise ValueError("refusing symlinked archive")
                read = load_raw_ram(archive, sha)
                if (
                    read.metadata.get("rom_sha1") != ROM_SHA1
                    or read.metadata.get("sequence") != ref.get("sequence")
                    or read.metadata.get("frame") != ref.get("frame")
                ):
                    raise ValueError("archive ROM mismatch")
                save1 = int.from_bytes(read(0x03005D8C, 4), "little")
                progress = None
                if event.get("screen") not in ("field_transition", "unknown"):
                    progress = read_story_progress(read, save1, None)
                    if progress is not None:
                        # Key-item ids are unencrypted (items.h ITEM_LETTER).
                        bag = read(save1 + 0x5D8, 30 * 4)
                        progress = replace(
                            progress,
                            letter=any(
                                int.from_bytes(bag[i : i + 2], "little") == 274
                                for i in range(0, len(bag), 4)
                            ),
                        )
                output.write(
                    json.dumps(
                        {
                            "seq": event["seq"],
                            "raw_ram": ref,
                            "story_progress": None if progress is None else progress.json(),
                        }
                    )
                    + "\n"
                )
                count += 1
            if expected == 0:
                raise ValueError("empty source log")
            header = dict(
                v=1,
                run=run.name,
                source=SOURCE,
                rom_sha1=ROM_SHA1,
                through_seq=expected - 1,
                log_bytes=size,
                log_sha256=digest.hexdigest(),
                rows=count,
            )
            output.write(json.dumps(header) + "\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp, derived / "story_progress.jsonl")
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
    return header


def main(argv: list[str]) -> int:
    if len(argv) < 2 or any(
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", x) for x in argv[1:]
    ):
        print("usage: backfill_story_progress RUNS_ROOT RUN_ID...", file=sys.stderr)
        return 2
    status = 0
    for name in argv[1:]:
        try:
            print(json.dumps(backfill(Path(argv[0]) / name)))
        except (OSError, ValueError) as error:
            print(f"{name}: {error}", file=sys.stderr)
            status = 1
    return status


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
