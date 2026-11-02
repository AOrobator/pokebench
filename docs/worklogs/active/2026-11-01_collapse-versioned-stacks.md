# Worklog: collapse the 15 multi-version feature stacks

## Problem Statement

Operator (2026-11-01): 15 concepts are each registered as two or three switches
(`auto-talk-v1..v3`, `navigation-refusal-reasons-v1..v3`, `caught-nickname-prompt-v1/v2`,
`exit-labels-v2/v3`, `explorer-guidance-v1/v2`, `harness-trust-v1/v2`,
`heal-before-trainers-v1/v2`, `instruction-ledger-v1/v2`, `just-in-time-prompt-v1/v2`,
`low-hp-trainer-warning-v1/v2`, `semantic-navigation-v1/v2`, `stale-story-goal-v1/v2`,
`surf-gated-exits-v1/v2`, `text-only-supervisor-v1/v2`, `trainer-sight-check-v1/v2`).
Exactly one flag per concept should survive — the newest — with the older definitions and their
dead code paths deleted, the ids removed from `experiments/feature-configs/current.json` and from
presets, and a registry test preventing a new version of an already-collapsed stack.

## Skills Loaded

- `.claude/skills/feature-switch/SKILL.md` (registry contract; "Never reorder this list")
- `.claude/skills/execute-worklog/SKILL.md` conventions (worklog shape)
- `pokebench-agent-workflow` (gate ladder, worktree isolation)

## Outcome

**No stack was collapsed.** 2 of 15 are blocked by behaviour; 13 of 15 are blocked by the
registry's append-only contract. The registry invariant test landed instead, recording the debt
and failing on any new version of any stack.

Baseline: `3623a82a4`, agent suite 373 files / 5319 tests green; viewer 183/184 files,
2390/2407 tests (one vitest worker died with `ChildProcess.emitUnexpectedExit`, 17 tests lost —
flake, not an assertion).

## Blocker A — behaviour (2 stacks): the newest version is not a superset

### `auto-talk` v1/v2/v3 — blocked
`auto-talk.ts:66` `const due=this.features["auto-talk-v3"]?await this.quietDue(signal):this.due();`
v3 does not extend v1's trigger, it **replaces** it (a quiet stretch on the free field instead of a
loop record), and v3 is **OFF** in the current recipe while v1 and v2 are ON. `auto-talk.ts:211`
`if(!features["auto-talk-v3"]&&(!(features["fixed-point-breaker-v1"]||...)))` shows the two
triggers are alternatives, not layers. Collapsing to v3 would turn on an off trigger and remove the
live loop trigger; collapsing to v1 would delete the live `auto-talk-v2` skip-beaten rule
(`auto-talk.ts:107`, which v3's "never a trainer the game still lists as unbeaten" only re-states
inside its own trigger). No version subsumes the live pair.

### `navigation-refusal-reasons` v1/v2/v3 — blocked
Three independently wired layers in `navigation.ts`: `refusalReasons` (v1, the why-and-what-would-work
paragraphs), `windowReasons` (v2, the route-leaves-the-local-window line) and `waypointAdvice`
(v3, exploratory edge tiles). All three are ON. v3's own copy says "Off: existing v2 tile refusal and
exit-reachability person advice are byte for byte unchanged", and `navigation.ts` gates it through a
separate `waypointAdvice` port. Keeping v3 alone would delete v1's and v2's refusal text, which is
live output.

## Blocker B — the registry is append-only (13 stacks)

The 13 remaining stacks are behavioural supersets (evidence per stack below), so the *decision* is
"delete the older ids". The deletion itself is not safe in this repo:

1. `SWITCHABLE_FEATURES` is append-only by contract (`test-support/legacy-features.ts`: "SWITCHABLE_FEATURES
   is append-only. These fixtures were frozen when map-observability-v1 was the last switch") and
   `FROZEN_SWITCH_COUNT=SWITCHABLE_FEATURES.indexOf(LAST_FROZEN_SWITCH)+1` derives the legacy fixture
   boundary from an index. Removing an entry from the middle moves that boundary, so `LEGACY_ALL_ON` and
   `BATCH_DEFAULTS_OFF` shift and the historical prompt fixtures are rebuilt from the wrong set. Recorded
   presets are name-keyed and never read the index, so they are unaffected — the fixture boundary is what
   turned the trial deletion red.
2. More than a hundred absolute position pins renumber. Measured by grep over
   `packages/agent/src/**/*.test.ts`: 73 `SWITCHABLE_FEATURES.at(N)`, 36 `indexOf(id)).toBe(N)` and 26
   `SERVER_FEATURES.at(N)`, plus the `.at(-N)` pins.
3. `FeatureSetSchema` is `{additionalProperties:false}`, so every byte-pinned recorded artifact that
   names a retired id stops parsing: the control base `whole-map-bundle-fd95.json` (sha256 pinned in
   `current.json`, in use by the two live runs), the `experiments/fixed/*` arm definitions and the
   `test-support/*.json` bundles.

Measured: deleting **one** id (`text-only-supervisor-v1`, one of 320) turned
**124 of 373 agent test files red, 154 tests** (`/tmp/agenttest.log`), with failures in unrelated
modules (`adjacent-tiles`, `bag-healing-items`, `battle-menu-loop`) reading
`expected 'battle-menu-loop-v1' to be 'bag-healing-items-v1'` and `expected 315 to be 316` — every id
after the deletion point shifted by one. That stack was reverted rather than patched forward.

Collapsing therefore needs a retirement mechanism, not a deletion: keep the id at its position in
`SWITCHABLE_FEATURES` and `FeatureSetSchema` as an inert tombstone (accepted, always false, no
`FEATURES` behaviour entry, no code reads), which preserves every position, every recorded preset
and every pinned artifact. That is a registry design change and needs operator sign-off.

## Per-stack findings (verdict the work requires)

| stack | live in `current` | newest | verdict if the contract allowed it |
| --- | --- | --- | --- |
| auto-talk | v1 ON, v2 ON, v3 OFF | v3 | **blocked**: v3 replaces v1's trigger, v3 is OFF |
| navigation-refusal-reasons | v1,v2,v3 ON | v3 | **blocked**: three independent refusal layers, all live |
| caught-nickname-prompt | v1,v2 ON | v2 | v2 needs v1; v2 = v1 detection + interface projection → delete v1 |
| exit-labels | v2,v3 ON | v3 | v3 needs v2; "Off: exit-labels-v2 output unchanged" → delete v2 |
| explorer-guidance | v1 OFF, v2 ON | v2 | parallel section; v1 already OFF → delete v1 (no-op in the recipe) |
| harness-trust | v1,v2 ON | v2 | v1 is the wrapper (`withHarnessTrust(...,features["harness-trust-v1"],...)`), v2 selects sub-options → fold base, delete v1 |
| heal-before-trainers | v1,v2 ON | v2 | v1 wraps, v2 replaces its paragraphs → fold base, delete v1 |
| instruction-ledger | v1 OFF, v2 ON | v2 | v2 does not need v1; v1 already OFF → delete v1 |
| just-in-time-prompt | both OFF | v2 | v2 re-uses v1's scoping internally (`{...features,"just-in-time-prompt-v1":true}` in `stableJitPrompts`) → scoping must become a parameter, then delete v1 |
| low-hp-trainer-warning | v1,v2 ON | v2 | v1 wraps, v2 adds the story-battle gate → delete v1 |
| semantic-navigation | v1 OFF, v2 ON | v2 | `semanticNavigation()` ORs both; v1 already OFF → delete v1 |
| stale-story-goal | v1,v2 ON | v2 | v2 needs v1; v2 adds `retireLab`/`stageBound` options → delete v1 |
| surf-gated-exits | v1,v2 ON | v2 | v2 needs v1; v2 adds destination-map arrival reach → delete v1 |
| text-only-supervisor | v1,v2 ON | v2 | v2 needs v1; v1 = note machinery, v2 = stopping-policy wording → delete v1 (collapsed and reverted, see Blocker B) |
| trainer-sight-check | v1,v2 ON | v2 | v2 needs v1; v2 extends the check to `navigate_to_target` → delete v1 |

`instruction-ledger-v1/v2` is not `instruction-goal-ledger-v1`; `exit-labels` has no v1. Both were
respected.

## What landed

`packages/agent/src/versioned-stacks.test.ts` — the registry invariant:

- `OPEN_STACKS` records the exact id set of each of the 15 open stacks. It ratchets **down only**:
  collapsing a stack means deleting the older ids *and* that entry in the same commit.
- A base with more than one version that is not in `OPEN_STACKS` fails ("keeps at most one version per
  concept"), so a v4 on an already-collapsed stack fails.
- A version added to a recorded stack fails the exact-set pin.
- Two extra guards: each recorded stack is listed oldest-first (so "the last id is the survivor" is
  unambiguous), and every recorded id resolves through `featureInfo`.

RED evidence (real, captured before the commit):

- With `OPEN_STACKS = {}` the first test fails and names all 15 duplicate bases
  (`2 failed | 3 passed`), e.g.
  `auto-talk: auto-talk-v1, auto-talk-v2, auto-talk-v3`,
  `navigation-refusal-reasons: navigation-refusal-reasons-v1, ...-v3`.
- With a real `auto-talk-v4` added to `features.ts` the second test fails
  (`auto-talk: recorded auto-talk-v1, auto-talk-v2, auto-talk-v3 but features.ts has
  auto-talk-v1, auto-talk-v4, auto-talk-v2, auto-talk-v3`), then the flag was removed again.

GREEN: 5/5 in `src/versioned-stacks.test.ts`.

## Gates

Every figure below came from a command executed in
`/private/tmp/pb-collapse-versioned-stacks` on `claude/collapse-versioned-stacks`.

- `just verify-vendor` — `vendor OK: .../env/vendor/continual-harness` (exit 0).
- `just verify-rom` — `ROM OK: /Users/user/.roms/pokemon-emerald.gba` (exit 0).
- `just lint` — exit 0. `tsc --noEmit` + eslint on both packages, ruff check/format, mypy on
  `pokebench_env` and `mypy --strict` on the claude-gateway sources ("Success: no issues found in
  3 source files").
- `just test` — the test suites passed: agent `374 files / 5324 tests` (one more test file than the
  373/5319 baseline, this worklog's), viewer `184 files / 2407 tests` (the baseline's 17-test worker
  crash did not reproduce).
  - Coverage floors (90) met on both stacks: `pokebench_env` lines 97.50 % / branches 93.60 % /
    functions 99.90 %; `claude-gateway` lines 99.12 % / branches 96.22 % / functions 100.00 %.
  - TypeScript coverage: agent 96.43 stmts / 92.47 branch / 97.5 funcs / 99.07 lines; viewer
    94.6 / 90.81 / 94.93 / 98.28.
- **`just test` exited 1. It did not go green**, and this branch does not claim it did. Two
  environment-dependent steps failed, neither caused by this change:
  - `just trainer-card-check` needs ROM-derived art at `runs/sprites/trainer-card-v1`, which is
    generated (gitignored) and absent in a fresh worktree *and* in the main tree (0 B there).
    Building it — `python scripts/trainer-card/build_art.py runs/sprites/trainer-card-v1 --rom
    $HOME/.roms/pokemon-emerald.gba` ("5 tiers x 3 cards, 14 trainers, 387 icons, font; all verified
    against ROM") — makes the check pass: `3 passed`.
  - `tests/tooling/test_viewer_restart.py::test_the_viewer_outlives_the_session_that_restarted_it`
    failed once in a full run with `gameplay process(es) 97807 did not survive the restart` while two
    live benchmark runs were on the machine, and passes alone (`2 passed in 2.91s`). Load/state
    sensitive, not related to a test file and a markdown file.

## Next step (needs operator sign-off)

Retire, do not delete: keep each older id at its current position in `SWITCHABLE_FEATURES` and
`FeatureSetSchema` as an inert tombstone (accepted, forced false, no `FEATURES` behaviour entry, no
reader), delete the older code paths, and drop the ids from the live recipe and from `OPEN_STACKS`
here. That preserves every position pin, the legacy freeze boundary and every recorded bundle and
control base while leaving one live switch per concept — the 13 behavioural-superset stacks can then
collapse one commit each, and `auto-talk` / `navigation-refusal-reasons` stay open until a version
that actually subsumes them exists.

## Review record (advisory — the required lanes were blocked)

The three cloud lanes `CLAUDE.md` requires could not run: Claude CLI is over its usage limit (resets
2026-11-02 22:00), Cursor Claude and Grok are over the monthly spend cap (resets 2026-11-17), and Codex
returns `model_not_found` for every gpt model. This branch therefore has **no** lane review and must never be
described as reviewed. Two advisory read-only reviewers substituted, as in
`2026-11-01_landing-waiver-both.md`; their verdicts are advisory by definition.

| round | scope | verdict |
| --- | --- | --- |
| 1 | behaviour, reproducibility, prompt byte-identity | LGTM — confirmed the append-only anchor and the closed `FeatureSetSchema`, and that the ratchet is not tautological; corrected this worklog's "163" pin count as unreproducible |
| 2 | test quality, gate honesty | **BLOCKING** — the order test validated `OPEN_STACKS` against itself, one test was implied by another, both helpers were exported as API from a `.test.ts`, and this worklog's "all green" contradicted its own `exit 1` |

All four findings are fixed in the commit that adds this section: the order test now compares the recorded
list against registry order read from `FEATURES` (mutation: reversing `auto-talk` fails it), the redundant
test is gone, the helpers are module-local, and the gate section above states the recipe exited 1.

Unresolved and left visible rather than papered over: this worklog reports viewer branch coverage 90.81 %
where the two sibling branches report 90.83 % for the same base. This branch touches no viewer source, so one
of the three measurements is wrong. It is recorded as measured, not reconciled.

