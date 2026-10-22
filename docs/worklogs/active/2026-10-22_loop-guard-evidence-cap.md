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
- [ ] Gates: lint, test, coverage ≥90
- [ ] Review: Claude, GPT/Codex, fallback lane (Grok waived by the operator while Cursor is out)
- [ ] Land via the landing board (ff-only)
