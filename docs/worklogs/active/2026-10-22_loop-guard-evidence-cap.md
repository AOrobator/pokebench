# Loop-guard evidence cap (bundle "crash" fix)

Started 2026-10-22. Thread: "Lane B crash at 7:21 PM" (the operator).

## Cause

Five bundle runs on 2026-10-21 ended `crash` (7:21, 7:51, 8:07, 8:13 and 8:59 PM New York):
`2026-10-21T18-07-08_qwen36-gpu0_4164`, `19-29-00_qwen36-gpu0_8bb7`, `19-42-05_qwen36-gpu1_de61`,
`19-57-21_qwen36-gpu0_e0e6`, `20-13-14_qwen36-gpu1_0b9a`. Every agent stderr ends with
`play FAILED: RunLogError: invalid loop_guard event at /evidence: must not have more than 2 items`.

`drought-battle-heal-hold-v1` (bundle only) recorded a held drought during a heal trip with three ids:
last progress, heal warning, current event (`stall-briefing.ts`). The loop_guard schema allows one or two.
Each crash sits at a 5-minute drought step after the run's last milestone. No bundle run ever recorded a
heal-trip hold; the surviving ones only recorded battle holds (two ids). The fixed-run ledger labels every
agent exception "emulator or game server crash"; the emulator was fine.

## Fix (crash fix inside existing switches; no new switch)

- `LoopNotice.evidence` is a one-or-two tuple (`LoopEvidence`), built by `loopEvidence()` at every
  composite emitter, so tsc rejects a third id.
- The heal-trip hold cites `[progress, current]` like every other drought note and names the heal warning
  in its text (`... after a heal warning (#N).`). Switch OFF: unchanged. Model-facing text: unchanged.

## Milestone 1

- [x] RED: recorded heal-trip hold validates as a loop_guard event
  COMMIT: `test: heal-trip drought hold must record a valid loop_guard event (RED)` (9b3dced3c)
- [x] GREEN: evidence cap and typed emitters
  COMMIT: `fix: cap loop_guard evidence at two ids so a heal-trip drought hold cannot end the run` (059d09ef3)
- [x] Gates on 059d09ef3: `just lint` clean; `just coverage` agent 4425/4425 (lines 97.39, branches 93.3, functions 97.98), viewer 1667/1667 (95.45 / 91.33 / 94.35), Python 3889 passed, gate ≥90 OK
- [ ] Review: Claude, GPT/Codex, fallback lane (Grok waived by the operator while Cursor is out)
- [ ] Land via the landing board (ff-only)

## Principles self-review (docs/agent-principles.md)

| ID | Verdict | Evidence |
|---|---|---|
| PB1 Game grades the run | PASS | No grading or milestone change; only diagnostic loop_guard records. |
| PB2 Failed runs count | PASS | The five crashed runs stay in their ledgers as invalid; nothing is deleted or relabelled. |
| PB3 One run is an anecdote | PASS | Cause shown in all five crashes (same stderr line, same 5-minute drought step) and absent from every surviving bundle run's recorded holds. |
| PB4 Declare harness advantages | N/A | Model-facing text and tools unchanged; held drought notes are never sent. |
| PB5 Change one thing | PASS | One defect class (loop_guard evidence > 2) fixed; switch OFF paths byte-identical. Exempt from a new switch: crash fix inside drought-battle-heal-hold-v1's ON path. |
| PB6 Long runs fail where short can't | PASS | Found from 75-minute runs; the RED test reproduces the exact recorder error. |
| PB7 No event log, didn't happen | PASS | The heal-trip hold is now actually recorded (before: never, the record threw). |
| PB8 Misbehavior loud, bounded | PASS | `loopEvidence` throws on empty input; tsc rejects a third id at every emitter. |
| PB9 Rock-solid-or-ask | PASS | Evidence choice (first and last) matches the existing drought notes; heal warning id kept in the text. |
| PB10 No carve-outs | PASS | No skipped tests, excludes or threshold changes; one existing expected string updated for the added `(#N)`. |
| PB11 Verify pinned dependency | N/A | No dependency or vendor change. |
| PB12 macOS privacy prompts | N/A | No file-system or device access added. |
| PB13 Close the loop | PASS | RED test fails with the production error string; GREEN passes; gates below; live check after landing is the next bundle run reaching a heal-trip hold without `crash`. |

## Review round 1 (packet 3fc7276a4, diff sha256 6ae78517…f411)

- **Claude** (Claude CLI, `CLAUDE_CONFIG_DIR=~/.claude-review`, plan mode): `VERDICT: LGTM`. Hardening: comment at `notice()` that it keeps the last two ids (done); progress-aware-cycles heal-trip path has no test (its hold is set on the tool_result whose seq the coordinator passes, so it dedupes to two; now capped by `loopEvidence` anyway).
- **GPT** (isolated Codex CLI `gpt-5.6-sol` xhigh; Cursor out of usage): `VERDICT: BLOCKING`. Required evidence gap: no mounted-viewer test or built-viewer replay of the heal-trip payload (agent-observability skill). Accepted: fixed below.
- **Fallback for Grok** (isolated Codex CLI `gpt-6-astra` xhigh, the operator's waiver while Cursor is out): `VERDICT: LGTM`.

## Observability proof (round 2)

- Production replay: `stallBriefing` from the built agent over run 4164's own recorded events (read-only) records exactly one heal-trip hold, after tool_result #16572 (the one before the original crash): evidence `[14510,16572]`, text names heal warning #15727 (the run's `gym_heal_warning`). Scratch copy of the run (events through #16572 + that loop_guard + run_end; frames/raw-ram symlinked, originals untouched) under the session scratchpad.
- Built candidate viewer served on 127.0.0.1:8796 against that scratch root: the row shows in the agent trace as "Loop guard · milestone drought diagnostic: would warn" and the inspector shows the full message; the TIMELINE has no new mark. Screenshots: `runs/loop-guard-evidence-proof/inspector-heal-hold.jpg`, `timeline-no-mark.jpg`. Served `main.js`, `model.js`, `panels.js` byte-identical to `packages/viewer/dist` (sha256 a2fe34d2…, 7644d9d9…, f5858b28…). Scratch viewer stopped after.
- Mounted viewer test: heal-trip payload in Activity History text and inspector, no `k-loop` on the timeline.
- Guard deletions (receipts in `runs/loop-guard-evidence-proof/`): `guard-1` removed only the stall-briefing cap → still passes (play-wiring's `loopEvidence` caps it; kept as an unexpected pass); `guard-1b` removed both caps → `EventError: invalid loop_guard event at /evidence: must not have more than 2 items`; `guard-2` removed the `(#N)` text → 2 assertion failures; both restored → 16/16.
- Gates after round-2 edits: `just lint` clean; `just coverage` agent 4425 (97.39 / 93.29 / 97.98), viewer 1668 (95.45 / 91.33 / 94.35), Python 3889 passed.
