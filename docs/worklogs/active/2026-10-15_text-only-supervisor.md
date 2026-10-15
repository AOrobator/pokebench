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
- [ ] M2 GREEN + gates (lint, coverage ≥ 90, schema regenerated).
- [ ] M3 Explainer, pending experiment, Claude CLI review, report, merge on approval.

## Log
- M1 RED: 9 agent tests fail as intended plus the viewer lane test.
