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
- [x] COMMIT: `feat(loop-supervisor): retain faced batch interactions` (`24576f10`, GREEN)

**M3 — Gates, review, land, live proof**
- [x] Sync main and run `just test`, `just lint`, `just build`, `just coverage`, `just experiments-check`, and `just verify-vendor`.
- [x] Principles review PB1–PB13 with zero FAIL rows.
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
- 2026-10-18 8:00 PM EDT: complete pre-review gates at `24576f10`: agent 156 files / 2461 tests; viewer 84 files / 1173 tests; Python 2478 passed / 229 skipped because no ROM was configured; agent coverage 98.00/94.26/98.32/99.23 and viewer 95.40/91.46/93.83/97.64 (statements/branches/functions/lines); Python 97.48/93.42/99.43. `just lint`, `just build`, `just experiments-check` (111 entries), `just verify-vendor`, and explainer `pages-check` passed. The first coverage attempt exposed an uninitialized vendor submodule; initialized the pinned submodule and reran successfully. The worktree Python environment used the existing native `mgba` package from canonical main solely to run mypy; no tracked files changed.
- 2026-10-18 8:04 PM EDT: candidate viewer built from `24576f10` and served read-only run data on port 8792. A real Harness Config click opened the FACED INTERACTION HISTORY card's explainer. Browser checks at 1280×900, 1440×900, and 375×812 found no horizontal overflow; all three explainer sections remained present and the console had zero errors. Canonical viewer on 8790 was untouched.
- 2026-10-18 8:14 PM EDT: round-one repair mutations were each performed and restored. Removing only the `faced_sprite` attribution operand failed only “ON accepts explicit faced-sprite attribution”; removing only the person `objectKey` touch failed only “ON retains a faced person's map-local object identity”; restoring the old `briefing-exits-v1` call gate failed only the new independence case; deleting the production subscription failed the explicit one-subscriber assertion. Restored all four, then the focused file passed 8/8 and the full agent suite passed 156 files / 2464 tests.
- 2026-10-18 8:18 PM EDT: cumulative round-two candidate gates: `just test` passed agent 156 files / 2464 tests, viewer 84 files / 1173 tests, Python 2478 passed / 229 ROM-skipped; `just lint`, `just build`, `just experiments-check` (111), explainer `pages-check`, and `just verify-vendor` passed. Coverage passed at agent 98.00/94.28/98.32/99.23, viewer 95.40/91.46/93.83/97.64, and Python 97.48/93.42/99.43 (statements/branches/functions/lines where available; floor 90%). Canonical main remained clean at `b9e501df`, so no sync merge was needed.
- 2026-10-18 EDT: canonical main later advanced cleanly to `67feeac5`; merged it into the candidate as `01051a1a` before sealing round two. Exact merged-head gates passed: agent 156 files / 2464 tests, viewer 84 files / 1173 tests, Python 2478 passed / 229 ROM-skipped; `just lint`, `just build` (stamp `01051a1`), `just experiments-check` (111), explainer `pages-check`, and `just verify-vendor` all passed. Coverage passed at agent 98.00/94.29/98.31/99.23, viewer 95.40/91.46/93.83/97.64, and Python 97.48/93.42/99.43 (statements/branches/functions/lines where available; floor 90%). Canonical main was still clean at `67feeac5` after the run.

## Surprises

- Fresh managed worktrees have no dependencies. The first focused command could not find Vitest. Temporary links exposed stale workspace-package targets, so they were removed and replaced with a frozen offline `pnpm install`; dependency setup did not change tracked files.

## Multi-Model Review Log

### Round 1 — frozen `b9e501df..24576f10`, SHA-256 `8c92cf52752c47f05d4e888848d991fb7fdff7764f7bb45f6fdad2aff235388f`

- Claude-family availability: dedicated and default Claude CLI profiles were logged out. Cursor Opus 5.5, Sonnet 5.5 and Fable 5 were each usage-limited until 2026-11-17; Haiku 5.5 was also usage-limited. No Claude verdict was counted.
- Grok 4.7 High (Cursor, read-only): `VERDICT: BLOCKING`. Valid blockers: the production subscriber assertion could pass with no subscriber; `faced_sprite` and person object-id operands lacked independent falsifiers. Non-blocking: repin the blocked experiment after landing. Its claim that switch independence from `briefing-exits-v1` would be stronger than the frozen boundary contradicts the Architecture clause above and the registry's `needs:null`.
- GPT 5.6 Sol xhigh (isolated Codex, read-only; Cursor GPT was usage-limited): `VERDICT: BLOCKING`. Valid blockers: the two Grok findings, the undeclared runtime dependency on `briefing-exits-v1`, the prohibited registry prepend, operand-complete mutation evidence, and the absence of gate/browser receipts from the frozen worklog.
- Accepted fix batch: append the id in all three registries and update historical end-relative registry assertions; retain exact referenced states whenever either the exit ledger or this switch needs them; invoke attributed-interaction bookkeeping when either feature needs it; add independent `briefing-exits-v1=false`, `faced_sprite`, person-object, and live-subscriber assertions; record the pre-review gates and browser proof above. No new production domain or owner.

### Round 1 Review Synthesis

| Field | Result |
|---|---|
| Contract being proved | Explicitly attributed movement-plus-A dialogue marks only the exact faced target tried; OFF/control stay old; bundle turns it on. |
| Frozen boundary | Loop-supervisor ledger, append-only feature registries/defaults/bundle, operator explainer/card, and blocked pending entry. No raw-event, prompt, grading, experiment-launch, API, dependency, persistence or owner changes. |
| Principles adherence | PB1–PB13 table below had 8 PASS / 5 N/A / 0 FAIL, but PB10/PB13 evidence needed to be copied into the frozen worklog and PB4's append-only claim needed repair. |
| Consensus findings | Both completed lanes found the vacuous subscriber assertion and missing `faced_sprite`/object-id falsifiers. |
| Contradictions | Grok treated exit-feature independence as out of scope and did not block the prepend; the written Architecture plus `needs:null` make independence in-contract, and the loaded feature-switch skill explicitly vetoes reordering. GPT's findings control on both points. |
| Unique findings | GPT alone found the hidden exit-feature dependency, append-only violation, and missing frozen evidence receipts; each was verified directly. |
| Unsupported claims | None retained. Grok could not recompute the digest because its command execution was unavailable, so its identity statement is not used as the digest receipt. |
| Missing evidence | Round-two full gates after the fix batch; literal green verdicts from every selected reviewer, including the authorized replacement for unavailable Claude. |
| Test quality | Check 1 seam and check 7 payload fixed with defined-loop, subscriber-count, PC-present and TV-absent assertions. Check 2 now has independent mutations for the attribution operand, object-id statement, exit-independent call gate and production subscription. Checks 3–6 pass/inapplicable: no globals/shared pollution/concurrency/suppression. Check 8: nine constant events, bounded 64-state map, no fixture I/O/whole-state growth. Check 9: no production bound filled. |
| Finding disposition | Five blocking classes accepted and fixed inside scope; zero scope expansions, security defects, or hardening changes. Experiment repin remains an expected landing bookkeeping step. |
| Convergence | Round 1 produced blockers. The cumulative fix changes no production domain; round 2 is allowed under the two-round cap. |
| Disposition | Rerun full gates, rewrite principles evidence, seal a new packet, and rerun the selected cloud/fallback roster. |

## Principles Adherence (round-two candidate)

| ID | Score | Evidence / reason |
|---|---|---|
| PB1 | PASS | The defect and fixtures use recorded dialogue/state events from cdb1; no model narration is graded as game progress. |
| PB2 | N/A | No benchmark run is launched or filtered and no terminal accounting changes. |
| PB3 | N/A | No performance claim is made; the entry remains blocked and unlaunched. |
| PB4 | PASS | The default-off switch is appended to all three owned registries, recorded in run metadata, mapped to a Harness Config explainer, and independently usable without `briefing-exits-v1`. |
| PB5 | PASS | The pending standalone entry isolates only this switch; bundle inclusion is the operator-requested aggregate treatment, not a standalone causal claim. |
| PB6 | PASS | At most 64 exact recorded states are retained only when the exit ledger or this switch needs them; the new fixtures process nine constant-size events. |
| PB7 | PASS | Exact `state_seq`, `speaker_source`, target coordinates and replay evidence drive the repair; raw events are unchanged. |
| PB8 | N/A | No model-call validation, retry, fallback or stop behavior changes. |
| PB9 | PASS | Ambiguous/missing attribution remains unchanged; the fix adds no guessed speaker heuristic and all round-one defects had mechanically determined resolutions. |
| PB10 | PASS | No skip, retry, weakened threshold or exclusion. Operand-level and subscriber deletion receipts are retained above; complete gates are rerun after the fix batch. |
| PB11 | N/A | No dependency API changes; pinned vendor verification is part of the gates. |
| PB12 | N/A | No ROM or protected-path access. |
| PB13 | PASS | RED and GREEN commits, worklog, full gates, visual proof, blocker synthesis, fix batch and round-two reviews close the loop. |

Summary: 8 PASS / 5 N/A / 0 FAIL. Blocker: no.

## Boy Scout Log

- None.

## Archive Milestone

- [ ] ASK USER
