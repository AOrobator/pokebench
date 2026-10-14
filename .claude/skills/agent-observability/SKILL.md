---
name: agent-observability
description: Trace PokeBench harness interventions and diagnostic state changes through recorded events, model feedback, live viewer and replay when adding or repairing agent diagnostics, guards or completion evidence.
---

# Agent observability

Use this developer workflow for changes to PokeBench diagnostics and interventions. It is not a gameplay skill, walkthrough, or authorization to edit a harness during measured runs.

For a read-only audit, inspect existing producers, logs, build receipts and consumers; report missing delivery or proof without editing source. For an authorized implementation, read `CLAUDE.md`, the active `WORKLOG.md` pointer and its tracked worklog. Record the authorized outcome and each intended consumer before changing code. Keep measured cohorts on their recorded source; prepare fixes in an isolated checkout and land before new trials.

Trace the actual changed signal across its owners:

1. **Producer and durable event:** inspect `packages/agent/src/loop-detection.ts`, `harness.ts`, `recorder.ts`, `events.ts` and the relevant environment reader. Use the existing typed event owner where applicable; validate boundary JSON and regenerate `schemas/events.v1.json` through `just schema` when the contract changes. Bind diagnostics to run, sequence, turn, timestamp, reason/phase and supporting evidence. Distinguish a warning, recovery and terminal stop; preserve terminal stop reason. Avoid private reasoning as grading evidence.
2. **Model feedback:** when a diagnostic requires the gameplay model to recover, prove the real pinned pi path delivers specific bounded feedback before the next decision. A viewer row alone cannot prove the model received it. Do not invent a gameplay action or silently alter the game to recover.
3. **Visible consumers:** trace `packages/viewer/src/model.ts`, `timeline.ts`, `panels.ts` and `app.ts`. Require warning/recovery/stop in the timeline and Activity History, with readable attribution and raw-event inspection. Check time-window/replay cursor behavior and whether raw inspection refers to the selected event or current cursor; clear removed selections or label retained selections explicitly. An old marker falling outside the timeline window remains in history. Keep provisional model claims separate from native game verification in both objective detail and watch summary.
4. **Proof:** write behavior tests from production-shaped records through schema parsing and the mounted viewer, plus the real model delivery seam if changed. Delete each changed delivery/rendering operand once, observe the intended assertion fail, restore it and record the result. Run repository gates without lowering coverage or modifying pinned vendor. Replay a schema-valid recorded run on the built isolated viewer and inspect both requested surfaces and evidence; preserve screenshot and source identity. Compare served app/assets bytes with the frozen built artifacts and record their hashes, rather than treating Git HEAD alone as proof of what the browser loaded.

For an unsupported active UI readout, log the coverage gap with qualified callback/task ownership evidence; missing state is not proof of a loop. Use the repository `pokebench-game-state` skill to investigate the read-only matching game source and implement an authorized decoder repair. Diagnose first; skill discovery does not authorize autonomous runtime source edits. For native story completion, use `pokebench-story-milestones`: recorded native milestone evidence and origin qualify completion, while local scalar/visual claims remain provisional and older completion records remain historical.

Give each guard deletion/restoration attempt a unique receipt name. Retain unexpected passing attempts, failures and restoration results; do not overwrite an earlier attempt with a stronger later test. If a receipt was lost or overwritten, mark that attempt unproven and state the loss, then qualify a fresh uniquely named attempt. A later valid failure does not establish that the earlier transcript was preserved.

Discoverability links and invocation policy establish configuration only; an explicit skill invocation does not prove automatic selection. Report separate receipts for implementation, gates, review, landing and live proof. Preserve failed/incomplete runs and original event logs; do not rewrite benchmark history to make a new diagnostic appear retrospectively recorded.

## Preserve raw recording evidence

For every new human and agent run, verify `raw-ram/index.jsonl` and its gzip archives exist in the run directory. RAM-derived JSON is decoded evidence, not a raw memory backup. The shared observation reader must durably archive complete EWRAM, IWRAM, I/O, palette, VRAM, OAM and both cartridge Flash banks plus CPU registers before decoding, under the same frame lock. Bind archives to native frame, capture time, ROM identity and hashes; pair successful decoding/screenshots through `raw-ram/observations.jsonl`. Raw capture/write failure must surface and stop the observation, not silently fall back to decoded-only recording. Preserve raw files independently of screenshot pruning.

Use `pokebench_env.raw_ram.load_raw_ram` to validate hashes/layout and reparse with the exact matching external ROM. Check a real archive through the production game-state reader, including a decoder failure that leaves the raw archive intact. State polling captures samples, not every emulator frame; report actual cadence and gaps. Human Finish must also retain the native final checkpoint. Never claim old runs contain raw RAM without checking their artifacts, and never fabricate missing historical memory from screenshots.
