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
- [ ] RED behavior tests
- [ ] Rendering/CSS and GREEN viewer gates/build/coverage
- [ ] Browser proof isolated preview
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
