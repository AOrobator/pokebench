# Run recorder

The operator 2026-11-06, "we have to record this run", then "Build a recorder, test replay too". A run saves one PNG per turn; full-rate picture and sound reach only live watchers. Measured on a scratch server: 59.72 frames per second with no gaps, 48,000 samples per second, 803 samples per frame, so the recorder syncs by game frame.

- [x] RED/GREEN: `test_recorder.py`, in memory with fake sinks.
- [x] Rehearsal on a scratch port, no model, 5 minutes with scripted presses. First frame 5, 0.1 s after the server came up. 17,983 frames and 301.05 s of sound. Recorder 1.8% of a core, ffmpeg 3.4%, server unchanged at 59.7 fps. Video about 19 MB an hour, sound up to about 137 MB. Killing the video encoder lost 11 s and started a new part; the recorder exited by itself 15 s after the server stopped. A 55 s check against the server's own sound matched at every 5 s step.
- [ ] Gates, review, landing.

A sidecar, not a harness behavior: it changes nothing the model sees, so it needs no feature switch. `launch.sh --record` starts it.

Sync: the sound counter stays within 3 samples of frame_count times 803.65 minus 686, measured over 45 s, so sound is placed by absolute position. Tying it to the picture's live position dropped sound when the picture lagged.

Boot run: `experiments/fixed/deepseek-boot-24h.json`, `featureRecipe: current`, control arm, `controlMaxTokens` 32,768, 24 h. It launches through `launch.sh --definition`, because `just fixed-run run` would share `runner.json` with a live run. `rq-*` joined `offInBoth`, which also clears the control-base failure on `bundle-v-control` and `hyperqwen-bundle-24h-v5`. Launch waits for the operator's explicit go.

COMMIT: `feat(env): record a run's picture and sound, and a boot run on the current pointer` (7d1579135). That commit's viewer build failed on a missing import; fixed in the next.

COMMIT: `fix(viewer): import armPreset for the preset command` (58dcc51bf). Next: `--supervise` restarts a dead recorder, and each start takes the next part number, so nothing is overwritten. The operator approved one 10-minute test run from boot and a pre-mortem.
