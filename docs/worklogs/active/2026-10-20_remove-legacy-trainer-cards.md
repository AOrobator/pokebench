# Remove obsolete comparison trainer cards

User request: fully remove the old lane/type/milestone plates; retain the improved trainer card design.

Scope: delete the legacy renderer, reconciliation and CSS. Missing artwork gives a clear notice and ordinary Watch links, never the old design. Preserve lane uncertainty, paused/live truth, checkpoint provenance, problems, clocks and stable keyboard access in the current design. Viewer-only; no harness or experiment changes.

Evidence: screenshot matches workbench-view.ts plateHtml. Workbench.clock used it whenever optional art was null. Existing 8790 comparisons tab currently has modern cards; listener 40407, served build 912a6954. Historical screenshot may reflect an artwork failure or stale served build; exact cause of that capture is not established.

- [x] Regression RED, remove legacy path and styles, GREEN
- [x] Gates and independent review
- [ ] Owned browser proof; local landing and live verification if gates allow

No gameplay process or experiment restart authorized by this cleanup.

Verification: RED returned two legacy plates where zero were required. Final viewer coverage: 1,492 tests passing, no skips; lines 97.81%, branches 90.97%, functions 94.16%. Viewer lint and workspace build pass. First full coverage attempt found missing built browser modules in the new worktree; built workspace and reran successfully, no gate changes. Candidate proxy 8815 serves candidate built assets and GET-only real viewer data (8790); isolated backing server 8814 has an empty scratch runs root and no autorunner. Modern screenshots inspected at 1280, 1440, 375; missing-art and click-through proof in progress. Historical mockup files/worklogs retained as provenance, never served by current comparison renderer.

Review r1: three independent Codex reviewers reproduced focus loss when another run prepended/left the artwork-free list. Fixed by restoring the focused run identity after complete row reconciliation; prepend/removal regressions pass. Full viewer coverage remains 1492/1492 passing, 97.81% lines /90.98% branches /94.16% functions. Claude standalone auth false; Cursor Opus usage capped. Initial cloud packet invalidated by accepted focus fix; final packet must be refreshed after integrating newer main.

## Operator-approved landing

The operator replied "yes" on 2026-10-20 to the explicit request to land with the completed independent reviews despite Claude usage caps and Grok timeout. This waives the unavailable cloud lanes for this cleanup only; no cloud approval is claimed.

Final prior integrated candidate 34134b10 passed workspace build, viewer lint and 1,494 viewer tests, zero skips (lines97.81%, branches90.99%, functions94.17%). Exact cumulative diff ddd432c64cfdbc03e125c42db08db51646313a8707a57d4d363b7cad64c5502c received final runtime, independent Astra and independent Sol LGTM verdicts. Sol withdrew its clock concern after confirming the frozen contract calls for ordinary Watch links without artwork; modern art-backed clocks remain unchanged.

Before landing, rebased onto main537c0a99; upstream difference since reviewed base95498e57 is documentation-only in the date-range worklog. Cleanup source/test/CSS delta is unchanged. Revalidate integrated build/coverage/lint, exact-head independent reviews, fast-forward main, one viewer-only refresh, then inspect live cards and Watch navigation. Existing game processes must remain alive. Browser receipts and final status retained under runs/remove-legacy-trainer-cards/receipt.md and runs/mockups/remove-legacy-trainer-cards/shots/. No gameplay restart.
