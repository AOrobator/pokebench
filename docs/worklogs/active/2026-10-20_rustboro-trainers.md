# Rustboro Gym trainer tracking reconciliation

Operator request: reconcile missing Rustboro Gym defeated-trainer milestones, backfill historical data, review, land on main, restart viewer. This explicitly includes gym trainer splits in frontier tracking, superseding the earlier optional-gym exclusion for these three trainers only.

Scope: existing Josh/Tommy/Marc native pre-clear predicates, their historical state recovery, viewer frontier catalog/ranking, regression tests, read-only run audit. Original recordings remain unchanged. No gameplay, new runs or interventions.

Source: pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, RustboroCity_Gym scripts; Roxanne calls Common_EventScript_SetGymTrainers. Existing reader correctly suppresses trainer flags after gym completion.

Plan: RED graph/ranking and historical recovery tests; GREEN smallest owner repair; full gates; frozen three-cloud-lane review; ff-only local main landing; viewer-main and live browser evidence.

Status: evidence inventory in progress.

RED: graph and native-ingestion tests now require trainer points and frontier selection; observed failure before catalog update. Real snapshot has 437 runs: b300 records Josh at 60.65 active min and Tommy at 62.58; r10 and r5 each record Josh. Human baseline already has three labeled visual reconstructions. No new decoder required if full log audit confirms no missing native marks.
