# Native journal clock steps and server exit evidence

## Context

The 24h DeepSeek control arm (`2026-11-02T06-25-22_deepseek-deepseek-v4.1-flash_53be`) ended
`crash` at turn 182 after 46m32s with `telemetry_error: "Invalid native action journal
continuity"`. The failure looked like an external kill of the emulator: pids were gone, the port
was free, and the vendor printed `Received signal N, shutting down gracefully`.

It was neither an external kill nor a server crash. The recorder was reading a **live** server.

## Root cause

`env/pokebench_env/action_history.py` stamps every journal entry with
`clock: Callable[[], float] = time.time` — wall clock. `recordNativeActions` in
`packages/agent/src/recorder.ts` treated a regressing `server_timestamp` as a continuity
violation, alongside the id and frame checks.

macOS applied an NTP wall-clock adjustment at `07:12:41.354`
(`=== system wallclock time adjusted`), 842ms before the recorder read at `07:12:42.196`. The batch
straddled that step, so one entry carried a timestamp earlier than its predecessor, and the run
died. Recorded ids were contiguous 1..2986 with no gaps, so the journal itself was intact.

Reproduced against the real class with a clock that steps back 116ms: the journal emits ids 1..4
with timestamps `100.0, 100.016, 99.9, 99.916`, and the old predicate rejects id 3.
`docs/worklogs/active/2026-10-29_qwen-viewer-clock.md` already recorded this class of NTP step.

Frame and id are monotone in the server's own frame loop. The timestamp is not, and it must not be
load-bearing.

## Changes

1. **Ordering authority is id and frame** (`recorder.ts`). A regressing `server_timestamp` no
   longer throws. It appends `clock_step { back_ms, last_id }` and continues; `time` tracks the
   running maximum so a single step yields a single record.
2. **Server exit is evidence** (`events.ts`, `run.ts`, `live.ts`). `ServerHandle` gains an optional
   `exit: Promise<ServerExitInfo>`; `withRun` records `server_exit { code, signal, stop_requested }`
   while the run is live. A teardown exit arrives after `run_end`, where the log refuses it, so
   only deaths carry this event.
3. **The server's streams belong to the run** (`live.ts`). stdout and stderr go to
   `runs/<id>/server-stdout.log` and `server-stderr.log` instead of `ignore` and `inherit`; the
   vendor's `Received signal N` announcement is now recoverable from the run directory. They sit
   beside `runs/<id>/server`, not inside it: the launcher owns that directory and refuses one it
   finds already prepared.
4. `tail.ts` and the viewer's `KNOWN` map list the two new event types, and
   `schemas/events.v1.json` is regenerated.

## Verification

- `native-actions.test.ts`: the wall-clock batch moves from the reject table to a test that
  asserts both entries are recorded, exactly one `clock_step` (`back_ms: 1000`, `last_id: 2`), no
  `telemetry_error`, and that the next read still uses cursor 2 — a step cannot latch a failure.
- `run.test.ts`: a host whose exit resolves while the run is live writes `server_exit` before
  `run_end`.
- Real 2-turn smoke at the committed SHA: `server/` is refused when a wrapper pre-creates it, so
  the capture files live at the run root (`server-stdout.log`, `server-stderr.log`).
- Killing the emulator mid-run showed the exit belongs to the launcher, not the server: the
  wrapper outlives the process it supervises, so the evidence arrived after `run_end`. The launcher
  now takes `--exec` for owned runs, and the pid the harness holds is the server itself.
- Killing the real server at turn 39 of a live run recorded
  `server_exit {turn: 39, code: 0, signal: null, stop_requested: false}` before `run_end`, and
  `Received signal 15, shutting down gracefully...` in `server-stdout.log`. The vendor's handler
  catches SIGTERM and exits 0, so the signal's identity lives in the captured stream while the
  ledger carries the timing and the fact that teardown did not request the stop. Both halves are
  needed; neither alone would have answered the incident.
- The first full agent run caught one regression in the human launcher path: opening the capture
  files before the run directory exists threw `ENOENT` ahead of the spawn guard. `launchServer`
  now creates the run directory and closes both descriptors in a `finally`, and the human-path
  test asserts the two capture files exist even when the spawn itself is refused.

## Landing

Self-review only: the cloud review lanes were not run (the operator is out of tokens, per the
previous landing's waiver), so no independent verdict exists for this diff. What was checked by
hand: the continuity check still throws on a bad id, a regressing frame, or an entry beyond the
batch frame; `clock_step` and `server_exit` are in the schema, the tail renderer and the viewer's
`KNOWN` map; the launcher's `--exec` path is reachable only from owned runs, `just serve` keeps its
wrapper; and the pre-commit worklog hook passes.

Gates on this branch:

- agent: 381 files, 5392 tests passed, exit 0 (package thresholds 90% lines/branches/functions/
  statements met)
- viewer: exit 0
- env: 5199 passed, 97.51% lines / 93.58% branches / 99.90% functions, coverage gate exit 0
- claude-gateway: 116 passed, 99.12% / 96.22% / 100.00%, coverage gate exit 0
- trainer cards: 3 passed

Final end-to-end proof at the landed SHA `b463203f4`: killed the emulator at turn 51 of a live
run. `server-stdout.log` holds `Received signal 15, shutting down gracefully...`; the ledger holds
`server_exit {seq: 732, turn: 51, code: 0, signal: null, stop_requested: false}` before
`run_end {reason: "crash"}`; the process group is gone afterwards. The incident's question —
"was this us, or did the emulator die?" — now has a recorded answer.

