# Text-only supervisor: a note instead of ending the run

Requested by the operator in the "Navigation and memory experiment" thread (2026-10-15 14:39 UTC):
"what if we make a change so that 3 replies in a row without a tool call trigger a supervisor
message instead of ending the run?" Approved 14:41 UTC ("yes") with: new switch, default OFF, and
ON for every winner-gate finals arm. Branch `claude/text-only-supervisor`, worktree
`/private/tmp/pokebench-text-supervisor`. Local only; ask before merging.

## Evidence
On the 32 Think Fast 2×2 runs, the failure limit ended 5 runs (model_error), all after three
text-only replies in a row. Four had made no milestone since ~minute 2; trial 04 met the rival
at 11.2 min and stopped at 13.7.

## Spec
- Switch `text-only-supervisor-v1` (guard, needs null, default OFF; OFF is today's behavior).
- ON: when the failure streak reaches the limit on a reply with no tool call (text-only, or cut
  off at max_tokens with no call), the governor does not stop. It sends a SUPERVISOR note as the
  follow-up message instead of the plain nudge, records a `text_only_supervisor` event (replies,
  note number, limit, text) and restarts the streak.
- Bound: TEXT_ONLY_NOTE_LIMIT = 3 notes in a row with no successful tool call between them; the
  next limit ends the run as model_error. A successful tool turn resets the note count.
- Invalid tool calls and gateway/model errors still end the run at the limit.
- Note facts reuse the loop supervisor's briefing (room and position, last story progress,
  recent dialogue, untried targets) plus the tool names that must be called.
- Finals presets force it ON for every arm (incumbent included).
- Viewer shows the event in the error lane. Explainer, pending experiment entry, readiness row.

## Milestones
- [x] M1 RED: governor, wiring, features registry, finals preset, live factory path, viewer lane.
- [x] M2 GREEN + gates (lint, coverage ≥ 90, schema regenerated).
- [x] M3 Explainer, pending experiment, Claude CLI review, report, merge on approval.

## Log
- M1 RED: 9 agent tests fail as intended plus the viewer lane test.
- COMMIT: `test: text-only-supervisor-v1 sends a bounded supervisor note instead of ending the run` (557258e)
- M2 GREEN: registry (guard, needs null, last in playHarnessFeatures), presets default off, DEFAULT_NEXT_RUN off, Governor note + TEXT_ONLY_NOTE_LIMIT 3, SupervisorBriefing.textOnly, text_only_supervisor event (schema regenerated), recorder, live wiring, tail, viewer error lane/activity/trace, finals force ON. Wiring check: removing the live.ts textOnlySupervisor dep turns the live ON test red; restored green. Gates: agent 1080 (97.49/93.86/98.15), viewer 647 (95.36/91.13/94.38), pytest 1877, lint clean, experiments-check ok (39).
- M3: explainer docs/explainers/text-only-supervisor-v1.html (README + FEATURE_EXPLAINERS + server/panels tests), pending experiments/text-only-supervisor.json (no queuePosition; source.commit updated to the merge SHA after merge), readiness row READY.
- COMMIT: `feat: text-only-supervisor-v1 sends a SUPERVISOR note instead of ending on text-only replies` (6417f03)
- Claude CLI review: high: state-only mode would record undelivered notes (no follow-ups there); medium: a mixed failure streak could earn a note and the reply count was wrong; low: a note was recorded even when the run stopped before delivery; low: last-note wording; low: in-flight finals would mix (none started: runs/experiments/full-map-navigation has no finals ledger). RED for the first three.
- GREEN (review fix): a separate all-silent streak decides note vs stop (replies recorded = that streak); the note is built and recorded in nudge(), only when delivered; stateOnlyProblems forbids the switch with state-only decisions and finals force it on only for non-state-only arms; last-note wording fixed. Gates: agent 1083 (97.5/93.87/98.15), viewer 647 (95.36/91.13/94.38), lint clean, experiments-check ok.
- Operator approved merge and finals start 2026-10-15 15:01 UTC ("yes and start the finalists run"); merged --no-ff.
- Pinned experiments/text-only-supervisor.json source.commit to the merge a5f44249ce699215a83b25861e8e4582c4df0866.
- 2026-10-15 15:02-15:09 UTC finals start: stopped the overnight chain (run-all-2.sh killed; hint trials 03 and 04 ended operator_stop and are in that cohort's ledger; Qwen 2x2 and Qwen hint batch not run). The pre-restart viewer (68762eb) took the freed lease and launched finals trial 1 (2026-10-15T11-03-44_think-fast_ab87) with a preset that lacked text-only-supervisor-v1; aborted it after ~1 min (operator_abort, recorded as launcher_error), moved its stale preset to logs/stale-finals-incumbent.pre-merge-viewer.json, cleared the dead viewer's lease (pid 52394). Relaunched trial 1 as 2026-10-15T11-08-31_think-fast_504f at 5001252: boot, 45 min, text-only supervisor ON, stall OFF.
