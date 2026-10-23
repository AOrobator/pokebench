#!/usr/bin/env python3
"""Replay recorded inputs on CPU only; never import a gateway/client or write source recordings.

Usage: PYTHONPATH=env env/.venv/bin/python scripts/qualify-roxanne-checkpoint.py
       --run <recorded-run-dir> --turn <decision> --rom <external-rom> --out <new-dir>
"""
import argparse
import gzip
import hashlib
import json
import os
import time
from pathlib import Path

from pokebench_env.campaign_checkpoint import RecordedClock, check_replay_regions, native_schedule
from pokebench_env.memory_reader import copy_native_region
from pokebench_env.raw_ram import load_raw_ram


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--turn", type=int, required=True)
    parser.add_argument("--rom", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--initial-state", type=Path)
    args = parser.parse_args()
    run, out = args.run.resolve(), args.out.resolve()
    if out == run or run in out.parents:
        raise ValueError("qualification output must be separate from source recording")
    out.mkdir(parents=True, exist_ok=False)
    prefix = []
    with (run / "events.jsonl").open() as source:
        for line in source:
            event = json.loads(line)
            if event["type"] == "turn_start" and event["turn"] == args.turn:
                break
            prefix.append(event)
        else:
            raise ValueError("decision turn absent")
    start = prefix[0]
    state = next(e for e in reversed(prefix) if e["type"] == "state" and "raw_ram" in e)
    raw_ref = state["raw_ram"]
    rom = args.rom.read_bytes()
    if hashlib.sha1(rom, usedforsecurity=False).hexdigest() != start["rom_sha1"]:
        raise ValueError("external ROM does not match source")
    raw = load_raw_ram(run / raw_ref["path"], raw_ref["sha256"], rom=rom)
    meta = raw.metadata
    initial = (args.initial_state or Path(start["start_state"]["path"])).resolve()
    initial_bytes = initial.read_bytes()
    if start["start_state"]["kind"] != "save_state" or hashlib.sha1(initial_bytes, usedforsecurity=False).hexdigest() != start["start_state"]["sha1"]:
        raise ValueError("source initial save unavailable or digest mismatch")
    import mgba.core
    import mgba.image
    import mgba.log
    from mgba._pylib import lib

    mgba.log.silence()
    core = mgba.core.load_path(str(args.rom.resolve()))
    video = mgba.image.Image(240, 160)
    core.set_video_buffer(video)
    core.reset()
    if not core.load_raw_state(initial_bytes):
        raise ValueError("native initial state rejected")
    inputs = [e for e in prefix if e["type"] == "native_action" and e["kind"] == "native_input"]
    schedule = native_schedule([{"frame": e["frame"], "buttons": e["details"]["buttons"]} for e in inputs], loaded_frame=core.frame_counter)
    offset = core.frame_counter + 1
    # Archive timestamps, unlike inference timestamps, bind directly to native frames.
    samples = {offset + e["frame"]: e["server_timestamp"] * 1000 for e in inputs}
    check_states = {}
    last = None
    for event in prefix:
        if event["type"] == "state" and "raw_ram" in event:
            last = event
        if event["type"] == "turn_start" and last is not None:
            check_states[last["raw_ram"]["frame"]] = last
    check_states[raw_ref["frame"]] = state
    for observation in check_states.values():
        ref = observation["raw_ram"]
        encoded = (run / ref["path"]).read_bytes()
        if hashlib.sha256(encoded).hexdigest() != ref["sha256"]:
            raise ValueError("clock anchor archive digest mismatch")
        with gzip.open(run / ref["path"], "rt") as archive:
            header = archive.read(4096)
        before = header.split('"regions":', 1)[0].rstrip().rstrip(",")
        header_meta = json.loads(before + "}")
        samples[ref["frame"]] = header_meta["timestamp_ns"] / 1_000_000
    clock = sorted(samples.items())
    recorded_clock = RecordedClock([{"frame": f, "unix_ms": t} for f, t in clock])
    core._core.rtc.override = lib.RTC_FIXED
    target = meta["frame"]
    keys = 0
    predecessor = None
    checked = 0
    first_mismatch = None
    started = time.monotonic()
    corrections = []
    def advance_to(stop, delta_ms=0):
        nonlocal keys, predecessor
        while core.frame_counter < stop:
            frame = core.frame_counter + 1
            buttons = schedule.get(frame)
            if buttons is not None:
                keys = sum(1 << getattr(core, "KEY_" + button) for button in buttons)
            now_ms = recorded_clock.at(frame) + delta_ms
            core._core.rtc.value = now_ms
            if frame == target:
                if keys:
                    raise ValueError("normal checkpoint loader cannot replay a held final input")
                predecessor = bytes(core.save_raw_state())
            core.set_keys(raw=keys)
            core.run_frame()
            core.set_keys(raw=0)
    last_good = bytes(core.save_raw_state())
    last_good_frame = core.frame_counter
    last_good_keys = keys
    for frame in sorted(check_states):
        if frame < core.frame_counter:
            raise ValueError("recorded decision precedes initial checkpoint")
        st = check_states[frame]
        archived = load_raw_ram(run / st["raw_ram"]["path"], st["raw_ram"]["sha256"], rom=rom)
        expected_ewram = archived(0x02000000, 0x40000)
        advance_to(frame)
        checked += 1
        if copy_native_region(core, 0x02000000, 0x40000) != expected_ewram:
            # Timestamp sampling can straddle a wall-clock second. Disambiguate only
            # that external RTC input, never game RAM or recorded button choices.
            repaired = False
            for delta in (-1000, 1000):
                if not core.load_raw_state(last_good):
                    raise ValueError("native replay branch checkpoint rejected")
                keys = last_good_keys
                advance_to(frame, delta)
                if copy_native_region(core, 0x02000000, 0x40000) == expected_ewram:
                    corrections.append({"fromFrame": last_good_frame, "toFrame": frame, "rtcDeltaMs": delta})
                    repaired = True
                    break
            if not repaired:
                first_mismatch = {"frame": frame, "stateSeq": st["seq"]}
                break
        last_good = bytes(core.save_raw_state())
        last_good_frame, last_good_keys = frame, keys
    layout = [("ewram", 0x02000000, 0x40000), ("iwram", 0x03000000, 0x8000), ("io", 0x04000000, 0x400), ("palette", 0x05000000, 0x400), ("vram", 0x06000000, 0x18000), ("oam", 0x07000000, 0x400), ("flash", 0x0E000000, 0x20000)]
    # ArchivedMemoryReader.raw_region includes unbanked Flash and raw I/O.
    expected = {name: raw(address, size) for name, address, size in layout}
    actual = {name: copy_native_region(core, address, size) for name, address, size in layout}
    matches = check_replay_regions(expected, actual)
    registers = [int(core.cpu.gprs[i]) for i in range(16)] == meta["gprs"] and int(core.cpu.cpsr.packed) == meta["cpsr"]
    restored = False
    if predecessor is not None and all(matches.values()) and registers and first_mismatch is None:
        if not core.load_raw_state(predecessor):
            raise ValueError("native predecessor state rejected on reload")
        core.set_keys(raw=0)
        core.run_frame()  # the pinned vendor loader's one-frame step
        restored = core.frame_counter == target and all(copy_native_region(core, address, size) == expected[name] for name, address, size in layout)
        restored = restored and [int(core.cpu.gprs[i]) for i in range(16)] == meta["gprs"] and int(core.cpu.cpsr.packed) == meta["cpsr"]
    ready = state["screen"] == "overworld" and not state["in_battle"] and state.get("running", {}).get("controllable") is True
    inside = state["map_id"] == [11, 3]
    passed = restored and ready and inside
    receipt = {"passed": passed, "frame": target, "ewram": hashlib.sha256(expected["ewram"]).hexdigest(), "iwram": hashlib.sha256(expected["iwram"]).hexdigest(), "registers": registers, "restored": restored, "inputReady": ready, "insideGym": inside}
    report = {"version": 1, "mode": "offline-cpu-native-replay", "gpuCalls": 0, "sourceRun": run.name, "sourceCommit": start["harness"]["commit"], "turn": args.turn, "stateSeq": state["seq"], "rawRef": raw_ref, "receipt": receipt, "regionMatches": matches, "checkedDecisionFrames": checked, "firstMismatch": first_mismatch, "cpuSeconds": time.monotonic() - started, "rtcUnixMs": int(core._core.rtc.value), "timezone": os.environ.get("TZ", "host-local"), "romSha1": start["rom_sha1"], "initialStateSha1": start["start_state"]["sha1"], "journalOffset": offset, "clockCorrections": corrections, "clockInputReconstruction": "recorded timestamps, bounded +/-1 second RTC-only disambiguation"}
    if passed:
        (out / "checkpoint.state").write_bytes(predecessor)
        report["stateSha256"] = hashlib.sha256(predecessor).hexdigest()
        # Exact recorded state remains separate from newly decoded replay proof.
        (out / "source-state.json").write_text(json.dumps(state))
        (out / "events-prefix.jsonl").write_text("".join(json.dumps(e, separators=(",", ":")) + "\n" for e in prefix))
        video.to_pil().convert("RGB").save(out / "restored.png")
    (out / "qualification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"sourceRun": run.name, "turn": args.turn, "passed": passed, "regions": matches, "restored": restored, "firstMismatch": first_mismatch, "cpuSeconds": report["cpuSeconds"]}), flush=True)


if __name__ == "__main__":
    main()
