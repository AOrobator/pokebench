# Findings: the vendored continual-harness game server

Behavior of `env/vendor/continual-harness` (pinned at `bbab97a`) that affects PokeBench. The vendor tree stays unmodified (INV-3). Every workaround is PokeBench-owned code that wraps the vendor at runtime and is covered by tests.

## F1. `PLAYER_NAME_SET` fires during the first 12 frames of boot (false positive)

**Status:** root cause confirmed 2026-10-11. The fix is planned in M4.

**Symptom.** One recorded boot (`run_20261011_174813`) marked `PLAYER_NAME_SET` complete 0.09 s after `GAME_RUNNING`, on the title screen, before any name could have been entered. Five other boots did not.

**Root cause.** Two vendor behaviors combine:

1. `MemoryReader.read_player_name()` (`pokemon_env/memory_reader.py:380`) returns the fallback string `"Player"` when the SaveBlock2 pointer is null (and on any read exception).
2. The milestone condition (`pokemon_env/emulator.py:1347`) treats a name as set unless it is `""`, `"UNKNOWN"` or `"PLAYER"`. The comparison is case-sensitive, so the fallback `"Player"` counts as a real name.

The SaveBlock2 pointer is null for the first 12 frames after power-on. Probe on the real ROM (pinned vendor, in-process, scratch cwd):

```
frame     0: ptr=0x0       name='Player'    PLAYER_NAME_SET=True
frame    12: ptr=0x2024a54 bytes=00…00 name='        ' PLAYER_NAME_SET=False
frame   189: ptr=0x2024a9c bytes=00…00 name='        ' PLAYER_NAME_SET=False
```

**Why it is intermittent.** The server's own milestone loop (`server/app.py:456`, every 5 s) passes a lightweight state with no `name` field, so it never trips the check. The false positive needs a client `/state` or `/milestones` request, which builds the full state through `get_comprehensive_state()`, to land within those first 12 frames (about 0.2 s). It is a race between the first client request and boot.

**Impact.** Milestone splits are the benchmark's timing signal (PB1). A false `PLAYER_NAME_SET` at t≈0 corrupts that split for every model, nondeterministically.

**Verified (2026-10-11 ~21:50 ET, real ROM, in-process, 600 boot frames each):** stock vendor check true on 12 of 600 frames (frames 0–11); with the guard, 0 of 600. Loading the starter kit's `quick_start_save.state` (player `JOHNNY`) still reports the milestone, so the guard does not suppress real names.

**Fix (M4, no vendor edits).** A PokeBench-owned wrapper installed at server start replaces the `PLAYER_NAME_SET` branch of `EmeraldEmulator._check_milestone_condition`. The milestone is set only when the SaveBlock2 pointer is non-null and the name bytes at that pointer decode to a non-blank name. It reads memory directly instead of trusting the fallback string, which also stays correct if the player is literally named "Player". All other milestones pass through to the vendor unchanged. The patch point is verified at install time, so a vendor bump that moves it fails loudly. Tests cover the null pointer, blank bytes, a real name, and passthrough.

## F2. Server state that can cross runs (motivates INV-7)

- Every server writes relative to its working directory: `.pokeagent_cache/<run_id>/`, `run_data/<run_id>/`, `llm_logs/`, `backups/`. Launched from the vendor checkout, all runs share one tree.
- Run ids have one-second resolution (`run_YYYYMMDD_HHMMSS`). Two servers started in the same second share a directory.
- There are root-level fallbacks outside any run directory: `get_cache_directory()` falls back to `.pokeagent_cache/` when no run id is set, and the code also reads `./map_stitcher_data.json` and `.pokeagent_cache/maps`.
- Checkpoint restore is on by default (`LOAD_CHECKPOINT_MODE` unset ⇒ enabled), and cumulative metrics are loaded "regardless of checkpoint mode".

**Correction.** An M2 note attributed the title-screen `PLAYER_NAME_SET` to "restored cached run data". That was wrong: milestones live in per-run cache directories, and the cause is F1.

**Fix (M4, INV-7).** Each run gets its own server process with its working directory under `runs/<id>/`, `RUN_DATA_ID=<run id>` and `LOAD_CHECKPOINT_MODE=false`. Runs are serial (operator 2026-10-11: memory allows one model at a time), but isolation does not rely on that.

## F3. Smaller findings (M2)

- `server.app.main()` hardcodes `uvicorn.run(host="0.0.0.0")`, which exposes emulator control on the LAN. `pokebench_env.serve` pins `127.0.0.1`.
- `POST /action` accepts unknown button names (e.g. `"NOPE"`) and reports success. The PokeBench clients validate against a button enum.
- The ROM path is hardcoded as `Emerald-GBAdvance/rom.gba` relative to cwd. It reaches the server through a symlink (gitignored upstream).
- `EmeraldEmulator.initialize()` copies the ROM into a fresh temp dir on every boot, so mGBA never writes a `.sav` next to the ROM.

## F4. Shutdown race prints `'NoneType' object has no attribute 'clear_keys'`

On SIGTERM, `EmeraldEmulator.stop()` sets `self.core = None` while the headless game-loop thread can still be inside `run_frame_with_buttons`, whose next `self.core.clear_keys(...)` then fails. It is intermittent (2 of 3 smokes on 2026-10-11) and happens only after shutdown has begun, so run data is already finalized. It became visible once the launcher forwarded SIGTERM (before that, the server was orphaned instead of stopped). Impact: log noise only. No workaround planned.
