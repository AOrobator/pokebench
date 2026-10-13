# Split ribbon workbench

## Problem Statement
The operator selected round-two Split Ribbon Workbench and authorized implementation. Build a separate Runs & Comparisons screen reachable from the viewer and back. Charts must fit their container without horizontal scrolling. Remove the redundant execution strip at the top. Instead, show a live-run navigation card with model, elapsed time/cap, turn budget, benchmark target and latest recorded objective; absent a healthy live run, show the ordinary back-to-viewer link. Keep the complete execution queue at the bottom. Clicking a run or split reveals its recorded model/harness settings and explicit ON/OFF features. Use real recorded splits, never mockup values.

## Skills Loaded
Feature-worklog and agent-observability: durable recorded state, truthful queue/current status, mounted viewer/replay proof. Patch-evaluation: timing and reliability stay separate; this display change does not promote a behavioral patch. Multi-model-review is the repository landing gate.

## Architecture
Existing typed event reader/RunView owns run parsing and event folding. Add a read-only aggregate endpoint and an independently navigable comparison document sharing the current fonts/theme. Render responsive SVG charts with adapted label layout and viewport-sized viewBox, no minimum width/overflow scroll. Reuse feature catalog/recorded effective feature data; missing historical values remain unknown. Queue data comes from the viewer RunQueue and retained validated comparison manifests/ledgers, with controller lease/terminal evidence to distinguish queued, withheld and completed. No hidden gameplay launch or reconstruction of unrecorded completion.

## Invariants
- INV-W1 Native observed splits only, present-at-start/legacy/unqualified records excluded from earned timing. Test malformed/native-evidence/partial timelines.
- INV-W2 No live-state invention: server health qualifies live status; elapsed/objective/target come from recorded owners. Test idle, running, paused, ended and unavailable.
- INV-W3 Source/config provenance retained; effective ON/OFF/unknown features faithfully decoded. Test historical absence and false flags.
- INV-W4 Read-only analytics and truthful queue status; stopped controller means withheld, not scheduled. No secrets/ROM or arbitrary artifact paths returned. Test traversal, malformed manifests/ledgers and interrupted cohorts.
- INV-W5 Charts fit narrow/desktop containers without horizontal scrolling, navigation/details keyboard accessible, stale refresh does not override user selection. Test mounted state/navigation; inspect real replay at responsive widths.

## Security Review
Loopback existing CSP/static allowlist; bounded typed JSON boundary; only fixed run/receipt roots read. Escape model/objective strings, do not expose endpoint credentials or complete private configuration files. No agent/environment/vendor/schema edits, no input sent to games.

## Milestones
- [ ] RED producer/aggregate tests, then minimal typed read-only aggregation.
- [ ] RED mounted viewer navigation/chart/current card/details/queue tests; implement selected design.
- [ ] Full applicable viewer gates and independent90 coverage floors, mutation receipts, actual retained replay and served-artifact hashes.
- [ ] Frozen independent review, landing, viewer deployment and recoverable worktree cleanup.

## Closing the Loop
Verify viewer→workbench→live viewer, chart/row→configuration drawer, native splits/current objective/elapsed, responsive fit and withheld queues. Preserve actual screenshot/test/review/landing receipts separately. Existing overlay spacing and objective-ablation worklog changes in this checkout remain part of final scoped diff; the pending objective-system24 trial experiment is unchanged.

## Session Log
2026-10-13 operator explicitly approved round2 design7 with responsive charts, bottom-only queue and clickable current-run meta card. Implementation isolated from canonical main. Existing main cohort ended at trial20 with retained launcher_error: health/slot occupancy unavailable; original services restored and lease released. Trials21–24 are withheld, not queued. Diagnose the infrastructure cause separately; no silent resume/replacement.

## Surprises
The prior benchmark was not still running at UI implementation time; current and queue status must use durable/live evidence.

## Multi-Model Review Log
Pending frozen implementation packet; no approvals claimed.

## Boy Scout Log
Existing overlay spacing patch preserved; no unrelated refactor.

## Archive Milestone
- [ ] ASK USER: archive this worklog after completion.
