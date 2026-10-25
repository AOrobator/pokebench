# Viewer trainer and party state retention

User request: trainer card and Pokémon must remain visible through battles and missing readouts, using last known state. One bounded viewer-only repair. Preserve approved card design, replay time boundaries, genuine pregame reset, fresh roster changes and battle-health identity guards. No harness/model/gameplay changes or feature switch.

Production paths: model.ts (retained display state), frontier-recording.ts (card projection), app.ts (unfinished-card continuity), trainer-card.ts (explicit selection for recorded peer cards without changing artwork). Tests exercise those consumers plus sparse bootstrap. No new services, dependencies, configuration or timeline marks.

- [ ] RED regression tests and commit.
- [ ] GREEN implementation, gates and background desktop/phone proof.
- [ ] Independent review, authorized queued landing and live proof.

Read-only real logs: four active runs contain 109/500/518/184 empty battle/transition samples after a populated roster, including Astra seq3546 and Qwen GPU1 seq4453 with null name/location/play clock. Card projection currently reads view.state directly. Party reducer already retains null-clock samples but accepts empty battle samples with a readable clock. Selected card also vanishes when list/card health snapshots disagree. Shared8790 PID62752 was identified and remains untouched; original operator tab not inspected to preserve focus.

RED: targeted105 tests:4 failed/101 passed; three readable-clock battle/transition/unknown lifetime regressions and incremental card projection fail as expected. An initial command accidentally selected the whole suite before build; stopped that owned process and corrected invocation.

GREEN implementation: retained cardState fields are independent of raw latest state; empty battle/field_transition/unknown samples cannot erase a known roster, even with a readable clock. Full and incremental card loaders share it. Existing sparse bootstrap uses the same party predicate. Known-live cards and the selected unfinished run survive health gaps; unrelated offline history stays excluded and ended peers leave the row. Existing REPLAY/dotless state is used for unconfirmed liveness, with explicit actual selection passed to the unchanged renderer design. No protected fixtures, assertions or baselines changed.

Verification so far: targeted consumers pass; complete agent4448/viewer2019/Python4425 coverage suites pass at agent99.17/92.76/97.60, viewer98.20/91.61/95.34, Python97.47/93.58/100 (lines/branches/functions). Full lint passes. Vendor verification passes. Initial Python run lacked local mgba binding; fixed isolated environment using existing installed module, then4425 passed. An overlapping-gate run timed out unchanged panels/queue tests; subsequent ordinary test run got2 of3 frames in unchanged server.test.ts socket test. No retries/sleeps/test changes/timeouts/serialization introduced; current coverage run passes all2019. Frozen-source final ordinary gate still required; no flake repair claimed.

RED evidence: f72b4d5b1 introduced4 failures/101 passes. New App continuity test failed before app change. Performed deletions of battle, transition-screen, name, location, reset, card-consumer, health-status, list-health and list-continuity paths each failed, restored; selected-aria override deletion also failed, restored. Receipts in ignored runs/retention-proof.

Headless browser real immutable Astra prefix ending at battle state3546: retained trainerA and TorchicLv5 rather than blank card; party details from3545 and battle HP/status from3546.1280/1440/375, pointer/keyboard party tabs,3 card polls each, zero page errors. Initial scratch browser read live frames through existing websocket behavior; corrected proof blocks that socket in browser and verifies recorded prefix frame003483_0.png only. Original operator tab remains uninspected to preserve focus. Final-build refresh and screenshot inspection pending. No gameplay writes, new runs or shared8790 refresh.

Coordination via talk-to-claude: no main hold; viewer-timeout owner has next refresh if ahead on board. Shared served checkout=/private/tmp/pokebench-viewer-capture-f6da68c. No refresh at19:30EDT.
