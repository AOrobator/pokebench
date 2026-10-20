# Rustboro Gym trainer tracking reconciliation

Operator request: reconcile missing Rustboro Gym defeated-trainer milestones, backfill historical data, review, land on main, restart viewer. This explicitly includes gym trainer splits in frontier tracking, superseding the earlier optional-gym exclusion for these three trainers only.

Scope: existing Josh/Tommy/Marc native pre-clear predicates, their historical state recovery, viewer frontier catalog/ranking, regression tests, read-only run audit. Original recordings remain unchanged. No gameplay, new runs or interventions.

Source: pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, RustboroCity_Gym scripts; Roxanne calls Common_EventScript_SetGymTrainers. Existing reader correctly suppresses trainer flags after gym completion.

Plan: RED graph/ranking and historical recovery tests; GREEN smallest owner repair; full gates; frozen three-cloud-lane review; ff-only local main landing; viewer-main and live browser evidence.

Status: implementation and historical reconciliation complete; review and landing pending.

RED: graph and native-ingestion tests now require trainer points and frontier selection; initial run could not resolve the unbuilt agent package; reran after building to obtain assertion failures before the catalog update. Real snapshot has 437 runs: b300 records Josh at 60.65 active min and Tommy at 62.58; r10 and r5 each record Josh. Human baseline already has three labeled visual reconstructions. No new decoder required if full log audit confirms no missing native marks.

Native audit: all three logs containing true pre-clear gym trainer flags have matching native milestone rows with state evidence. b300 Josh state #15196 / milestone #15197 (turn 499, active 60:38.857); Tommy state #15569 / milestone #15570 (turn 507, active 62:34.941). r10 Josh #6088/#6089; r5 Josh #9355/#9356. No missing native rows to synthesize. Existing human screenshot backfill remains labeled and excluded from model native rank. Backfill means exposing these retained historical splits in the chart and selection, without rewriting evidence. Required checkpoint capture list remains unchanged because these optional fights are not story prerequisites.

GREEN: 37 focused tests pass, 4,245 TypeScript tests pass. Lint/build/vendor pass. First full Python attempt reached 2,895 passes with one failure because this new worktree lacked the native mGBA binding; local venv now links the existing binding. Coverage: TS lines/branches/functions agent 97.18/92.91/97.61, viewer 95.13/91.07/93.90; Python rerun required after native setup. Initial RED confirmed two assertion failures (missing plotted trainer points). Real-data catalog audit retains all 437 distinct runs and renders exactly seven trainer points (four native model, three visual human), no duplicates; b300 frontier ends at Tommy. Preview on 8794 has only scratch copied logs, no experiment approvals. Browser pointer opened Tommy #15570, exact 62:34.941 and native state #15569 shown.

Main advanced independently during gates; syncing before frozen review.

Final code after main sync: 2,868 agent + 1,399 viewer + 2,906 Python tests pass (7,173 total). Lint/build/vendor pass. Coverage rerun on identical production tree: TS both stacks pass 90% in each metric; Python completion pending when sealing. Earlier coverage hit an unchanged 100ms child-startup test under simultaneous host test load (empty stdout before timeout); preserved failure, changed no source, tests or runner settings, reran full coverage normally. Native mGBA binding linked into worktree-local venv; original logs unchanged.

Browser preview: pointer Tommy and keyboard Enter Josh both open exact native state receipts; two polling cycles retain points. Desktop 1280/1440 and phone 375 screenshots (expanded/collapsed) inspected, zero console errors. Existing original comparison tab is owned by another browser session; preview is a separate tab, no original-tab repair claimed. Evidence under canonical runs/rustboro-trainers and runs/mockups/rustboro-trainers/shots. Real runs experiments audit prints nothing.
