# PokeBench review skill (three personas)

Requested by the operator via the project coordinator (2026-10-15): when they ask for a "PokeBench
review", invoke three personas (harness engineer, data scientist, machine learning engineer) to
critique the subject, grounded in run evidence, the experiment queue, reports,
`docs/agent-principles.md` and the patch-evaluation skill. Lead with the furthest milestones.
Long output goes to local HTML under `runs/`, linked clickably, never claude.ai artifacts.
Branch `claude/pokebench-review`, worktree `/private/tmp/pokebench-review`. Local only, no push;
review with Claude and Grok, not local inference lanes; ask before merging to main.

## Spec
1. `.claude/skills/pokebench-review/SKILL.md`: subject, shared evidence base, three persona
   checklists, review layout and delivery, self-check. Review only: never launches, approves,
   queues or discards experiments, and never restarts the viewer.
2. `.claude/skills/pokebench-review/frontier.mjs`: reads the live viewer workbench, validates it
   with `parseWorkbench`, ranks with `FRONTIER_MILESTONES`, and prints best valid fresh-boot run
   (`frontierReferences`), fresh-boot frontier, CLOCK_SET checkpoint frontier (ranked after the
   resume point, minutes since save load), in-progress, stalled and human reference.

No harness behavior change, so no feature switch or explainer; no application code, so the
coverage gate is untouched.

## Milestones
- [x] M1 Draft skill and helper; verify the helper against the live viewer.
- [x] M2 Claude CLI and Grok (cursor-grok-4.5-high) reviews; fix findings.
- [ ] M3 Ask the operator before merging to main.

## Log
- Raw events.jsonl scans are unsafe: `2026-10-13T17-07-50_think-fast_805e` shows PETALBURG_CITY
  raw, the workbench grades it to PLAYER_BEDROOM. Helper uses the viewer's validated data.
- Claude round 1: 10 findings (checkpoint runs crowding out boot frontier, optional milestones in
  ranking, probes not filtered, no human/model/time columns). Fixed with frontier.mjs.
- Claude round 2 + Grok round 1: CLOCK_SET-only checkpoint list ranked after resume, live/paused
  only, frontierReferences for best and human, parseWorkbench + timeout, no viewer restart during
  a review (it hosts the run queue), checkpoint minutes labeled. Fixed.
- COMMIT: `feat: pokebench-review skill with three personas and a validated frontier helper` (b5eab1b)
- Claude round 3: LGTM with 4 LOW (boot-run label, mixed clocks in in-progress list, lane-scoped
  recent-basis wording, `just experiments` rebuilds). Fixed.
