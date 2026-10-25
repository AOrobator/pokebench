# Capture input and nickname coherence

Problem: Astra 429f pinned aacff237 observed registration and nickname YES/NO as battle_resolving. Existing capture switches were OFF. Native archive replay establishes existing decoders recognize both; nickname active_ui remains contradictory even with V1 ON.

Authorization: The operator approved enabling existing capture switches in both arms and adding a versioned nickname coherence fix (2026-10-25). One bounded milestone; no measured-run modification, gameplay, process changes, messages or shared refresh. Landing not included in this branch milestone.

Skills loaded: feature-switch, feature-explainer, agent-observability, pokebench-game-state, trace-forensics. Source: clean pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, Cmd_trygivecaughtmonnick and Task_HandleCaughtMonPageInput; US ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7.

Architecture: retain V1 recognition/wait ownership. V2 depends on V1 and projects its verified ready nickname prompt into ActiveUi before all readout/event consumers. No automatic answers or batch-policy changes. Maintained current recipe promotes dex V1, nickname V1 and V2 in both arms. New omitted V2 remains OFF for historical compatibility.

Invariants: V2 OFF preserves prior state/readout exactly. ON only projects ready, diagnostic-free, battle-owned nickname YES/NO. Invalid/transitional/unrelated owners retain prior behavior. Both-arm activation belongs only to current recipe; frozen artifacts unchanged. No RAM writes.

Security: no new endpoints, tools, subprocesses or input policy. Local self-contained explainer only.

## Milestone
- [x] RED: native-backed prompt projection and real recipe materialization.
- [x] GREEN: registry, production server wiring, projection, shared recipe and explainer.
- [x] Tests, lint, build, coverage and wiring deletion proof.
- [x] Independent review complete; native gameplay proof remains pending (no new gameplay authorized).

## Closing the loop
Use retained archives from 429f and existing native-derived fixtures; no new gameplay. Later isolated native validation requires explicit launch authorization. Review/commit/landing status reported separately.

## Session log
- Read repo rules and current worklog. Created isolated worktree from main; measured run remains pinned and untouched.

## Surprises
- Nickname V1 corrects battle.prompt and wait phase, but active_ui performs a separate battle read without turn_action_prompt. V2 addresses that projection only.

## Multi-model review log
Pending.

## Boy Scout log
None.

## Archive
User gated; not requested.

- RED: production archive tests fail for all three ready cursors and missing server default (4 failed, 7 passed). Initial attempt lacked ROM environment and is excluded. Native archive fixtures bind source run/sequence/hash; no ROM included.

## Principles adherence
| ID | Result | Evidence |
|---|---|---|
| PB1 | PASS | Five paired RAM/frame observations ground diagnosis; no model narration used as grading. |
| PB2 | PASS | Original run and failures retained; no log rewriting. |
| PB3 | PASS | Archive correctness only; no benchmark benefit claim or new runs. |
| PB4 | PASS | Separate registered V2, server metadata, explainer and recipe receipts. |
| PB5 | PASS | One nickname ownership projection; shared activation explicitly approved. |
| PB6 | N/A | No context budgeting or long-run memory change. |
| PB7 | PASS | State ActiveUi reaches existing state/event and model-readout serialization; retained archive delivery fixture. |
| PB8 | PASS | No retries or automatic answers added; invalid owners remain unchanged. |
| PB9 | PASS | User selected both-arm activation and permitted isolated code review. |
| PB10 | PASS | RED archive failures, GREEN, wiring deletion fails then restores; no skipped tests or threshold changes. |
| PB11 | PASS | Exact ROM hash, pinned source and real archive fixtures; vendor pin unchanged. |
| PB12 | PASS | ROM resolved from external .roms path through POKEBENCH_ROM; no copied ROM. |
| PB13 | PASS | Branch milestone tracked; review and delivery states remain distinct; no landing/live claim. |

- RED commit 788bf0dab. GREEN archive tests 11 passed; existing capture tests included 28 passed. Full Python suite 4076 passed. Full agent suite 4407 passed before addition of one extra archive delivery test; focused delivery file 60 passed afterward. Viewer 1955 passed. Build passed; final build/lint and coverage subsequently passed.
- Initial broad Python run started before vendor checkout completed (412 failures/12 errors); discarded as setup failure. Nonrecursive vendor checkout succeeded at bbab97ad; recursive init encountered an unrelated vendor nested gitlink without a URL and is not used. No vendor source edits.
- V2 wiring deletion receipt /tmp/caught-nickname-v2-wiring-deletion-1.log failed at the intended three native ownership assertions; restored receipt /tmp/caught-nickname-v2-wiring-restored-1.log passed 11 tests.

- Coverage gates passed: agent 4408 tests, lines/branches/functions 99.17/92.74/97.61%; viewer 1955 tests 98.20/91.80/95.37%; Python 4076 tests 97.00/93.02/99.20%. Python ruff/mypy, build and vendor checks passed; final TS lint passed. All floors 90%.
- Explainer: self-contained check passed; tracked card mapping and exact-byte route tests passed. Headless desktop/phone rendering; adjusted hash wrapping and diagram scrolling after phone inspection. Canonical served click not yet claimed.

## Review round 1 (frozen implementation 0c54ff72d)
Packet base 63e47426b03a427361467040ebf0741740cade79; SHA256 85ead4f263ce851f10ee239199b9f31d13e74d1cac5cc304ba364d5d49640b99. Claude CLI and isolated GPT reviewer: VERDICT: LGTM. Grok 4.7 High and Grok 4.5 Cursor attempts both returned account usage-limit ActionRequiredError, no verdict. Normal cloud roster incomplete; no self-merge authorization.

Standing fallback: fresh gpt-6-sol and gpt-6-astra reviewers returned VERDICT: BLOCKING on test-only issues. Reduced vendor diversity explicitly retained.

Triage:
- FIX: repeated immutable fixture reads. Cache verified ROM once and each canonical archive key once; no change to real SHA/region validation. Negative cases wrap immutable readers without mutating shared bytes.
- FIX: add an unrelated ready opcode 0x67 question case within the existing prompt-ownership boundary. Removing the nickname-kind predicate demonstrably fails this case; restore passes. Receipts /tmp/caught-nickname-v2-kind-deletion-1.log and /tmp/caught-nickname-v2-kind-restored-1.log (1 failed/11 passed; restored 12 passed).
- REBUT: the request for universal operand-level mutation receipts exceeds the feature-switch skill's explicit wiring-deletion requirement and is not present in the canonical review-contract prompt. Wiring deletion and the independently meaningful prompt-kind guard both have RED/GREEN receipts. Null/readiness/cursor predicates partly enforce the same native prompt invariant; no claim of comprehensive individual-operand mutation proof is made.

Round-two delta: test setup caching, unrelated-prompt regression and review/evidence record only; production diff from 0c54ff72d is empty. Re-review cumulative packet before claiming review complete.

Additional proof: remaining Python gates/tooling/root tests 94 passed (4170 total before the extra unrelated-prompt test). Full branch coverage above applies to restored production code. Candidate Harness Config click opened the exact V2 explainer on an isolated ephemeral viewer with synthetic data, zero page errors. Headless only. Shared viewer and measured run untouched. Local copy at runs/mockups/caught-nickname-v2 on canonical pages service returns 200 with exact document bytes.

- Round-two affected checks: native V2 tests 12 passed; ruff check/format passed. Full Python suite including gates/tooling/root tests 4171 passed in 48.29s after the test-only fix. Production code unchanged; previous build/lint and full coverage gates remain applicable.

## Final review and authorized landing

Final cumulative packet: base 63e47426b03a427361467040ebf0741740cade79, reviewed tip f6da68cf3926cf9535753633e161021388e638f1, binary diff SHA256 54ed8460f583f8f1fa3096fe415ceffd17c856b026131ed1098658d3508d2ac5. Round two Claude CLI, independent GPT reviewer, Sol fallback and Astra fallback each returned VERDICT: LGTM. All prior concrete findings resolved; no remaining operand-mutation requirement. Grok remains unavailable due account limits; reduced vendor diversity was reported, never counted as normal cloud-roster success.

Operator approval: The operator answered "yes" to "May I land this using the fallback reviews in place of Grok?" on 2026-10-25. This explicitly authorizes the unavailable-Grok exception for this landing. Joined landing board as codex/caught-nickname-v2 with exact session 00000000-0000-4000-8000-0c616f086f8a, verified number 1. Main was still the reviewed base and clean; regenerated cumulative digest matched. Fast-forwarded main to f6da68cf3926cf9535753633e161021388e638f1.

Post-merge checks: first test attempt used stale compiled agent exports and rejected the new V2 schema in two recipe tests. No source edits were needed: rebuilt canonical packages, reran complete just test clean (4408 agent, 1955 viewer, 4171 Python plus protected trainer-card guard and all three approved visual baselines). Build stamp f6da68c; canonical tree remained clean before this evidence-only worklog commit.

Viewer: default /private/tmp/pokebench-viewer had pre-existing deleted source files; viewer-main failed before restarting the old viewer. Preserved that checkout. Supported POKEBENCH_VIEWER_WORKTREE override created clean /private/tmp/pokebench-viewer-capture-f6da68c at reviewed tip. One successful viewer refresh completed approximately 12:51 EDT. Future refreshes should use this clean tree or separately repair the old disposable checkout; no repair/reset of that unrelated dirty tree was performed here.

Live proof at 12:51-12:52 EDT: stamp commit f6da68cf3926cf9535753633e161021388e638f1, dirty false; served /app/main.js and V2 explainer bytes matched the built clean tree exactly. /api/features registers V2 with its V1 dependency. All 544 before/after runs remain present; Astra429f remains live with no problem. /api/workbench reports no stale-viewer build problem. Native player/bridge/game-server PIDs 70711,70713,71239 survived, and viewer restart guard reported four live gameplay processes kept running. No gameplay launch, input, run repair or source-pin change.

Headless real-viewer proof: selected recorded Astra429f; V2 is correctly NOT RECORDED for that historical run. Harness Config READ EXPLAINER opens canonical /explainers/caught-nickname-prompt-v2.html, correct title, zero browser page errors. Explainer and card screenshots inspected at 1280,1440,375. Initial desktop element captures overlapped the existing sticky header; retained those unsuccessful captures, then scrolled normally below the sticky header and inspected clear viewport replacements live-config-proof-1280.png and live-config-proof-1440.png. Screenshots under runs/mockups/caught-nickname-v2/shots. Original recorded settings remain unchanged.

Maintained recipe materialization at merged build verified all three capture flags ON for both arms in every phase of bundle-v-control, bundle-v-control-2h and glm53-flash-4h. This config applies to future launches; no new native gameplay validation or benchmark improvement is claimed.

This is the permitted post-landing evidence-only commit touching docs/worklogs only. Worklog archive not requested.
