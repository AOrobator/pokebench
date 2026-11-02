# Eight badge mission on both arms

**Started:** 2026-11-02
**Status:** Landed on `main` at `4d78db38d`
**Operator:** The operator, 2026-11-02 — "for pokebench, lets turn this on in both arms and
land it on main … 122 min of Steven came from 'is Steven even required?' dithering;
control has no objective that names the badges."
**Review:** no lane returned a verdict; operator-ordered landing with the cloud lanes down (see Review lanes).

## Problem Statement

`eight-badge-mission-v1` is the only statement in the current recipe of the
benchmark's own success condition — all eight Gym Badges — and it runs in the
bundle only. Control's untargeted goal is `PLAY_GOAL` ("work toward defeating the
first Gym Leader in Rustboro City") or `OPEN_PLAY_GOAL` ("make as much story
progress as you can"), so the control objective never names badges at all.

Since 2026-11-01 `discovered-gym-checklist-v1` is on in both arms. It tells the
control arm that a discovered gym stays "unfinished until you earn its badges" —
a badge consequence with no badge objective above it. That is an internal
inconsistency in the control arm, not a treatment difference worth measuring.

The operator reports 122 minutes of a control run spent on "is Steven even
required?" dithering. The control mission gives the model no terminal objective
that bounds that deliberation: story progress is open-ended, badges are unnamed.
The bundle arm does not have that gap.

## Change

Recipe only: `experiments/feature-configs/current.json`.

| switch | from | to | `features` |
|---|---|---|---|
| `eight-badge-mission-v1` | `switches` | `onInBoth` | false → true |

`switches` 64 → 63, `onInBoth` 82 → 83. Registered default stays OFF
(`DEFAULT_NEXT_RUN` and `normalizeFeatures` untouched); no application code
changes. The feature bit stays registered so OFF still reproduces the prior
goal verbatim.

The mission text is unchanged by this promotion. It names no route, no future
leader identity and no Rayquaza objective, and explicit milestone targets keep
precedence — the same text the bundle has run since 2026-10-28.

Eight fixed definitions reference `featureRecipe: current`, so future launches
from any of them get the promotion: `bundle-v-control`, `bundle-v-control-2h`,
`glm53-24h-visibility-v2`, `glm53-flash-4h`, `hyperqwen-bundle-24h`,
`hyperqwen-bundle-24h-v2`, `hyperqwen-control-3h`, `qwen36-24h-visibility-off`.
Running and frozen runs keep their recorded settings. The three
`rusturf-native-*` definitions do not reference the recipe; they already embed
`eight-badge-mission-v1` as `true` in their base (both arms), so they agree with
this placement and are untouched. `state-only-decisions-v1`, whose contract
requires the mission OFF, is itself OFF in the current recipe, so no preset
validation is tripped.

## What this does not claim

No measured gameplay-benefit claim. This is **not** decision-neutral in the
strict sense: it changes what the control arm sees and is expected to change its
decisions — that is the operator's intent. What it adds is no route, future
leader identity or Rayquaza hint; the text is exactly what the bundle has run
since 2026-10-28. Promoting it raises the control floor, so a bundle-v-control
gap measured after this commit is not comparable to one measured before it. If a
later comparison shows an arm difference, this is the commit to bisect to.

## Evidence

- `packages/agent/src/play-config.ts:199-204` — ON replaces the untargeted goal
  and the initial task with `EIGHT_BADGE_GOAL`; explicit targets bypass it.
- `packages/agent/src/features.ts:771` — the registry copy previously said
  "current bundle ON and control OFF by operator approval"; updated in this
  change.
- `packages/viewer/src/fixed-definition.test.ts:104` — the placement pin
  previously required bundle-only; rewritten RED-first in this change.
- Operator report of the 122-minute Steven deliberation (2026-11-02, message
  opening this worklog). Not independently re-measured here.

## Invariants

- OFF reproduces the previous mission sentence byte-for-byte
  (`FeatureSet` default false; `playGoal`/`initialPlayTask` fall through).
- The two arms differ only by `switches`; moving the mission does not add a
  route, tool, readout block or automatic input to control.
- No running run, preset or frozen definition is rewritten.

## Verification

Focused, RED first:

```
packages/viewer  src/fixed-definition.test.ts   RED: 1 failed | 21 passed (563 ms)
  AssertionError: expected switches to not include 'eight-badge-mission-v1'
  GREEN: 22 passed (414 ms)
packages/agent   gym-campaign + features        50 passed (883 ms)
packages/viewer  fixed-definition, fixed-design, fixed-runner
                                                 386 passed across 3 files
packages/viewer  panels.test.ts                  234 passed alone (6.11 s)
```

The combined viewer run hit a vitest worker `SIGABRT` (node OOM) on
`panels.test.ts`; rerun alone under `NODE_OPTIONS=--max-old-space-size=8192` it
passed 234/234. That is a harness heap limit, not an assertion failure.

Full gate:

```
just test  → pnpm -r coverage
             agent  379 files / 5372 tests passed
             viewer 186 files / 2425 tests passed
             viewer coverage 94.54 stmts / 90.78 branch / 94.79 func / 98.19 lines
           → env pytest 4987 passed in 80.71 s
             env coverage lines 97.50 / branches 93.60 / functions 99.90
           → claude-gateway 116 passed; 99.12 / 96.22 / 100.00
           → trainer-card guard OK; 3 Playwright design specs passed
just lint  → tsc + eslint (agent, viewer), ruff/format/mypy 137 files,
             claude-gateway strict mypy — clean
just build → viewer build stamp 693261a (working tree)
```

Not run: `just verify-vendor`, `just verify-rom`, `just smoke`, `just smoke-llm`.
This change touches no vendor, ROM, game-code or server bytes — a recipe entry,
one registry description, the explainer, the README and one test — so the rungs
that exercise the game server were skipped deliberately, not passed.

`just test` rebuilt `dist` in the main checkout. No live run reads it: the
running controller executes from `/private/tmp/pokebench-fixed-875132337f5e`
and the viewers serve content-addressed builds under `~/.cache/pokebench/`.

## Review lanes

Attempted 2026-11-02, receipts rather than recollection:

- Claude CLI — `Failed to authenticate: OAuth session expired and could not be
  refreshed`.
- Codex — `model_not_found`: "The 'gpt-6.1-sol' model is not supported when
  using Codex with a ChatGPT account".
- Grok via `think-fast` — gateway `/v1/models` returns 200, chat completion
  returns HTTP 502 (local fleet holds no memory while the 24 h run is up).
- Cursor Claude — not re-attempted; standing Pro+ monthly limit recorded on
  2026-11-02 in the bound-switches worklog, resets 2026-11-17.

The operator ordered this landing directly ("turn this on in both arms and land it on
main"), which is the operator waiver for the unreachable lanes. **No reviewer
VERDICT exists for this patch**; the independent signal is the full gate above.

## Milestones

- [x] RED: placement pin requires the mission in both arms
- [x] GREEN: recipe moved to `onInBoth`, `features` true
- [x] Registry copy, explainer and README updated to match the recipe
- [x] Focused tests green
- [x] Full gate green (`just test`, `just lint`, `just build`)
- [x] Review lanes attempted and recorded
- [x] Landed `--ff-only` on `main` at `4d78db38d`, `land-done` recorded
- [x] Viewer restarted and serving the landed build (`4d78db38d`, 127.0.0.1:8790)

## Session Log

- 2026-11-02: opened from the operator directive; recipe carried the mission in
  `switches` with `features` false. Main at `693261a4c`, land board free.
- 2026-11-02: RED placement pin failed as expected (1 failed | 21 passed), then
  recipe moved to `onInBoth` with `features` true (switches 64 → 63, onInBoth
  82 → 83) and focused tests went green.
- 2026-11-02: full gate green (agent 5372, viewer 2425, env 4987, lint clean);
  review lanes attempted with the receipts above; committed `4d78db38d` on
  `claude/eight-badge-both-arms`.
- 2026-11-02: `land-join` held the lane, `git merge --ff-only` moved `main`
  `693261a4c..4d78db38d`, `land-done` released it. Post-land on `main`:
  `just build` stamps `4d78db3` clean, placement pin 22/22, `just viewer-main`
  serves `4d78db38d` on 127.0.0.1:8790 and the explainer shows "ON in both
  arms".
- 2026-11-02 self-review after landing: materialized `bundle-v-control` from the
  built dist — control and bundle produce the identical mission sentence, and
  OFF reproduces `OPEN_PLAY_GOAL`; `just fixed-run check bundle-v-control` lists
  the mission under "on in both" and reports the control base still matches.
  Corrected two claims in this worklog: the rusturf definitions already carried
  the mission `true` in base (three files, not two, and not the old placement),
  and this is a control-objective change, not "decision-neutral". Recorded the
  ladder rungs deliberately not run.
