# Bounded-input switches on both arms

**Started:** 2026-11-02
**Status:** Committed on `codex/bound-both-arms`; gate and review pending
**Operator:** The operator, 2026-11-02 — "add all of the bound switches to both arms"

## Problem Statement

Three bounded-input switches were bundle-only while their unbounded counterparts
are already present in both arms, or are trivially reachable. That leaves the
control arm carrying *larger* context than the treatment for reasons unrelated to
the treatment, which is a confound inside every bundle-v-control comparison. The
bounded study (`runs/analysis/bounded-input-20261028/measured.md`) replayed 566
recorded ID cards through the production path with **zero OFF/ON decision
mismatches**, so moving them costs no decision change.

## Change

`experiments/feature-configs/current.json` only. Registered defaults stay OFF
(`DEFAULT_NEXT_RUN` untouched); no application code changes.

| switch | from | to | features |
|---|---|---|---|
| `id-card-bound-v1` | `switches` | `onInBoth` | false → true |
| `disproved-beliefs-bound-v1` | `switches` | `onInBoth` | false → true |
| `refusal-ledger-bound-v1` | `switches` | **unchanged** | false |

switches 67 → 65, onInBoth 78 → 80.

## Excluded: `refusal-ledger-bound-v1`

`needs: "refusal-ledger-v1"`, and `refusal-ledger-v1` is itself bundle-only. The
arm tests reject the promotion outright (`Invalid play preset:
refusal-ledger-bound-v1 needs refusal-ledger-v1`). Promoting the bound would
require promoting the unbounded ledger into the control base, which *adds* a new
block to control — one entry runs about 3,000 chars and Qwen run 9e33 at turn 2417
sent 10 entries in 24,803 chars. That is a separate decision for the operator, not
a bound.

## Evidence read before the change

- Bounded replay: 566 cards, zero OFF mismatches, identical ON/OFF emission;
  largest single card 5,646 → 5,434 chars.
- Context census at a702 turn 1287: `OBSERVED INSTRUCTION MEMORY` 53,971 chars,
  `DELIVERED PERSON AND PLACE EVIDENCE` 16,451 chars, ID cards 2,929 chars.
- `DELIVERED PERSON AND PLACE EVIDENCE` fires 1,252 (a702) / 2,086 (88ea) /
  3,067 (f60d) times per run — it is the second-largest contributor, not a
  rounding error.

## Verification

Focused, no full gate (a 24h run owns the CPU; `just test` would compete):

```
cd packages/viewer && npx vitest run src/feature-config-registry.test.ts \
  src/fixed-design.test.ts src/fixed-runner.test.ts
→ 3 files, 149 tests passed
```

The first attempt failed 32 tests with the three-way promotion; the
`refusal-ledger-v1` dependency is what those failures named.

## Milestones

- [x] Arm placement moved for the two switches whose dependency holds
- [x] Focused registry/design/runner tests green
- [ ] Full gate in a CPU window + Claude/Grok/GPT review lanes
- [ ] Land `--ff-only`, then restart `just viewer-main`

## Session Log

- 2026-11-02: moved `id-card-bound-v1` and `disproved-beliefs-bound-v1` to
  `onInBoth`; `refusal-ledger-bound-v1` held back on its `needs` dependency;
  focused tests 149 passed.
