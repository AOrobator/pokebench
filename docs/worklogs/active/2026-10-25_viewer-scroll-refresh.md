# Viewer party refresh scroll jump

User requested investigation and fix of periodic jumps from page top to PokéNav.

Boundary: renderParty focus restoration only; preserve selected slot/tab/move and keyboard operation while keeping the operator scroll position during redraws. No harness behavior, card presentation, timeline, runs or experiment changes.

## Evidence
- Read canonical active worklog without modifying it. Isolated managed worktree.
- Headless Chromium on live viewer8790 reproduced: default page stays y=0; click party slot, scroll top, await live update -> y=847. Instrumented focus stack identifies App.renderParty with empty focus options. Original operator tab left alone.
- RED regression pending; GREEN adds preventScroll to the existing focus restore.

## Principles adherence
| ID | Score | Evidence |
|---|---|---|
| PB1 | N/A | No progress grading changes. |
| PB2 | PASS | No runs filtered or changed. |
| PB3 | N/A | UI correctness, no model improvement claim. |
| PB4 | PASS | Viewer only, no model advantage. |
| PB5 | PASS | One demonstrated focus restoration defect. |
| PB6 | N/A | No context or recording changes. |
| PB7 | PASS | Original recordings read-only. |
| PB8 | N/A | No model tools or retries changed. |
| PB9 | PASS | Direct user request, browser reproduction grounds fix. |
| PB10 | PASS | No gate or baseline changes. |
| PB11 | PASS | Native browser focus behavior reproduced in installed Chromium. |
| PB12 | PASS | No ROM access. |
| PB13 | PASS | RED/GREEN, gates, background browser proof and review tracked here. |

Review terminator: preserve selection/focus and scroll through changed and unchanged party data, real keyboard navigation, full gates and selected cloud reviews. No adjacent focus-site cleanup.

RED: all three slot/tab/move cases fail on empty focus options; focus identity preserved, scroll suppression absent.
