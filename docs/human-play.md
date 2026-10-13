# Human Play

Start an isolated recorded human server:

```sh
just run-human
```

Open the printed `/play#run=…` link on the usual viewer (port 8791). If needed, start the built viewer separately with `node packages/viewer/dist/cli.js --port 8791 --runs runs`. Human Play is separate from the model inspection screen. Game speed and sound playback are fixed at 1×, including dialogue.

Click the game screen to enable controls and sound. Browser audio needs that first click. The screen shows when controls are active. Splits stay beside the game on desktop; the existing timeline below it stays visible and shows presses and milestones. Narrow windows place splits below the game. Use the sound button to turn sound off/on.

| Key | Game button |
| --- | --- |
| W / A / S / D | Up / Left / Down / Right |
| Z / X | Select / Start |
| O / P | A / B |
| 1 / 2 | L / R |

Holds and combinations work. Leaving the game surface releases controls and mutes sound. The server also releases controls if the connection stops sending heartbeats. Click the game again to acquire a fresh control session. Pause freezes the emulator and excludes the pause from active wall-time splits; the cartridge clock still follows host time. Resume, then click the game to restore controls and sound. Finish preserves the recording and its terminal outcome. There are no viewer keyboard shortcuts.

Recordings are in `runs/human/<run-id>/events.jsonl` and `frames/`. Inspect recording opens the existing viewer, including replay after the game server has stopped. Human input intervals store actual applied frame bounds and Unix timestamps. Sampled milestone frame counts are upper bounds on when the game transition occurred; they are not exact transition frames.

A finished valid human run from the same starting state is explicitly selectable as a baseline in the inspection viewer. Human references stay out of automatic model-best selection, model feature history and aggregate model results. Historical model runs without recorded ROM identity are labeled “ROM unverified” when compared with a human reference. Pauses are excluded from wall-time splits; emulated time is derived from recorded frame counts at 59.7275 frames/second. Startup and ordinary idle time remain in the recording. One the operator playthrough is an individual baseline, not a human population estimate.

The human server has its own port, input credential, physical frame-storage root (`runs/human/`), run directory and human lease. Both roots are visible in the viewer; a model recorder, including an already-running older cohort, cannot scan or evict nested human frames. It may run beside a model cohort on another server, without making inference calls. Human frame cleanup protects active model recordings; reaching the storage cap stops recording rather than evicting active evidence.

For operator validation, `POKEBENCH_HUMAN_VALIDATION=true just run-human` tags the recording as a probe so it cannot become a benchmark reference. `POKEBENCH_HUMAN_START_PAUSED=true just run-human` starts paused after launch; resume when ready. Server/run roots can be selected through `POKEBENCH_HUMAN_PORT` and `POKEBENCH_RUNS_ROOT` for an isolated preview.

## Current isolated preview

While the existing model cohort remains active, the reviewed human code is served from `/Users/user/.codex/worktrees/human-playthrough/pokebench` on viewer port8798 and human game port8040. The preview viewer reads the usual `/Users/user/dev/pokebench/runs` catalog, including its separate `human/` recordings. Existing model viewers and canonical source/builds are preserved. Use the supplied ready Play link on8798; the printed8791 link is the usual default for after integration. The ready run starts paused so waiting is excluded. Press Resume, click the game, wait for Controls active, then play; first game click enables sound at1×.

The branch is `codex/human-playthrough`. Source integration is pending while changing canonical source/builds could invalidate later trials in the active cohort. This is a ready isolated runtime, not a claim of canonical landing or a completed the operator baseline.

To start another session on the current isolated preview, run:

```sh
cd /Users/user/.codex/worktrees/human-playthrough/pokebench
POKEBENCH_RUNS_ROOT=/Users/user/dev/pokebench/runs POKEBENCH_HUMAN_START_PAUSED=true just run-human
```

Use port8798 for the printed Play path during this isolated preview. Finishing stops that session; starting a new session creates a new recording.

## RAM and game-state recording

The recorder continuously captures parsed RAM-derived state alongside screenshots and emulator frame numbers during active play, including idle time without button presses. Each snapshot uses the same coherent memory/screenshot reader as agent runs. Saved state includes screen and active UI, naming, map/location/position/facing, field-control lock, battle status, party species/level/HP, money, badges, play time and native story flags. Fields that the game has not initialized remain unavailable. Native milestones cite the saved state sequence and sampled frame; their frame is an upper bound on the transition, not an exact transition frame.

This is sampled decoded state, not a full raw-RAM dump or a state snapshot on every emulator frame. The sampler waits100ms between completed observations; processing/storage add time. Existing native human checks observed median intervals176–198ms (about5–6 samples per second). Applied input intervals retain actual frame counts independently. Confirmed Pause freezes the game; Resume restores sampling, and Finish captures/drains the final frozen sample before shutdown.

Malformed state, missing required story state, transport failures or recording failures stop the recording with a crash outcome instead of silently substituting plausible state. State, sample, input, milestone and terminal records are kept in `events.jsonl`; screenshots stay in `frames/` for replay and later analysis.

## Human screenshot cadence

New human runs save screenshots on a500ms schedule (target two per second), declared as `controller.screenshot_ms:500`. RAM/state/input-journal polling retains its existing100ms wait plus processing time, so state/milestone analysis does not depend on the reduced screenshot schedule. The first screenshot and final frozen Finish screenshot are always saved. A delayed poll skips missed screenshot intervals instead of writing a catch-up burst. Existing human recordings and agent screenshot behavior remain unchanged. The Play screen's live display is independent of durable screenshot sampling.
