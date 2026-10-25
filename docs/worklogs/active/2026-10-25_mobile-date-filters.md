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
