# Bounded-input switches on both arms

**Started:** 2026-11-02
**Status:** Landed on `main` at `b592e291e`
**Operator:** The operator, 2026-11-02 — "add all of the bound switches to both arms"
**Review:** no external lane returned a verdict; operator waived Claude and
GPT/Codex in chat, Grok unreachable. See Review lanes below.

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

Focused, then the full gate:

```
cd packages/viewer && npx vitest run src/feature-config-registry.test.ts \
  src/fixed-design.test.ts src/fixed-runner.test.ts
→ 149 passed
just test
→ coverage lines 99.12% / branches 96.22% / functions 100.00% (floor 90)
→ viewer build stamp b592e29, trainer-card guard OK,
  3 design-tests Playwright specs passed
```

The first focused attempt failed 32 tests with the three-way promotion; the
`refusal-ledger-v1` dependency is what those failures named.

`just viewer-main` restarted the persistent viewer; it serves
`b592e291e` on 127.0.0.1:8790.

## Review lanes

No lane returned a verdict. Recorded rather than implied:

- Claude CLI — 7-day rate limit at 100%, overage out of credits
  (`rateLimitType: seven_day`, status rejected).
- Cursor Claude fallback — Pro+ monthly usage limit, resets 2026-11-17.
- GPT/Codex — usage limit, resets 2026-11-04 01:36.
- Grok via `think-fast` / `think-swarm` — HTTP 502, the local fleet has no
  memory while the 24h bundle run holds it.

Operator waived the Claude and GPT/Codex lanes for this patch in chat on
2026-11-02. The Grok lane is unreachable, not waived-and-passed. **No reviewer
VERDICT exists for this patch**; the only independent signal is the full gate.

Note for a future patch: the two switches were promoted on decision-parity
evidence, not on a measured gameplay benefit. If a later run shows a behavioral
difference between arms, this is the commit to bisect to.

## Milestones

- [x] Arm placement moved for the two switches whose dependency holds
- [x] Focused registry/design/runner tests green (149)
- [x] Full gate green
- [x] Operator waived the unavailable review lanes
- [x] Landed `--ff-only` on `main` at `b592e291e`, `land-done` recorded
- [x] Viewer restarted and serving the landed build

## Session Log

- 2026-11-02: moved `id-card-bound-v1` and `disproved-beliefs-bound-v1` to
  `onInBoth`; `refusal-ledger-bound-v1` held back on its `needs` dependency;
  focused tests 149 passed.
- 2026-11-02: rebased onto `7658621fc` (main had advanced one commit), full gate
  green, operator waived the unavailable Claude and GPT/Codex lanes, landed
  `--ff-only` as `b592e291e`, viewer restarted on the landed build.
