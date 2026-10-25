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

## Follow-up contract and RED

User specifically reports card overlap and insufficient padding after stacking. Full iPhone13 Playwright emulation at390px also does not reproduce native physical-phone overflow; do not equate emulation with native Safari proof. Add explicit native-control sizing and inner spacing: mobile date group inset4px beyond existing card padding,20px gap, input border-box/max-width containment, native appearance reset and48px minimum height with12px vertical/16px horizontal text padding. Preserve date type/picker and >600px layout. Same presentation domain; no harness/cards/filtering changes.

Tracked browser regression uses true iPhone13 WebKit device context and Chromium at320/375/390/600/601/1280/1440. Check both empty and populated date controls against the card's inner padded boundary (>=26px), minimum control text padding, vertical separation, input height, date entry, pointer and keyboard clearing, and reverse-date validation. RED: existing mobile inset22px fails required26px; all desktop breakpoint cases pass. Tests do not claim to reproduce physical iPhone overflow. Normal full gates and frozen required review before serialized landing; no prior approval waived for this fix except already-verified standing Grok outage exception.

GREEN: all14 targeted browser cases pass (iPhone13 WebKit and Chromium,7widths each). All mobile controls have at least26px clearance from outer card edges,48px control height,16px internal text padding, and40px separation including labels. Empty and populated states both checked; pointer/keyboard clearing and reverse-range validation pass. Screenshot pixels at320/375/390/1280/1440 inspected; remaining breakpoint screenshots also retained. Broader source tests/coverage unchanged from initial candidate; rerunning required regression gates before final landing. The mobile-only native appearance reset is a defensive sizing correction; physical iPhone Safari remains unverified. No claim that emulation reproduced the reported overlap.

New browser regression files live under browser-tests; the protected trainer-card design-tests directory is unchanged. An initial attempt to add unrelated regression files under design-tests was rejected by the guard and corrected by placing them outside that protected directory; no bypass/approval record/baseline modification.

Follow-up gates: full just test passes4407agent/1951viewer/4159Python and all3protected card baselines; build passes. New browser-tests mjs initially needed the same ESLint JavaScript parser treatment as existing design-tests mjs (type-aware TS project service cannot parse standalone mjs outside tsconfig). Added browser-tests pattern to that existing disableTypeChecked override; normal JS lint rules still run, no ignores/excludes/baseline changes. Viewer lint passes after correction; agent lint passed. Python lint and existing unchanged app coverage evidence retained from same session. Freeze includes this test-tooling adjustment and is re-reviewed; no production CSS changes after14/14 browser GREEN. Initial follow-up review of8274877ba is superseded by final cumulative packet.

## Final follow-up review, landing and live receipt

Final packet base32979bf7e to50b8bbf5f7733ad8003eccd33dae0022c599d5a0, exact binary diff SHA256 c0900a926017bd25be7c2386d72c0b472f1700d1431ec6274ed744f2f7bd9e3b. Claude CLI final clean review LGTM (empty stderr); independent GPT review_mobile_padding LGTM; fresh distinct Sol6.1 padding_fallback_sol and Astra6 padding_fallback_astra each LGTM on identical packet. Grok final attempt still account usage-exhausted; verified standing human waiver applies, reduced vendor diversity explicit. Initial follow-up Claude blocker on lint accepted and resolved by the reviewed JS override; superseded8274877ba review never counted as final approval. Nonblocking manual browser-test invocation, screenshot cwd and serial scratch-port constraints retained as limitations; no unrelated expansion.

Full just lint passes both TS workspaces, ruff/check+format and mypy125sources. Full just test before and after landing:4407agent/1951viewer/4159Python/no skips,3exact protected card baselines pass; build passes. Existing unchanged application-code coverage remains agent99.17/92.74/97.61,viewer98.20/91.80/95.37,Python97.40/93.43/100 (lines/branches/functions), all>=90. New targeted browser suite14/14 passes. All screenshots inspected with image tools. Physical iPhone Safari remains unverified; no claim that emulation reproduced its reported overflow.

After #1 shared-board ownership and clean reviewed-tree/digest verification, fast-forward landed50b8bbf5f. Single follow-up coordinator-cleared refresh from /private/tmp/pokebench-viewer-qwen36-20261024 completed about12:19PM EDT Oct25. Served clean stamp50b8bbf5f, sole8790viewer PID26762,PPID1. All22 benchmark processes in original snapshot remain alive; original snapshot also included3transient mailbox polls, one expired normally and is separately identified, never treated as gameplay loss. Four live cards429f/6bbd/9e33/d41e present; no card problems. No gameplay/controller/paused-loop changes.

Live iPhone13-emulated WebKit320/375/390 and Chromium1280/1440 checks confirm >=26px card-edge clearance, >=48px height,16px text padding, vertical separation, date entry/clear and two375pxpolling intervals, zero page errors. Five served card screenshots opened/inspected. Proof URL returns200: http://127.0.0.1:8791/mobile-date-filters/padding-shots/live-iphone-webkit-375.png . Receipts under runs/reviews/mobile-date-filters/final-padding. The user's physical-phone acceptance remains distinct from these passed emulated/live-page checks.
