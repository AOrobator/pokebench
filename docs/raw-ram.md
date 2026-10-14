# Raw RAM recording

Every newly launched human and agent server archives full writable GBA memory before each shared observation or state poll. Files live beside events/frames in `raw-ram/`, outside screenshot eviction. This is sampling on each actual poll, not 60 snapshots per second. Human decoded-state polling and 2Hz screenshot cadence remain unchanged.

Each version1 gzip JSON archive contains complete EWRAM (256KiB), IWRAM (32KiB), I/O (1KiB), palette (1KiB), VRAM (96KiB), OAM (1KiB), full cartridge Flash (128KiB, both banks), 16 CPU registers/CPSR, native emulator frame, Unix nanosecond capture time and ROM SHA1. Native direct memory blocks avoid hundreds of thousands of per-byte emulator calls; I/O preserves mGBA’s full raw register backing array, without bus reads or unused-register side effects. ROM/BIOS are immutable external dependencies, not copied into archives. Flash is saved as its full unbanked native block; its 128KiB payload is not a claim that the CPU has a 128KiB address window.

`index.jsonl` commits each compressed file path, size and SHA256 after the exclusive file is flushed. Regions have independent hashes. Decoded state/tool/event records also retain a typed `raw_ram` reference (run-relative path, sequence, native frame and SHA256), so analysis can join the exact raw capture to replay events. Declared raw recording without a reference fails the recorder.

`observations.jsonl` pairs each successful decoded state and screenshot SHA256 with its raw receipt. Decoder or screenshot failure can leave an indexed raw archive without a successful observation; retain it. Disk/capture failures propagate rather than silently continuing decoded-only recording. Original run directories must not be reused.

Offline use from `env/`:

```python
from pathlib import Path
from pokebench_env.raw_ram import load_raw_ram
from pokebench_env.game_state import read_game_state, MapNames

reader = load_raw_ram(Path("/absolute/run/raw-ram/00000000.json.gz"),
                      expected_sha256="receipt hash",
                      rom=Path("/absolute/external/emerald.gba").read_bytes())
state = read_game_state(reader, MapNames.load(Path("vendor/continual-harness/pokemon_env/porymap/data/maps")), active_ui_enabled=True)
```

The loader validates region sizes, hashes, registers, bounded decompression and supplied ROM identity. Unsupported addresses fail explicitly. These observations support future parsing fixes; final native emulator checkpoints remain separate restorable state. Archive compression and disk use depend on game contents; there is no silent retention cap or eviction.
