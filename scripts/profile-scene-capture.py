#!/usr/bin/env python3
"""CPU-only scene-recorder profile on fixed native checkpoints; no inference/network.

PYTHONPATH=env env/.venv/bin/python scripts/profile-scene-capture.py --rom EXTERNAL_ROM \
  --checkpoint battle=SAVE.state --out runs/scene-profile --frames 600 --repeats 3
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import statistics
import tempfile
import time
from pathlib import Path

from pokebench_env.memory_reader import (
    SnapshotMemoryReader,
    copy_native_region,
    read_canonical_ram,
)
from pokebench_env.raw_ram import REGIONS, copy_raw_snapshot
from pokebench_env.scene_journal import SceneJournal


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rom", type=Path, required=True)
    parser.add_argument(
        "--checkpoint", action="append", required=True, help="label=path"
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--frames", type=int, default=600)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--extra-visuals", action="store_true")
    args = parser.parse_args()
    if not 120 <= args.frames <= 3600 or not 1 <= args.repeats <= 5:
        parser.error("bounded profile: frames120..3600/repeats1..5")
    cases = {}
    for item in args.checkpoint:
        label, separator, path = item.partition("=")
        if not separator or not label or label in cases:
            parser.error("checkpoint needs a distinct label=path")
        cases[label] = Path(path).resolve()
    args.out.mkdir(parents=True, exist_ok=False)
    import mgba.core
    import mgba.image
    import mgba.log
    from mgba._pylib import lib

    mgba.log.silence()
    rom_sha1 = hashlib.sha1(args.rom.read_bytes()).hexdigest()
    core = mgba.core.load_path(str(args.rom.resolve()))
    video = mgba.image.Image(240, 160)
    core.set_video_buffer(video)
    core.reset()
    reader = SnapshotMemoryReader(
        lambda: core,
        fast_read=lambda a, n: read_canonical_ram(core, a, n),
        raw_read=lambda a, n: copy_native_region(core, a, n),
    )
    results = []

    def png() -> str:
        buffer = io.BytesIO()
        video.to_pil().convert("RGB").save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode()

    for label, path in cases.items():
        state = path.read_bytes()
        fingerprints = set()
        for repeat in range(args.repeats):
            modes = ["off", "legacy", "safe", "safe-persist"]
            if args.extra_visuals:
                modes += ["png120", "png1"]
            modes = modes[repeat:] + modes[:repeat]
            for mode in modes:
                core._core.rtc.override, core._core.rtc.value = (
                    lib.RTC_FIXED,
                    1792970000000,
                )
                if not core.load_raw_state(state):
                    raise ValueError(f"checkpoint rejected: {label}")
                core._core.rtc.override, core._core.rtc.value = (
                    lib.RTC_FIXED,
                    1792970000000,
                )
                core.set_keys(raw=0)
                for _ in range(30):
                    core.run_frame()
                journal = SceneJournal(
                    safe_capture=mode.startswith("safe"),
                    raw_capture=lambda frame: copy_raw_snapshot(
                        reader, int(core.frame_counter), rom_sha1, frame
                    ),
                )
                frame_times, hook_times, export_times = [], [], []
                with tempfile.TemporaryDirectory(prefix="scene-profile-") as temporary:
                    directory = Path(temporary)
                    for frame in range(args.frames):
                        start = time.perf_counter_ns()
                        core.run_frame()
                        stepped = time.perf_counter_ns()
                        if mode != "off":
                            journal.advance(reader, png)
                        if mode == "png1" or (mode == "png120" and frame % 120 == 0):
                            png()
                        finished = time.perf_counter_ns()
                        frame_times.append(stepped - start)
                        hook_times.append(finished - stepped)
                        if mode == "safe-persist" and (frame + 1) % 120 == 0:
                            before = time.perf_counter_ns()
                            journal.persist_diagnostics(directory)
                            export_times.append(time.perf_counter_ns() - before)
                    fingerprint = hashlib.sha256(
                        b"".join(copy_native_region(core, a, n) for _, a, n in REGIONS)
                    ).hexdigest()
                    fingerprints.add(fingerprint)
                    entry = {
                        "case": label,
                        "repeat": repeat,
                        "mode": mode,
                        "frames": args.frames,
                        "frame_ns": frame_times,
                        "hook_ns": hook_times,
                        "export_ns": export_times,
                        "total_ns": sum(frame_times)
                        + sum(hook_times)
                        + sum(export_times),
                        "final_writable_memory_sha256": fingerprint,
                        "journal": journal.snapshot(0),
                        "diagnostic_disk_bytes": sum(
                            p.stat().st_size
                            for p in directory.rglob("*")
                            if p.is_file()
                        ),
                        "diagnostic_windows": len(list(directory.glob("window-*"))),
                    }
                    # Visual image bytes remain in the journal; metrics output is kept compact.
                    for event in entry["journal"]["entries"]:
                        if "image" in event:
                            event["image_bytes"] = len(
                                base64.b64decode(event.pop("image"))
                            )
                    results.append(entry)
                print(
                    label,
                    repeat,
                    mode,
                    "median_hook_us",
                    round(statistics.median(hook_times) / 1000, 2),
                    flush=True,
                )
        if len(fingerprints) != 1:
            raise ValueError(f"recording changed native writable state: {label}")
    report = {
        "source_sha256": {
            str(path.relative_to(Path(__file__).resolve().parents[1])): hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
            for path in (
                Path(__file__).resolve(),
                Path(__file__).resolve().parents[1]
                / "env/pokebench_env/scene_journal.py",
                Path(__file__).resolve().parents[1] / "env/pokebench_env/raw_ram.py",
            )
        },
        "rom_sha1": rom_sha1,
        "native_reference": "pret/pokeemerald731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 src/main.c AgbMain/WaitForVBlank",
        "checkpoint_sha256": {
            k: hashlib.sha256(p.read_bytes()).hexdigest() for k, p in cases.items()
        },
        "method": "One headless native core; no inputs; fixed cartridge clock;30 warmup frames; order-balanced repeated arms. Native-core microbenchmark, not a full-server latency SLO.",
        "results": results,
    }
    (args.out / "profile.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
