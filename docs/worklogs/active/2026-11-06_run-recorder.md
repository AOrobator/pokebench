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

COMMIT: `feat(env): a watchdog restarts a dead recorder without touching earlier files` (971c4d83b). Gates passed on 58dcc51bf except two test-file lint errors, fixed. GPT round 1 BLOCKING: a long sound outage misplaced later sound; an unstartable ffmpeg restarted in a tight loop; `--definition` could not name an arm. All fixed.

COMMIT: `fix(env): sound keeps its place through an outage, and failed encoders back off` (575c31322). GPT round 2 BLOCKING: an ffmpeg that starts then dies respawned with no delay. An encoder that dies within 5 s of starting now waits; one that had been running restarts at once.

COMMIT: `fix(env): an encoder that dies on starting waits before the next try` (061e21c53). One older test needed a fake clock; 31 recorder tests pass.

COMMIT: `test(env): the encoder restart test uses a fake clock` (3db6a8321). GPT LGTM on the encoder delta. Added per-minute `sync` marks for compositing a Broadcast view later: journal `at`, game frame and file position. The second capture input waits on spectator-thread details.

COMMIT: `feat(env): the recorder logs a sync mark each minute` (1fdd1a42b). GPT LGTM on rounds through 061e21c53. Claude BLOCKING: a run from a save recorded no sound, since a save restores the frame counter but not the sound counter; the anchor now checks the first sound and rebases, logged. Also fixed: an encoder that stops reading (10 s write deadline, then killed), picture and sound parting after `frames_lost`, `audio_gap` rows overwriting `at`, `just record` paths, and flushing (`flush_packets` belongs in the segment format options). `--index` writes `segments.json`. Claude also found real runs go at about 80 fps, so media runs about 1.34 times wall time.
