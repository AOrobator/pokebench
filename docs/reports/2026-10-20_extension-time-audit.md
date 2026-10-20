# Extension timing audit — 2026-10-20

Requested sequence: breadth audit with three read-only subagents, report, implementation, independent review, local main landing, viewer restart and live verification.

## Findings and implementation decisions

| Surface | Evidence | Required update |
| --- | --- | --- |
| Viewer trainer cards, run chooser cards, stats trainer cards and current-run plates | `workbench-view.ts:plateFacts` reads only `config.maxWallMs`; `workbench-store.ts:loadRunWith` already projects applied `extendedWallMs` | Use effective cap for denominator and time bar, including paused and ended runs. Preserve absent-extension fallback. |
| Selected live viewer card during snapshot lag | `app.ts:receive` folds acknowledgements immediately, but `cardInputs` reads a separate five-second cards snapshot | Reconcile selected card's cap with applied controls already received, without rolling back a newer snapshot or remounting controls. |
| Stats run details | `workbench-view.ts:runDetails` calls the immutable cap “Time cap” and adds the continuation total separately | Show effective Time cap, explicitly retain original evaluation cap and continuation disclosure. |
| Copy Live configuration | `nextpanel.ts:copyLive` copies only original `run_start` budget | Copy current effective limit; do not change immutable recorded configuration. |
| Viewer raw metadata | `app.ts:render` prints `start.budgets` without identifying original versus effective | Label original budgets and expose the applied effective wall limit. |
| Per-feature ON/OFF history | `history.ts:scoredRuns` matches original budgets but scores full baseline milestone list | Censor feature-history credit at the original active-time horizon; keep misses in denominators and retain full replay/frontier progress. |

## Audited paths already correct

Runtime `RunControl.wallLimit`, BudgetTimer, Governor, target guard and fixed-run lane occupancy honor applied finite extensions. Only applied acknowledgements change the cap; requests, failures and ignored controls do not. Selected viewer header/clock, extension preview, sidebar, WALL budget and Harness Config use `control.maxWallMs`. Active elapsed excludes pauses. Workbench loaders and append/cache invalidation preserve extension receipts. Fixed-ledger and experiment scoring retain the original evaluation horizon.

Replay duration is the actual recording duration, and metric-history axes follow observed samples; neither should be expanded to the requested cap. Frontier and replay retain all actual continuation progress. Next-run draft matching and preset provenance retain original limits intentionally.

The bounded `/head` endpoint omits controls before its recent-turn tail, but its consumer is recorded thinking, not the primary budget view. No budget-path repair is warranted there. CLI tail/summary do not show cap comparisons; they are outside this UI repair and do not drive UI timing.

## Regression and proof plan

Fail first on shared plate/card effective limits, live/paused/ended cases, repeated applied extensions, rejected controls, selected-card snapshot lag, copied limit, metadata disclosure, refreshed workbench projections and feature-history censoring (including exact horizon and pauses). Retain existing original-horizon experimental scoring tests. Run repository gates and cloud Claude/Grok/GPT review on a frozen candidate. Use an isolated preview with scratch recordings, exercise viewer and stats through real browser input, inspect desktop and phone screenshots, then repeat the relevant checks on the landed viewer. No live run receives an extension for testing.

## Report readback

The implementing agent reread this report before code changes. The main defect is a shared display consumer dropping an already available effective limit, plus one independent scoring consumer failing to censor continuation credit. Repairs stay within viewer presentation and read-only history scoring; no agent behavior, new timeline marks or experiments are added.
