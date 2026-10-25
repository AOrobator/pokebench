# Viewer refresh scroll audit

User: Check the rest of the viewer for refreshes that move scroll; no page jumping anywhere. One bounded UI milestone.

Contract: passive refresh must preserve document/reading-pane position, expanded reading content and keyboard focus. Audit Watch/PokéNav, comparisons, probes, reports and human-play UI. Fix demonstrated refresh paths: shared card focus, run-details disclosure collapse, probes reader remount, comparisons legend pane reset; suppress async human-resume focus scrolling. Preserve deliberate navigation/Full Trace, modal keyboard visibility and opt-in thinking/trace follow. No blanket page scroll locking, card appearance or identity changes, baseline changes, timeline additions, harness behavior, launches or gameplay inputs. No feature switch needed for viewer-only presentation.

Work in attached isolated worktree on codex/viewer-refresh-scroll-audit. RED/GREEN, final gates, headless1280/1440/375 proof, required cloud review/waiver fallbacks, serialized landing and single viewer refresh. Original operator tab untouched.

Audit: bare focus in shared syncCards affects Watch and comparisons. Workbench existing refresh focus sites already preventScroll; remaining close/trap focus is direct user navigation. Reports has no timer: focus/phone detail scroll are explicit report selection. App explicit scrollIntoView is Full Trace click; thinking/trace scrollTop respects follow/held controls. Probes passive timer replaces entire app; .pr-dialog scroll and focus disappear. Workbench replaceKeepingFocus replaces .wb-vpanel scroller. App run-details HTML rebuilt on every state and reinstates all details closed. Field state pre blocks have no scroll limit inside page-content; test page pane retention before adding changes. Next-run poll keeps its parent scroller and existing form nodes; test unchanged/changed status without operational writes.

## Principles adherence
| ID | Score | Evidence |
|---|---|---|
| PB1 | N/A | No grading changes. |
| PB2 | PASS | No runs filtered or changed. |
| PB3 | N/A | UI correctness, no model benefit claim. |
| PB4 | PASS | Viewer only, no model advantages or actions. |
| PB5 | PASS | One refresh reading-position contract across viewer surfaces. |
| PB6 | N/A | No model context changes. |
| PB7 | PASS | Original recordings read-only; injected events only in isolated scratch root. |
| PB8 | N/A | No model tool or retry policy change. |
| PB9 | PASS | Direct user authorization; RED and native-browser reproduction. |
| PB10 | PASS | Existing gates, coverage floor, protected files and baselines unchanged. |
| PB11 | PASS | Installed Chromium and native DOM focus/scroll behavior exercised. |
| PB12 | PASS | No new ROM handling; existing gate environment retained. |
| PB13 | PASS | RED/GREEN, full gates, browser, sealed reviews and landing receipts tracked. |

Review boundary is the refresh UI paths above and their regression/browser checks, not adjacent redesign. Tests use bounded fixtures and no new shared controller or runtime policy.

RED: three main regressions fail (card focus options, run-details open state, probes reader scroll), plus legend refresh loses150px once fixture has production-valid agent provenance; async human resume focus lacks preventScroll. Logs /tmp/refresh-audit-red*.log. Initial legend fixture was unqualified and did not redraw; corrected it and assert node replacement. No production changes yet.

## Final implementation and evidence
- Shared card redraw restores Watch focus with preventScroll; applies to Watch/header/sheet and art-backed comparisons.
- Run Details and delayed configuration catalog redraws preserve disclosure openness, reading pane position and focused summary. Configuration anchors by existing feature/tool ID or raw-section ordinal after search filtering. Selecting another run clears old disclosure state; existing run-selection/follow policy unchanged.
- Probes passive polls preserve sample dialog scroll, open problems and matching focused sample/group/probe/case/blind controls or disclosure summary; preserve visible reading anchors as samples grow. Explicit sample changes still begin the new sample at0. Capture occurs immediately at render after async response, not before fetch, so current operator scrolling wins.
- Comparisons preserve the visible version ID/offset across new versions above it, with pixel fallback if the anchor disappears. Use the nested panel on desktop and the existing document scroller when CSS makes the mobile version list overflow visible. No CSS, layout or trainer-card appearance changes.
- Async human-resume acknowledgment restores game focus with preventScroll. Its control/claim policy is unchanged. Browser rehearsal used injected fake sendJson and blocked real API access: real control requests0.
- Additional source audit: Reports has no polling; its detail scroll is explicit report selection. Remaining native bare focus sites are explicit opening/closing/navigation/trap actions; Workbench.focus only toggles highlight classes. Trace/thinking auto-scroll remains local and respects held/follow controls. Field, Bag, Trainer, Stats, Splits, Next Run and config parent scroll panes survive refreshes. Raw inspector changes only on explicit row selection. No blanket window scroll lock.

RED receipts retained /tmp/refresh-audit-red*.log (all copied into canonical packet). Initial run-details test sent wrong-run fixture and failed data assertion; corrected stream run rewriting, then independently reverted only production app.ts and reproduced closed-details failure before restoring GREEN. Initial legend fixture lacked agent provenance and did not redraw; corrected provenance and require replaced node. Added summary-focus RED and visible-version insertion RED (offset-46->69px), then corrected them. New configuration RED demonstrates closed raw section after descriptions arrive.

Browser receipts canonical runs/reviews/viewer-refresh-scroll-audit: browser.json (1280/1440/375 changed cards, open Run Details, sample reader+focus+problems through2 polls, new sample rows, version-list row insertion); config-browser.json (all3 widths, plus phone navigation filter during delayed catalog); all-panels.json (all10 PokéNav pages at1440/375 preserve document0 and their reading pane, plus held long-thinking updates); human-browser.json (1440/375, document600 survives acknowledgment; fake sends only). Nine initial screenshots at runs/mockups/viewer-refresh-scroll-audit/shots inspected; configuration screenshots pending final inspection. Original operator tab left untouched.

Driver corrections retained, not application defects: Watch card click reselects the run and briefly loads, so wait for actual RUNNING after the click before baseline; desktop version-more is intentionally hidden, so use visible Show what changed; phone versions use document scrolling rather than a nested panel. A75px outer scroll change with the same visible panel offset was correct browser anchoring as live links grew above, not a jump; semantic version-row insertion was the real remaining defect. Use visible offsets for growing layout and exact scrollTop for unchanged-height refreshes.

Provisional same-source focused181 tests pass. Final all-source gates after the configuration addition, clean-head module fingerprints, complete final browser rerun and sealed cloud reviews follow. Earlier complete pre-configuration gates4415 agent/1975 viewer/4196 Python, lint/build/vendor and3 protected-card baselines pass; not claimed as final-tip gates.

Delayed catalog browser proof passes at1280/1440/375 and phone navigation search: raw-section visible offset preserved within1px and document0, disclosure remains open. Focused181 tests pass on complete behavior. Main concurrently advanced to1ca55e30b (goal-review feature landing, no overlapping scroll source files); stopped redundant old-base gate attempt before sealing, committing owned implementation then synchronizing and running final combined gates. No shared processes touched.
