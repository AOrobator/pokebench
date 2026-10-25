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

GREEN: one-line preventScroll option on renderParty focus restoration. All114 app tests pass including3 new regression cases. Full TypeScript tests4408 agent/1963 viewer and Python4184 pass. Initial full gate attempts lacked local ROM env/native binding/art links; repaired worktree setup without changing canonical environment. One concurrent agent coverage attempt timed out in an unchanged5s process test; earlier complete TS coverage passed on identical source, retained as authoritative with separate corrected Python coverage. Lint/build/vendor pass. Trainer baseline check rerun with canonical art linked; no baseline changes.

Background candidate proof: owned18826 server on copied2080-event recording prefix with synthetic HP updates appended only to scratch log. Pointer-select party slot, scroll to0, append changed state, wait11sec (two card polls): y=0 and slot0 focus at1280/1440/375. Real arrow key advances profile->stats in each viewport. Six screenshots inspected, zero page errors. Original operator tab uninspected to preserve focus. Proof scripts initially had a hidden desktop selector and invalid fixture timestamp; corrected test driver, no application changes. Canonical artifacts runs/mockups/viewer-scroll-refresh/shots, /tmp/scroll-browser-receipt.json. Live gameplay unchanged.

Review and landing: frozen boundary remains renderParty focus only. Will run Claude CLI followed by normal GPT/Grok cloud lanes. Grok outage waiver independently verified in server-copied user messages 00000000-0000-4000-8000-1bb4e739f4f4 JSONL4145/4964/6309 (yes dont wait for grok; land without grok), coordinator confirms general scope. Retain current outage evidence and independent fallbacks if unavailable. Board before landing; one coordinated viewer restart and live proof required.
