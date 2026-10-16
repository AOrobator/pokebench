# Furthest-milestone depth order

Coordinator handoff (2026-10-16 14:45 EDT, from the run analysis): MILESTONE_ORDER ranks FIRST_POKECENTER_HEAL above RUNNING_SHOES_RECEIVED, and run_end, the fixed ledger and fixed-analysis rank with it. Then backfill newer detectors over existing runs where recorded data allows, without rewriting raw logs.

## Finding

MILESTONE_ORDER places three optional activities (FIRST_POKEMON_CAUGHT, FIRST_EVOLUTION, FIRST_POKECENTER_HEAL) after RUNNING_SHOES_RECEIVED. They can happen almost anywhere after their prerequisite (a heal is possible in Oldale before Route 103), so a run that healed early outranks one that won the rival battle, got the Pokédex or the shoes. Rankers: recorder.ts run_end furthest_milestone; fixed-ledger classifyTrial furthest/furthestDepth (persisted per trial); fixed-analysis via the ledger; viewer runs.ts comparison best/baseline score; controls.ts RUN ENDED box (shows the last recorded split, not the deepest).

## Design

- `DEPTH_ORDER` (milestones.ts) = MILESTONE_ORDER without ACTIVITY_MILESTONES; `deeperMilestone(current, candidate)` picks the deeper by DEPTH_ORDER and never returns an activity.
- All rankers use it. Display order (splits, frontier) is unchanged.
- Existing ledgers keep their stored depth; `fixed analyze` re-scores each trial from its own events.jsonl when present (no log or ledger rewrite).

## Milestones

- [ ] M1 Depth order: RED/GREEN, gates, three-lane review, merge slot from the coordinator
  - RED: agent depth-order.test.ts 2; viewer controls 1 (RUN ENDED shows the last split), fixed-analysis 1 (rescoreTrials), fixed-ledger 1 (DEPTH_ORDER), runs 1 (healer outranks the bedroom).
  - GREEN: DEPTH_ORDER/ACTIVITY_MILESTONES/deeperMilestone in milestones.ts; recorder run_end, fixed-ledger classifyTrial, fixed-analysis rescoreTrials (wired into `fixed analyze`), viewer runs.ts comparison score, RUN ENDED box (model.ts mirror, checked equal to the agent's), summary.ts incomplete-run furthest (RED added in this step: last-logged fallback). agent 1883, viewer 975, pytest 2465 passed (ROM set); coverage agent 97.99/94.69/98.4, viewer 95.42/91.16/93.81, Python 97.52/93.55/100; lint clean.
  - Effect on recorded runs: 8 of 256 run_end records name FIRST_POKECENTER_HEAL as furthest. Re-graded by depth: sh02 RIVAL_BATTLE_WON; e588, 54a7, 230d ROUTE_103; 7a95 RIVAL_BATTLE_STARTED; 7ccf RUNNING_SHOES_RECEIVED; a3c9 OLDALE_TOWN; 8b01 RIVAL_OLDALE_SEND_OFF.
- [ ] M2 Backfill: report which newer splits older runs can recover from recorded data, then build it
  - Review round 1: Claude LGTM (medium: missing-log trials keep old-scale depth; low: a corrupt log blanks a valid trial; low: run id unchecked before the path join), grok LGTM, Codex BLOCKING (high: rescoreTrials overwrote primary outcome and depth from any existing log, even truncated or empty). Accepted all. RED: rescoreTrials re-grades only depth and only from a complete log (run_start first, run_end last); otherwise re-maps the stored furthest name onto DEPTH_ORDER; a stored activity name with no usable log is listed as unscored (2 failing).
  - GREEN: rescoreTrials(trials, events) -> {trials, unscored}: depth only, from complete logs; else remap the stored name; AnalysisTrial carries furthest; `fixed analyze` checks run ids against RUN_ID_PATTERN before reading and prints unscored trials to stderr. agent 1883, viewer 977, pytest 2465 passed; coverage agent 97.99/94.7/98.4, viewer 95.43/91.16/93.82, Python 97.52/93.55/100; lint clean.
