# Collapsible run splits

Scope: viewer-only native disclosure, initially collapsed. Closed shows the deepest recorded story milestone and existing next checkpoint; open shows every recorded split and the frontier time disclosure. No milestone calculations, timeline or gameplay changes.

Plan: focused regression tests, full gates, browser clicks/screenshots, frozen three-family cloud review, ff-only main landing and viewer restart. User authorized landing after review and restart.

Implementation: native details is initially closed, compact sibling hidden by CSS when open. App updates compact/full targets without replacing details. Focus outline and wrapping retained.

Evidence: compact regression fails with filtering deleted (NEW GAME leaked), passes restored. Agent 2846 + viewer 1399 tests pass. Mounted app assertions cover initial closure, cached split projection, disclosure state across updates and selecting another run. Browser 8822 on copied real b300 run: compact ROUTE 103 + RIVAL BATTLE STARTS; expanded retains all 26 reached chips plus next. Mouse, Enter and Space tested. Screenshots at 1280/1440/375 expanded/collapsed opened; under canonical runs/mockups/collapsible-splits/shots/. Original user tab unavailable because another session owns it; separate verification tab used. Full gate rerun with configured ROM in progress. Three-family review pending.

## Review, landing and live proof

- Frozen base 9f8ac715, reviewed head 1cd16fb4, binary-diff SHA256 b1f6c63dd740fffae72be0c23795ec394cb83bf08d3b3b2c6603df817f36a8e7.
- Cloud Grok (Cursor) and GPT lane (isolated GPT-6.1 Sol), plus independent GPT-6 Astra fallback: VERDICT: LGTM, no actionable findings. Claude CLI logged out; Cursor Opus/Sonnet/Haiku and Cursor GPT usage-capped. Operator explicitly replied yes to the Claude exception, landing and restart request on 2026-10-20. No Claude approval claimed.
- Gates passed: 2846 agent, 1399 viewer, 2896 Python tests, no skips; coverage >=90% in every metric; lint/build/vendor checks pass. On main, just test passed again with the same counts. Experiment audit emitted no findings.
- Landed fast-forward on main at 1cd16fb469a97e6ee5dab676f2a753e5d7f5657a. Viewer restarted via viewer-main at 14:26 EDT, clean served build stamp 1cd16fb4, one listener on 8790. Initial command-session launch exited; detached restart persisted. All three preexisting gameplay PIDs remained alive.
- Live browser b300: RUNNING and live game frame, compact changed with progress from Running Shoes/Route102 to Route102/Petalburg; click opens all 37 chips and Enter closes them. Final screenshots opened at runs/mockups/collapsible-splits/shots/live-{collapsed,expanded}.png. Three live workbench runs and zero old-viewer-build problems; no final browser error banner. Original user tab owned by another session, separate verification tab used.
- Receipts: runs/reviews/collapsible-splits/ (ignored), screenshots under runs/mockups/collapsible-splits/shots/. No gameplay or experiment launch/restart.
