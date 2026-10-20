# Frontier time outlier filter

User authorized a default-on reversible filter beside FRONTIER / FULL BASELINE, preserving all recordings.

Single milestone: add graph-only filter, tests, browser proof, gates, review, local landing when approved.

Design: hide only extreme ended overlay runs, above three times the 90th percentile of per-run maximum visible milestone time (at least ten eligible agent series). Keep human/frontier references and current runs. Use the displayed milestone range; retain the original horizontal extent. Show hidden count on toggle and run IDs on hover; explain the rule in existing collapsed how-to. Turning off restores every point. Polling preserves state and focus. No measurement or harness changes.

Live binding: Chrome tab 1657055772, inference.example:8790/comparisons?from=2026-10-20T13-21-09_qwen38-mac_facd; viewer PID 80486, stamp 079eb1ce. Canonical main fa5ae160. Read-only snapshot saved /tmp/pokebench-outlier-proof/workbench.json.

- [x] RED: mounted test fails because filter control is absent; 8 existing tests pass.
- [x] Implementation; 52 focused tests passed before final small layout/test cleanup.
- [x] Gates: 2843 agent + 1390 viewer + 2896 Python tests, zero skips. Viewer coverage 97.72 lines / 91.04 branches / 93.92 functions; agent 99.16 / 92.91 / 97.60; Python 96.95 / 92.46 / 100. Full lint, build, vendor verification pass. Initial gate runs lacked worktree runtime/vendor setup; repaired local setup and reran successfully.
- [x] Real snapshot: 434 retained recordings. Both ranges: 313 plotted runs OFF, 312 ON; same frontier e046. Frontier points 3725 OFF / 3693 ON; full baseline 3728 / 3696. All point IDs unique. Only hidden run f28d, 32 points; OFF restores them all. Frozen source snapshot/count receipt /tmp/pokebench-outlier-proof/.
- [x] Browser: actual candidate snapshot server 8798 (GET only; no queue runner), Chrome tab 1657055869. Pointer OFF/ON and keyboard Space, full baseline and frontier; state retained across multiple 5-second polls. Scale 380 OFF / 160 ON. No yellow boxes. At CSS 1280, 1440 and 375: screenshots saved under canonical runs/mockups/frontier-outliers/shots/ and opened. How-to expanded at desktop widths; mobile existing layout hides legend/help. No horizontal overflow. Unit test covers polling failure/recovery and focus. Preview is frozen real data, not live status proof.
- [ ] Review and landing

User follow-up: keep this as the third toggle in the existing segmented control; remove all yellow explanation boxes. Guidance moved to existing collapsed how-to; hidden count on toggle, IDs on hover.
