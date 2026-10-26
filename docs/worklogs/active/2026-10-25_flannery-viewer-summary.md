# Flannery viewer summary

User request: Figure out why Flannery is missing in the viewer and fix it without interrupting Astra. Scope: viewer compact SPLITS THIS RUN summary, controls.ts and direct tests/browser proof. No game input, run/process restart, harness behavior, trainer-card design, timeline additions, catalog reordering or source-log edits.

Diagnosis: real Astra 429f native FLANNERY_DEFEATED #82758, LAVARIDGE_GYM_COMPLETE #82791 and HEAT_BADGE #82792 are present in raw state, recording, milestones API and cards API. Headless live page confirms complete trace and trainer card show gym aftermath but compact summary shows METEORITE RECEIVED. runSplits sorts MILESTONE_ORDER, whose optional rewards occur after gym milestones; compact takes last sorted entry instead of furthest campaign checkpoint. Proposed repair selects furthest reached FRONTIER_MILESTONES entry, preserving expanded full history, next checkpoint and optional evidence.

Validation plan: RED direct compact rendering for recorded projection and native reduction, including optional and unknown later-sorted rows; exact unchanged full-history evidence, unknown/optional-only no false campaign credit; GREEN and performed selector mutation; full gates, protected trainer-card check, frozen review, isolated desktop/mobile browser and live proof. Original user tab remains untouched; headless reproduction only.

Before receipt: runs/reviews/flannery-viewer/before.html and before.png in canonical ignored root. Astra gateway70711/launcher71232/server71239 alive, 8790 listener36307, served807dde160. Read-only API currently includes all four gym/reward splits.
