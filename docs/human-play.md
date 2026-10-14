# Human Play

Start an isolated recorded human server:

```sh
just run-human
```

Open the printed `/play#run=…` link on the usual viewer (port 8791). If needed, start the built viewer separately with `node packages/viewer/dist/cli.js --port 8791 --runs runs`. Human Play is separate from the model inspection screen. Game speed and sound playback are fixed at 1×, including dialogue.

Press Start run to resume the game, enable keyboard controls, and unlock sound in one click. The screen shows when controls are active. Splits stay beside the game on desktop; the existing timeline below it stays visible and shows presses and milestones. Narrow windows stack the game, timeline, then splits. Use the sound button to turn sound off/on.

| Key | Game button |
| --- | --- |
| W / A / S / D | Up / Left / Down / Right |
| Z / X | Select / Start |
| O / P | A / B |
| 1 / 2 | L / R |

Holds and combinations work. Leaving the game surface releases controls and mutes sound. The server also releases controls if the connection stops sending heartbeats. Click the game again to acquire a fresh control session. Pause freezes the emulator and excludes the pause from active wall-time splits; the cartridge clock still follows host time. Start run restores controls and sound after a pause. Finish preserves the recording and its terminal outcome. There are no viewer keyboard shortcuts.

Start over is available during play, while paused, and after Finish. It finishes and saves the current recording, waits for the old game to shut down, then opens a fresh game under a new run ID. The new game starts paused: press Start run to play with controls and sound. Previous recordings, timeline and splits remain available through Inspect recording. Repeated clicks follow the same restart; a startup error stays visible and can be retried. Validation probes remain probes after restarting.

Recordings are in `runs/human/<run-id>/events.jsonl` and `frames/`. Inspect recording opens the existing viewer, including replay after the game server has stopped. Human input intervals store actual applied frame bounds and Unix timestamps. Sampled milestone frame counts are upper bounds on when the game transition occurred; they are not exact transition frames.

A finished valid human run from the same starting state is explicitly selectable as a baseline in the inspection viewer. Human references stay out of automatic model-best selection, model feature history and aggregate model results. Historical model runs without recorded ROM identity are labeled “ROM unverified” when compared with a human reference. Pauses are excluded from wall-time splits; emulated time is derived from recorded frame counts at 59.7275 frames/second. Startup and ordinary idle time remain in the recording. One the operator playthrough is an individual baseline, not a human population estimate.

The human server has its own port, input credential, physical frame-storage root (`runs/human/`), run directory and human lease. Both roots are visible in the viewer; a model recorder, including an already-running older cohort, cannot scan or evict nested human frames. It may run beside a model cohort on another server, without making inference calls. Human frame cleanup protects active model recordings; reaching the storage cap stops recording rather than evicting active evidence.

For operator validation, `POKEBENCH_HUMAN_VALIDATION=true just run-human` tags the recording as a probe so it cannot become a benchmark reference. `POKEBENCH_HUMAN_START_PAUSED=true just run-human` starts paused after launch; resume when ready. Server/run roots can be selected through `POKEBENCH_HUMAN_PORT` and `POKEBENCH_RUNS_ROOT` for an isolated preview.

## Current isolated preview

While the existing model cohort remains active, the human code is served from the integrated checkout `/tmp/pokebench-human-landing` on viewer port8799 and human game port8040. The preview viewer reads the usual `/Users/user/dev/pokebench/runs` catalog, including its separate `human/` recordings. Existing model viewers and canonical source/builds are preserved. Use the supplied ready Play link on8799; the printed8791 link is the usual default for after integration. The ready run starts paused so waiting is excluded. Press Start run and play; that click enables controls and sound at1×. Start over saves this recording and opens a fresh paused game.

Human Play source is integrated into `main`. The human preview uses the combined build while existing model runtime builds remain pinned for the active cohort. The operator’s completed baseline still requires his playthrough.

To start another session on the current isolated preview, run:

```sh
cd /Users/user/.codex/worktrees/human-playthrough/pokebench
POKEBENCH_RUNS_ROOT=/Users/user/dev/pokebench/runs POKEBENCH_HUMAN_START_PAUSED=true just run-human
```

Use port8799 for the printed Play path during this isolated preview. The in-screen Start over button also creates a new recording after finishing the old session.

## RAM and game-state recording

The recorder continuously captures parsed RAM-derived state alongside screenshots and emulator frame numbers during active play, including idle time without button presses. Each snapshot uses the same coherent memory/screenshot reader as agent runs. Saved state includes screen and active UI, naming, map/location/position/facing, field-control lock, battle status, party species/level/HP, money, badges, play time and native story flags. Fields that the game has not initialized remain unavailable. Native milestones cite the saved state sequence and sampled frame; their frame is an upper bound on the transition, not an exact transition frame.

This is sampled decoded state, not a full raw-RAM dump or a state snapshot on every emulator frame. The sampler waits100ms between completed observations; processing/storage add time. Existing native human checks observed median intervals176–198ms (about5–6 samples per second). Applied input intervals retain actual frame counts independently. Confirmed Pause freezes the game; Resume restores sampling, and Finish captures/drains the final frozen sample before shutdown.

Malformed state, missing required story state, transport failures or recording failures stop the recording with a crash outcome instead of silently substituting plausible state. State, sample, input, milestone and terminal records are kept in `events.jsonl`; screenshots stay in `frames/` for replay and later analysis.

## Human screenshot cadence

New human runs save screenshots on a500ms schedule (target two per second), declared as `controller.screenshot_ms:500`. RAM/state/input-journal polling retains its existing100ms wait plus processing time, so state/milestone analysis does not depend on the reduced screenshot schedule. The first screenshot and final frozen Finish screenshot are always saved. A delayed poll skips missed screenshot intervals instead of writing a catch-up burst. Existing human recordings and agent screenshot behavior remain unchanged. The Play screen's live display is independent of durable screenshot sampling.

## Rustboro Gym trainers

New recordings include separate splits for defeating Josh, Tommy and Marc, using their native trainer flags. The game also marks skipped trainers as defeated after Roxanne is beaten, so only flags confirmed before Gym completion establish these individual wins. Previously recorded wins remain in the timeline; an unobserved post-clear trainer status is unknown. Older runs lack these fields and show these splits as not recorded. This adds no automatic gameplay or save/RAM changes.

The updated trainer-milestone preview is on port8801. For the next recording, open `http://127.0.0.1:8801/play#run=<current-run-id>` and use Start over after you finish the current run. The existing port8799 recording remains uninterrupted and retains its original state fields. The updated viewer can inspect historical runs, but cannot recover trainer flags those runs never stored.


## Expanded progress and activity

New recordings declare `native-progress-activity-v1`: initial Route102/104 trainer victories, Roxanne victory separately from badge receipt, first normal capture, first evolution and first completed Pokémon Center heal. Repeated normal captures, evolutions, completed Center heals, blackouts, identity-matched level gains and save attempts appear as timeline activity markers with recorded state evidence. Save attempts are labeled explicitly because the game increments its counter before writing; write success is not established. Normal capture totals exclude Safari-ball captures. Healing requires both a new accepted Center-use counter and a later full-health, unlocked overworld observation. Resumed cumulative counters establish a baseline, without fabricated repeated activities.

The reader stores native counters, initial trainer flags, blackout callback status and stable party identity. Sampling timestamps and frame bounds are first-observation upper bounds; gaps may miss transient callbacks or level gains. Unknown data remains unavailable. Historical recordings cannot recover missing trainer/counter/identity fields. The viewer can recover the old missing Route101–104 splits from exact confirmed map state, retaining evidence sequence IDs and marking recovery; original event logs remain unchanged.

Port8801 serves this expanded recorder for the next Start over. Keep playing an existing port8799 run to preserve it; its running recorder retains its original fields.
