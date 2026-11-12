# Run recorder

> Markdown twin of [run-recorder.html](../run-recorder.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`pokebench_env.recorder` saves a run's moving picture and sound to files, with no screen involved. Every boot-start run through the shared game launcher starts it automatically, under `runs/<run id>/recording/`. Checkpoint starts keep their existing behavior; they can still use the recorder manually.

## Why it exists

A run keeps one picture per turn, about 38 seconds apart. The full-rate picture and the sound go only to live watchers, so nothing else can make a video of a run afterwards.

## How it works

![Picture and sound are timed by game frame, not the wall clock, so a pause in the run costs neither anything.](run-recorder/fig-1.svg)

*Picture and sound are timed by game frame, not the wall clock, so a pause in the run costs neither anything.*

## Run ownership

The recorder starts detached, before the first agent action, and watches its own game server PID. When that server exits, it seals its files and exits. It never follows a later run that reuses the port. Its supervisor and encoders can restart without restarting gameplay. Existing recordings and past runs remain unchanged.

The launcher checks that ffmpeg is installed before starting a boot run. Once play begins, recorder failures are logged and do not stop the game. Check `recording.jsonl`, `recorder.log` and `ffmpeg.log` for capture status.

## If something fails

The recorder only reads, so its failure cannot reach the run. An encoder that dies is restarted into a new part, and every failure goes to `recording.jsonl`.

## Joining picture and sound

`ffmpeg -i video-p01-0000.mkv -i audio-p01-0000.mka -c copy joined.mkv`
