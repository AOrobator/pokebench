# Remove obsolete comparison trainer cards

User request: fully remove the old lane/type/milestone plates; retain the improved trainer card design.

Scope: delete the legacy renderer, reconciliation and CSS. Missing artwork gives a clear notice and ordinary Watch links, never the old design. Preserve lane uncertainty, paused/live truth, checkpoint provenance, problems, clocks and stable keyboard access in the current design. Viewer-only; no harness or experiment changes.

Evidence: screenshot matches workbench-view.ts plateHtml. Workbench.clock used it whenever optional art was null. Existing 8790 comparisons tab currently has modern cards; listener 40407, served build 912a6954. Historical screenshot may reflect an artwork failure or stale served build; exact cause of that capture is not established.

- [x] Regression RED, remove legacy path and styles, GREEN
- [ ] Gates and independent review
- [ ] Owned browser proof; local landing and live verification if gates allow

No gameplay process or experiment restart authorized by this cleanup.

Verification: RED returned two legacy plates where zero were required. Final viewer coverage: 1,492 tests passing, no skips; lines 97.81%, branches 90.97%, functions 94.16%. Viewer lint and workspace build pass. First full coverage attempt found missing built browser modules in the new worktree; built workspace and reran successfully, no gate changes. Candidate proxy 8815 serves candidate built assets and GET-only real viewer data (8790); isolated backing server 8814 has an empty scratch runs root and no autorunner. Modern screenshots inspected at 1280, 1440, 375; missing-art and click-through proof in progress. Historical mockup files/worklogs retained as provenance, never served by current comparison renderer.
