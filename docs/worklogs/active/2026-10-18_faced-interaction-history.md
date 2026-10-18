# Worklog: faced-interaction-history-v1

Branch `codex/faced-interaction-history-v1`, based on main `b9e501df`. The operator asked on 2026-10-18 to improve the loop supervisor's false "untried" history for an already-read television and include the fix in the bundle.

## Problem Statement

In control run `2026-10-18T01-30-48_qwen36-gpu1_cdb1`, turn 84 sent `LEFT, LEFT, LEFT, UP, A` in GREEN's HOUSE 2F. The recorded dialogue pages attribute "MOM might like this program" and "Better get going!" to the faced television at (4,1). Starting at turn 93, the loop supervisor truthfully summarized the batch as dialogue shown but falsely listed the same television under "not tried yet." `SupervisorBriefing.label` marks a faced target only when the whole requested batch is exactly one `A`; a movement-plus-`A` interaction therefore never reaches the exploration ledger.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, agent-observability, feature-worklog, execute-worklog, close-the-loop, pokebench-experiment-design (correctness tier: deterministic recorded-evidence bug; no standalone cohort needed before the bundle comparison).

## Architecture

Add default-off switch `faced-interaction-history-v1`. With the switch on, the supervisor uses the first auto-advanced dialogue page only when its recorder attribution is `faced_target` or `faced_sprite`, looks up that page's exact recorded state, resolves the target faced in that state, and marks that target tried. Background/sign targets use their map tile; people also retain their map-local object identity. The original single-`A` path is unchanged. The control arm leaves the switch off; `bundle-v-control` flips it on in the bundle arm. The switch has no hard feature dependency: it can safely retain history even when no supervisor surface currently renders that history.

## Invariants

- **INV-1 — OFF is byte-compatible:** with the switch off, the recorded TV remains in the old untried list. Test: replay the production-shaped turn-84 event sequence with the switch off.
- **INV-2 — Exact evidence only:** with the switch on, only a page explicitly attributed to a faced target/sprite marks the target tried. Test: the recorded faced-target page removes the TV while another untouched object remains; the same page with no faced attribution leaves the TV untried.
- **INV-3 — Exact interaction state:** movement earlier in the batch cannot make the supervisor mark the target faced before the batch. Test: start the call at (7,2) facing down, then attribute the page from (4,2) facing up; only the television at (4,1) is removed.
- **INV-4 — Production delivery:** the production `loopSupervisor` subscriber path receives the switch and produces the corrected note. Test through `play-wiring.loopSupervisor`.
- **INV-5 — Experimental isolation:** defaults and the fixed control arm remain off; only the bundle arm flips the switch. Test registry, normalization, legacy flags, the pending entry, and `experiments/fixed/bundle-v-control.json`.

## Security Review

No new tool, file read, network path, emulator mutation, or private model reasoning. The fix consumes typed events already recorded for model-visible dialogue and restricts state changes to explicit recorder attribution. Raw run logs remain unchanged.

## Milestones

**M1 — RED: recorded TV regression**
- [x] Add OFF/ON, no-attribution, and production-wiring tests from cdb1 turn 84.
- [x] Run the focused test and observe the ON assertions fail while OFF remains green.
- [x] COMMIT: `test(loop-supervisor): cover batched faced interactions` (`2ed03f30`, RED)

**M2 — GREEN: switched fix, bundle, explainer, pending entry**
- [x] Register `faced-interaction-history-v1`, default off, and wire the exact page attribution.
- [x] Add the switch to the bundle arm only and register its pending correctness-tier entry.
- [x] Add the self-contained explainer, feature-card link, index entry, readiness row, and serving tests.
- [x] Delete the switched implementation once, observe the focused ON and production tests fail, restore it, and record the receipt.
- [x] Run focused tests and `just pages-check`.
- [ ] COMMIT: `feat(loop-supervisor): retain faced batch interactions` (GREEN)

**M3 — Gates, review, land, live proof**
- [ ] Sync main and run `just test`, `just lint`, `just build`, `just coverage`, `just experiments-check`, and `just verify-vendor`.
- [ ] Principles review PB1–PB13 with zero FAIL rows.
- [ ] Three cloud review lanes reach LGTM on one frozen packet within the two-round cap.
- [ ] Fast-forward local main to the reviewed head and record the merge SHA.
- [ ] Restart the main viewer once it is safe, then verify the feature-card explainer link and the merged build stamp.

## Closing the Loop

The deterministic proof is a production-shaped replay of cdb1 turn 84 through the real supervisor subscriber. The explainer must pass `pages-check`, render at 1280, 1440, and 375 widths, and open from the Harness Config feature card. A new measured cohort is not launched: this is correctness-tier repair and the operator asked to include it in the already defined `bundle-v-control` treatment arm. No experiment approval is created.

## Session Log

- 2026-10-18 EDT: operator approved the fix and bundle inclusion. Read-only trace confirmed cdb1 tool result seq 1577 showed two television pages, while loop note seq 1776 listed the television as untried. Source trace found the whole-request `names.length === 1 && names[0] === "A"` restriction.
- 2026-10-18 7:35 PM EDT: focused RED run: 2 failed, 2 passed. OFF and missing-attribution cases passed; ON direct construction and production `loopSupervisor` delivery both still listed `television at 4,1` as untried.
- 2026-10-18 7:42 PM EDT: focused GREEN run: 5 passed. Agent registry suite: 38 passed. Viewer linkage/default suite: 194 passed. `just pages-check docs/explainers/faced-interaction-history-v1.html`: pass. `just experiments-check`: 111 experiments, pass.
- 2026-10-18 7:47 PM EDT: wiring deletion proof temporarily disabled the switched attribution block. The focused suite returned the same two failures—ON direct construction and production delivery—while OFF, no-attribution, and registry isolation stayed green. Restored the block immediately.

## Surprises

- Fresh managed worktrees have no dependencies. The first focused command could not find Vitest. Temporary links exposed stale workspace-package targets, so they were removed and replaced with a frozen offline `pnpm install`; dependency setup did not change tracked files.

## Multi-Model Review Log

- Pending.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER
