# Mobile comparison date filters

User requests fixing overlapping From/Through fields on mobile by stacking them.

Bounded contract: CSS only, <=600px date fields use one full-width grid column, labels have no 240px cap, Clear Dates remains intrinsic width. Above 600px retain existing flex layout. No filter behavior, trainer cards, run data, harness, timeline, or service changes. A new behavior/domain requires separate scope. Terminator: browser geometry and interaction checks, existing viewer tests and protected card baselines, independent required review; landing only through the shared board.

## Evidence

- Before change: headless 375px Chromium had both inputs at y=456.84, width=141.5. Browser assertion requiring vertical separation failed.
- After change: Chromium and WebKit at 375/600 stack full-width with gap; 601/1280/1440 retain same-row fields. Bounding boxes stay inside filter panel. All ten viewport cases pass date entry, reversed-range validation, pointer Clear Dates and keyboard Enter; two polling cycles at 375 preserve fields; zero page errors.
- Six 375/1280/1440 browser screenshots inspected with image tool, plus breakpoint screenshots under canonical runs/mockups/mobile-date-filters/shots. Owned isolated server 18835 uses temporary empty runs root, stopped after proof. No operator apps/tabs touched. No native iPhone verification claimed.
- Focused workbench/frontier tests: 38 passed. Build passed. Full viewer tests, lint and protected cards in progress. Initial protected-card check failed missing fixture art in worktree; rerunning with explicit canonical read-only art path.
- CSS-only reversible edit: no extra unit tests that mirror CSS. Browser script /tmp/check-mobile-dates.mjs directly verifies layout and real control behavior.

## Principles Adherence

| ID | Score | Evidence |
|---|---|---|
| PB1 | N/A | No progress grading changes. |
| PB2 | N/A | No run inclusion or outcomes change. |
| PB3 | N/A | No model benefit claim. |
| PB4 | PASS | Presentation only; no model capability or vendor change. |
| PB5 | PASS | One responsive layout correction. |
| PB6 | N/A | No context/long-run changes. |
| PB7 | PASS | Original recordings untouched; isolated empty scratch data. |
| PB8 | N/A | No model input handling. |
| PB9 | PASS | User specified mobile stacking; uses existing 600px breakpoint. |
| PB10 | PASS | No gate or baseline modifications. |
| PB11 | PASS | Installed pinned Playwright engines exercised. |
| PB12 | PASS | No protected ROM or OS focus actions. |
| PB13 | PASS | Before/after browser proof, worklog, build and checks tracked; review/landing kept distinct. |

## Initial landing and operator correction

Frozen head/landing 6d19a2dc51de11a654c22176da6c7390af69328b; exact diff SHA256 365bcd15135aa83fd8a8190518f33c440727ac8e26f6de8b004609415936c4b6. Claude, fresh isolated GPT, distinct fallback Sol6.1/Astra6 each LGTM. Cursor Grok and GPT account out of usage; normal GPT supplied by isolated review. Applied verified standing human Grok waiver ([private message reference], 2026-10-22T14:47:31Z), confirmed by coordinator. Reduced vendor diversity. Gate results: agent4407/viewer1951/Python4159; lint/build/vendor, all coverage metrics>=90 and3protected card baselines pass. Initial Python ROM-less invocation discarded; proper ROM export gave4159pass/no skips. Post-merge just test passes same counts and protected baselines.

One coordinator-cleared viewer refresh from /private/tmp/pokebench-viewer-qwen36-20261024 serves clean6d19a2dc5; viewer PID14252 has PPID1. All25 protected processes survive. Live WebKit 375/1280/1440 geometry, clear button, two mobile polling intervals and zero page errors pass, screenshots inspected. These checks used desktop WebKit at narrow viewports, not native iPhone Safari.

Operator reports the stacked native mobile date controls still overlap the card and lack padding. The earlier desktop-WebKit proof did not reproduce this surface; initial fix is not accepted as complete. Continue with iPhone-emulated context, explicit inner-card containment and padding checks, and corrected Safari sizing, then new frozen review and serialized landing. No baseline or gate weakening. Receipts under runs/reviews/mobile-date-filters and runs/mockups/mobile-date-filters/shots.
