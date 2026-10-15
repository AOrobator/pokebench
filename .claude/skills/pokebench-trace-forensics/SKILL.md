---
name: pokebench-trace-forensics
description: "Use when explaining why PokeBench runs stalled, failed, regressed or succeeded, from their recorded events, frames and RAM, before designing a fix or an experiment. Read-only. Builds a timeline, audits what the model actually saw and whether harness messages were true, classifies the failure with evidence and finds progress the grader hides."
---

# PokeBench trace forensics

Explain recorded runs from their evidence. This skill is read-only: no runs, no viewer restarts, no source edits. It hands its findings on:

- `pokebench-experiment-design` turns a classified failure into a mechanism and a design.
- `agent-observability` owns how diagnostics and interventions are produced, delivered and shown. When forensics finds a signal that was never recorded, never reached the model or was shown wrongly, report it as an agent-observability gap and use that skill's tracing steps to locate the owner.
- `pokebench-game-state` decodes RAM truth. `pokebench-story-milestones` owns what counts as progress.

## Evidence per run

All under `runs/<id>/`:
- `events.jsonl`: `run_start` (features, limits, start kind and save SHA-1), `turn_start`, `assistant` and `assistant_delta`, `tool_call`, `tool_result`, `button_press`, `native_action`, `state`, `milestone` (with `origin`, where `present_at_start` means it was already true at load), `loop_guard`, `operator_control` and `run_end`.
- `frames/<seq>_<index>.png`: the frames recorded with each tool result.
- `raw-ram/`: raw memory archives, validated through `pokebench_env.raw_ram.load_raw_ram`.
- `control.jsonl`: operator control.

Reasoning text is not evidence of cause. What the model wrote it was thinking does not show why it acted. Cite observations delivered, actions taken and state changes. Quote reasoning only to show the model's stated belief, labeled as such.

## Procedure

1. **Pick runs without cherry-picking.** For a cohort, take every failure, the best and worst success, and every run whose outcome surprised you. Say which runs you left out and why.
2. **Build a timeline.** For each run, list turn, seq, time, map and coordinates, milestones, tool calls with their arguments, harness or supervisor messages, model errors and the end reason. Mark the first turn of the stall, meaning the last new milestone plus the first turn the model started repeating itself.
3. **Audit what the model saw.** For the stall window, compare the delivered observation with RAM truth:
   - **Frames:** count blank or near-uniform frames in the window and the longest consecutive run of them. Use `uv run --with pillow python`, then check each frame's luminance spread. Frames recorded with a tool result are the ones the model received.
   - **Readouts:** check that text readouts (map, position, menu, battle, story state) match decoded RAM at the same seq. Note readouts that say "unavailable" or go stale.
   - **Verdict:** did the model have what it needed to act correctly? If not, the cause is the harness, not the model.
4. **Audit whether harness messages were true.** Check every supervisor, loop-guard and press-result message the model received against RAM at that seq. Common lies:
   - A story-stage boolean contradicting the map.
   - "no change" after a press that changed state.
   - A stood-on tile marked as tried.
   - A target that is unreachable from the current map.

   A false message is a harness bug, whatever the model did next.
5. **Classify each failure.** Choose one primary class and any number of contributing classes, each with run id and seq:

   | Class | Meaning |
   |---|---|
   | `observation-wrong` | What the model received was wrong or missing (blank frames, stale readout). |
   | `harness-message-false` | A supervisor or guard told the model something untrue. |
   | `observability-gap` | The truth exists in RAM but the harness never exposes it. |
   | `prior-over-evidence: did-not-notice` | The evidence was delivered and the model never referred to it. |
   | `prior-over-evidence: noticed-ignored` | The model acknowledged the evidence and kept its plan. |
   | `prior-over-evidence: no-alternative` | The model accepted the plan failed but could not form another. |
   | `spatial` | Misread the map, coordinates, warps or elevation. |
   | `interface-mechanics` | Menus, battle UI, dialogue or naming input. |
   | `infrastructure` | Model error, emulator crash, gateway outage. Exclude it from behavior conclusions. |
   | `budget` | The run was progressing and hit the cap. |

6. **Find hidden progress and grading blind spots.**
   - Look for progress the grader did not credit, such as returning to an already-reached area to do the next story step. A run that reached Route 101 after the handoff shows no new milestone.
   - Look for credited progress that the play did not earn: milestones from a scripted or remote origin, or `present_at_start`.
   - Report each blind spot to `pokebench-story-milestones`. Never re-grade by hand inside a result.
7. **Compare pairs.** Put a success next to a failure at the same decision point (same map and goal), and find the first turn where they diverge. Then check whether the success happened for the right reason or by luck.
8. **Count the taxonomy.** For a cohort, give counts per class, per arm and per executor. Several runs sharing one class beat one vivid run.

## Output

For each run, a card: run id, arm, outcome, end reason, stall window, primary and contributing class with seq evidence, observation-audit result and false-message list.

Then, for the cohort:
- the taxonomy counts;
- hidden progress;
- the strongest candidate mechanisms, ranked by how many runs they explain;
- for each mechanism, the next step:
  - a correctness fix and test, for wrong observations and false messages;
  - a diagnostic probe;
  - an experiment via `pokebench-experiment-design`.

State plainly what the evidence cannot show.

## Self-check

- Runs chosen by rule, and exclusions stated.
- Every claim cites run id and seq.
- What the model saw was audited against RAM before any failure was blamed on the model.
- Every message the model received was checked for truth.
- Reasoning text never used as causal evidence.
- Infrastructure failures excluded from behavior counts.
- Hidden progress and grading blind spots reported to their owners.
- Nothing edited, run or restarted.
