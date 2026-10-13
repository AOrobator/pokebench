# Activity history readability

## Problem Statement
Side-conversation user requests two-line numbered activity previews, full content on click, readable newlines/Markdown and syntax-highlighted JSON. Explicit local mutation authorization after side boundary; do not alter parent integration/main/8793 preview or interact with subagents.

## Skills Loaded
PokeBench feature-worklog. Existing viewer contract/rules read. Side conversation prohibits subagents and inherited work.

## Architecture
Small viewer-only rendering module and CSS. Clamp preview bodies to two lines; retain full event in click inspector. Escape HTML before supported Markdown formatting; safe links only; fenced code and JSON highlight. Original raw event remains inspectable. No benchmark/event/model/server policy changes.

## Invariants
- INV-1: every preview body bounded two lines, full text survives selection. Mounted/source/CSS and browser geometry checks.
- INV-2: newlines/Markdown render safely; HTML/unsafe links never execute. Rendering tests cover fences/links/escaping and JSON tokens.
- INV-3: raw JSON remains exact and complete; only presentation changes. Existing history/inspection tests + focused new tests.
- INV-4: all changes isolated, no parent service/source/subagent modifications.

## Security Review
No external scripts, HTML execution, new dependencies or CSS injection. Escape all log content; safe URL schemes only. JSON validation stays existing owner.

## Milestones
**M1 — Readable previews and detail**
- [x] RED behavior tests
- [x] Rendering/CSS and GREEN viewer gates/build/coverage
- [x] Browser proof isolated preview
- [ ] Parent-compatible patch handoff; not claim landed/reviewed

## Closing the Loop
Finish scoped local patch and provide source/validation receipts. Canonical landing/review belongs to parent, not this side conversation; no inherited authorization to land or message it.

## Session Log
2026-10-12: inspected current8793 checkouta7c826f; created isolatedmanagedpathhistory-readability(registrationthreadnotfound butcheckoutsuccess). Parent source untouched. Worklogbeforeimplementation.

## Surprises
None.

## Multi-Model Review Log
Pending; side conversation forbids subagents. Local patch does not count as parent landing approval.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive after handoff.

RED:149existingtests pass; inspector exactraw-detail assertion fails asintended, newformat moduleabsent suiteimportRED. Noimplementationeditsyet.

COMMIT: `test(viewer): specify readable event inspection` (`1233f1b`) RED. GREEN:159viewer tests, viewerlint/types, fullTSbuild; coverage98.53lines90.93branches98.54functions97.67statements. RawJSONroundtrip, escapedHTML/unsafeURLs, newline/Markdown/nestedstring/fencedJSON validated. Two semanticrender mutations assertionRED restored; browserCSSboundremoved row1302measured260.367px vsrestored24.797px (2x12.4lineheight). Screenshot externalvisualizationpathhistory-readability.png; isolated8797 source only, original8793 untouched. Mandatoryreview/parentcumulativegates notclaimed; no subagents used under side boundary.

COMMIT: `feat(viewer): compact history and format full event details` (`c8e8cd7`) GREEN; sourcefrozen. Servedstyle/app/panels/inspectformatbytes matchedbuiltfiles; raworiginaleventandfullcontent preserved. Preview8797 is anisolateddeliverable, notproduction8793. Parentreview/landing remainspending; no contact/subagentactivity under sideboundary.
