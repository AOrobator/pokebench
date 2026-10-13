# Human Play

Start an isolated recorded human server:

```sh
just run-human
```

Open the printed `/play#run=…` link on the usual viewer (port 8791). If needed, start the viewer separately with `just view --port 8791`. Human Play is separate from the model inspection screen. Game speed and sound playback are fixed at 1×, including dialogue.

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
