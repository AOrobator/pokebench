# Viewer trainer and party state retention

User request: trainer card and Pokémon must remain visible through battles and missing readouts, using last known state. One bounded viewer-only repair. Preserve approved card design, replay time boundaries, genuine pregame reset, fresh roster changes and battle-health identity guards. No harness/model/gameplay changes or feature switch.

Production paths: model.ts (retained display state), frontier-recording.ts (card projection), app.ts (selected-card continuity). Tests exercise those consumers plus sparse bootstrap. No new services, dependencies, configuration or timeline marks.

- [ ] RED regression tests and commit.
- [ ] GREEN implementation, gates and background desktop/phone proof.
- [ ] Independent review, authorized queued landing and live proof.

Read-only real logs: four active runs contain 109/500/518/184 empty battle/transition samples after a populated roster, including Astra seq3546 and Qwen GPU1 seq4453 with null name/location/play clock. Card projection currently reads view.state directly. Party reducer already retains null-clock samples but accepts empty battle samples with a readable clock. Selected card also vanishes when list/card health snapshots disagree. Shared8790 PID62752 was identified and remains untouched; original operator tab not inspected to preserve focus.

RED: targeted105 tests:4 failed/101 passed; three readable-clock battle/transition/unknown lifetime regressions and incremental card projection fail as expected. An initial command accidentally selected the whole suite before build; stopped that owned process and corrected invocation.
