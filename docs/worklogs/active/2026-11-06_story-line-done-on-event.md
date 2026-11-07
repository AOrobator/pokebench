# Story line done on event

Coordinator brief 2026-11-06: a place-naming line stays open until a game-confirmed story step at or inside the place, with no goal stuck forever. Milestones already carry `kind`: navigation for a place reached, story for an event. Every false done came from a navigation milestone.

The brief's at-or-inside test and its no-stuck-goal requirement reduce to one test. Strict at-place left 274b's Verdanturf line alive from T1874 to T1992 after the story moved on. Adding a story event elsewhere once the player left changed that one line in four runs. A story event after arrival is either at the place or after leaving it, so `kind==="story"` after the arrival covers both, needs no name matching, and keeps a retired line retired.

- [x] RED: `story-line-done-on-event.test.ts`, through the `HarnessTrust` header. Removing the rule and the wiring each turned a test red, then restored.
- [x] GREEN: 7 tests.
- [x] Replay, four runs. a0b4: grunt line kept T181-T271, replaced by ARCHIE at T272. 274b: Meteor Falls kept to T1261, replaced at T1262 on the confrontation; Mt. Chimney done at T1335, was T1304; Petalburg Gym kept to Norman at T1756, was T1670; Verdanturf done T1874, was T1872; Fortree Gym stays open with the gym unfinished, was T2043. 5f0f the same shape. ee2a unchanged.
- [ ] Gates, review, landing

no-open-story-goal-v1 stays off: on a0b4 T181-T271 it would still print none open on all 91 results, through its reached path.

COMMIT: `feat(agent): a story line finishes on a story event, not on arrival` (70020f1df). `just test`: 2,675 agent, 1,076 viewer, 2,965 env, 38 gateway passed; `pnpm -r lint`, env mypy (main venv), `just verify-vendor` clean. GPT round 1: a line heard at the place never retires, pre-existing, fixed under the switch since the brief rules out stuck goals. Replay unchanged.

COMMIT: `fix(agent): a line heard at the place counts from when it was heard` (d236a0f02). That commit's new test failed: a line from an unnamed speaker naming its own place never becomes a goal. The next commit uses a named speaker; 8 tests pass, and removing the fix turns the test red.

COMMIT: `test(agent): the heard-at-the-place case uses a named speaker` (240830d30). Claude review BLOCKING: a line heard at its place retired only while the player stood there, and came back open after leaving. Fix: under the switch `arrival` treats the map the line was heard on as reached, wherever the player is now; the earlier `last` change is reverted. Test leaves and returns. Replay: named lines unchanged; 274b and 5f0f each gain 7 results, MOM's opening LITTLEROOT TOWN line, retired by the next story event instead of showing until T36.
