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

## Review, landing and live receipt
- All selected round1 reviewers LGTM on frozenbasef719017b5/head a3664a12c/binarydiffSHA25621e17b01788d83f1893be9c8d5309397d5bb490661a0ef43290238d132ecd0d0: Claude CLI actualmodelclaude-opus-5-5 exit0/empty stderr; normal GPT5.6Sol/xhigh no-history gpt_review; distinct6.1Sol/high fallback_sol and6Astra/high fallback_astra. Grok4.5 current exit1 out-of-usage preserved. Verified original operator blanket waiver permits fallback landing; reduced vendor diversity, never Grok LGTM. Independent digest/cleanhead checks passed pre/post; no blockers or accepted fix batches. Hardening follow-ups only: retain standalone RED log and extra receipt metadata in future, investigate unrelated pre-existing5s concurrent process timeout separately. Full synthesis and receipts canonical runs/reviews/viewer-scroll-refresh.
- Concurrent cutscene landing4bc7920fb and its evidence-onlyb0adeb360 synchronized into owned branch. Own diff remained byte-for-byte identical to reviewed packet across both syncs; final app source unchanged by final evidence-only sync. Repeated complete final just test4415 agent/1966 viewer/4196 Python plus3 protected-card baselines, just coverage agent99.18/92.74/97.62 viewer98.20/91.81/95.37 Python97.44/93.51/100 L/B/F, just lint/build/vendor all PASS on combined headb3cb4f835.
- Joined board with verified actualthread 00000000-0000-4000-8000-89f4b3a17cd0; waited at2, notified1. Verified main cleanb0adeb360 and own reviewed digest immediately before fast-forward. Landedb3cb4f835e25ca8efc5be62ebf0c4ecf4f7a8590. Main build and full just test4415/1966/4196 plus3 exact protected baselines PASS.
- One coordinated viewer-main refresh from clean /private/tmp/pokebench-viewer-capture-f6da68c completed2026-10-25 at1:54:09PM EDT. Served stamp commitb3cb4f835 dirtyfalse; sole8790 listener85890. All4 original gameplay PIDs and start-time/command identities unchanged. API/workbench544 rows, no older-build problems. No gameplay inputs or run changes made.
- Live headless1280/1440/375: real click profile tab, scrolltop, real ArrowRight triggers party redraw; focus moves to tab1 with preventScrolltrue and documenty0; remain at0 across11sec/two polls; zero page errors. Screenshots all inspected under canonical runs/mockups/viewer-scroll-refresh/shots/live-*.png. Native frame separate live-frame.json confirms blobhref and3received/2presented. First live driver observed no natural party redraw while walking; strengthened driver deliberately exercises same redraw with real keyboard input at page top. The initial frame metadata selector targeted img instead of the SVGimage; corrected script and separate verified native frame receipt retained. Candidate synthetic HP update proof remains the deterministic live-state path regression. /api/models stubbed in scroll probes to isolate known unrelated502; no inference calls or state writes. Original operator tab untouched; user refresh needed to load new JS.
- Evidence-only closeout commit below; landing slot released after it. No source changes after review, no baseline changes, no harness switches or gameplay behavior changed by this fix.
