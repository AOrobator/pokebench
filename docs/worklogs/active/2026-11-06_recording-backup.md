# Recording backup to Google Drive

The operator 2026-11-06: "write the backup into the Google Drive folder". `scripts/recording-backup.sh` copies finished segments, the journal, `segments.json` and new event bytes every 10 minutes, niced, and only ever reads the run. `launch.sh --backup <folder>` starts it with `--record`.

events.jsonl reached 2.3 GB in 4.8 h on a0b4, so re-copying it each pass would send hundreds of GB; each pass sends only the new bytes as a numbered part.

Tested on a copy of the 80af recording: segments held until the recorder ended, hashes match, parts rebuild the file exactly, 0.54 s of CPU for the first pass.

GPT round 1: fixed files missing a stream, a last pass that gave up on failure (now up to 12 tries, 5 minutes apart), events from an older run (only a run created after the job starts), and the model glob.

GPT round 2: model glob now mirrors newRunId exactly.

GPT LGTM on fd6a14ca0 after three rounds. Claude review waived by the operator 2026-11-06, 11:58 PM NY: "claude's review is waived, launch". No app code changed; script and launcher only.
