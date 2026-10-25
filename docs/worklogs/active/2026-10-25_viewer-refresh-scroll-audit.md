# Viewer refresh scroll audit

User: Check the rest of the viewer for refreshes that move scroll; no page jumping anywhere. One bounded UI milestone.

Contract: passive refresh must preserve document/reading-pane position, expanded reading content and keyboard focus. Audit Watch/PokéNav, comparisons, probes, reports and human-play UI. Fix demonstrated refresh paths: shared card focus, run-details disclosure collapse, probes reader remount, comparisons legend pane reset; suppress async human-resume focus scrolling. Preserve deliberate navigation/Full Trace, modal keyboard visibility and opt-in thinking/trace follow. No blanket page scroll locking, card appearance or identity changes, baseline changes, timeline additions, harness behavior, launches or gameplay inputs. No feature switch needed for viewer-only presentation.

Work in attached isolated worktree on codex/viewer-refresh-scroll-audit. RED/GREEN, final gates, headless1280/1440/375 proof, required cloud review/waiver fallbacks, serialized landing and single viewer refresh. Original operator tab untouched.

Audit: bare focus in shared syncCards affects Watch and comparisons. Workbench existing refresh focus sites already preventScroll; remaining close/trap focus is direct user navigation. Reports has no timer: focus/phone detail scroll are explicit report selection. App explicit scrollIntoView is Full Trace click; thinking/trace scrollTop respects follow/held controls. Probes passive timer replaces entire app; .pr-dialog scroll and focus disappear. Workbench replaceKeepingFocus replaces .wb-vpanel scroller. App run-details HTML rebuilt on every state and reinstates all details closed. Field state pre blocks have no scroll limit inside page-content; test page pane retention before adding changes. Next-run poll keeps its parent scroller and existing form nodes; test unchanged/changed status without operational writes.

## Principles
PB1 N/A no grading; PB2 PASS no run filtering; PB3 N/A UI correctness; PB4 PASS viewer only/no model advantage; PB5 PASS one refresh scroll contract; PB6 N/A no model context; PB7 PASS original logs read-only; PB8 N/A no tool policy; PB9 PASS direct user request and reproduction; PB10 PASS unchanged gates/baselines; PB11 PASS local installed browser behavior; PB12 PASS no new ROM path; PB13 PASS evidence/review/landing tracked here.

Review boundary is the refresh UI paths above and their regression/browser checks, not adjacent redesign. Tests use bounded fixtures and no new shared controller or runtime policy.

RED: three main regressions fail (card focus options, run-details open state, probes reader scroll), plus legend refresh loses150px once fixture has production-valid agent provenance; async human resume focus lacks preventScroll. Logs /tmp/refresh-audit-red*.log. Initial legend fixture was unqualified and did not redraw; corrected it and assert node replacement. No production changes yet.
