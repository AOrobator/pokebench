#!/usr/bin/env python3
"""Fresh-core, network-free verification of prepared native/history bundles."""
import argparse
import hashlib
import json
from dataclasses import asdict
from pathlib import Path

from pokebench_env.continuation_clock import install_restored_clock
from pokebench_env.game_state import MapNames
from pokebench_env.memory_reader import SnapshotMemoryReader, copy_native_region, read_canonical_ram
from pokebench_env.raw_ram import REGIONS, load_raw_ram
from pokebench_env.readout import SERVER_FEATURES
from pokebench_env.rerender import PORYMAP_MAPS, read_state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--runs", type=Path, required=True)
    parser.add_argument("--rom", type=Path, required=True)
    args = parser.parse_args()
    import mgba.core
    import mgba.image
    import mgba.log
    from mgba._pylib import lib

    mgba.log.silence()
    maps = MapNames.load(PORYMAP_MAPS)
    report = []
    rom = args.rom.read_bytes()
    for path in sorted(args.root.glob("*/bundle.json")):
        directory = path.parent
        bundle = json.loads(path.read_text())
        qualification = json.loads((directory / "qualification.json").read_text())
        source = json.loads((directory / "source-state.json").read_text())
        state_bytes = (directory / "checkpoint.state").read_bytes()
        if hashlib.sha256(state_bytes).hexdigest() != bundle["stateHash"]:
            raise ValueError("checkpoint digest mismatch")
        if hashlib.sha1(rom, usedforsecurity=False).hexdigest() != qualification["romSha1"]:
            raise ValueError("external ROM digest mismatch")
        prefix = (directory / "events-prefix.jsonl").read_bytes()
        if hashlib.sha256(prefix).hexdigest() != bundle["eventsHash"]:
            raise ValueError("history prefix digest mismatch")
        start = json.loads(prefix.splitlines()[0])
        core = mgba.core.load_path(str(args.rom.resolve()))
        video = mgba.image.Image(240, 160)
        core.set_video_buffer(video)
        core.reset()
        class Loader:
            def __init__(self):
                self.core = core
            def load_state(self, path=None, state_bytes=None):
                if not self.core.load_raw_state(state_bytes):
                    raise ValueError("native checkpoint rejected")
                self.core.set_keys(raw=0)
                self.core.run_frame()  # exactly the pinned vendor loader contract
        install_restored_clock(Loader, int(bundle["rtcUnixMs"]), fixed_mode=lib.RTC_FIXED, wall_offset_mode=lib.RTC_WALLCLOCK_OFFSET)
        Loader().load_state(state_bytes=state_bytes)
        ref = qualification["rawRef"]
        raw = load_raw_ram(args.runs / bundle["sourceRun"] / ref["path"], ref["sha256"], rom=rom)
        region_matches = {name: copy_native_region(core, address, size) == raw(address, size) for name, address, size in REGIONS}
        registers = [int(core.cpu.gprs[i]) for i in range(16)] == raw.metadata["gprs"] and int(core.cpu.cpsr.packed) == raw.metadata["cpsr"]
        reader = SnapshotMemoryReader(lambda: core, fast_read=lambda a, n: read_canonical_ram(core, a, n))
        off = frozenset(set(SERVER_FEATURES) - set(start["harness_features"]))
        decoded = read_state(reader, maps, active_ui=True, off=off)
        party = [asdict(p) for p in decoded.party or ()]
        keys = ["identity", "species_id", "level", "hp", "max_hp"]
        party_matches = len(party) == len(source["party"]) and all(
            all(now.get(key) == before.get(key) for key in keys)
            and [m["move_id"] for m in now["moves"]] == [m["move_id"] for m in before["moves"]]
            for now, before in zip(party, source["party"], strict=True)
        )
        fields = decoded.screen == source["screen"] and list(decoded.map_id or ()) == source["map_id"] and list(decoded.position or ()) == [source["position"]["x"], source["position"]["y"]]
        passed = all(region_matches.values()) and registers and party_matches and fields
        item = {"case": directory.name, "sourceRun": bundle["sourceRun"], "passed": passed, "regions": region_matches, "cpuRegisters": registers, "productionPartyDecode": party_matches, "productionLocationDecode": fields, "frame": core.frame_counter, "gpuCalls": 0, "productionClockAdapter": core._core.rtc.override == lib.RTC_WALLCLOCK_OFFSET}
        (directory / "fresh-restore.json").write_text(json.dumps(item, indent=2) + "\n")
        video.to_pil().convert("RGB").save(directory / "fresh-restored.png")
        report.append(item)
    (args.root / "fresh-restores.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)
    if not report or not all(item["passed"] for item in report):
        raise ValueError("one or more fresh native restores failed")


if __name__ == "__main__":
    main()
