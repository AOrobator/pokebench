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
- [ ] Independent review; report native gameplay proof pending.

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
