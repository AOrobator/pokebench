# Frontier time outlier filter

User authorized a default-on reversible filter beside FRONTIER / FULL BASELINE, preserving all recordings.

Single milestone: add graph-only filter, tests, browser proof, gates, review, local landing when approved.

Design: hide only extreme ended overlay runs, above three times the 90th percentile of per-run maximum visible milestone time (at least ten eligible agent series). Keep human/frontier references and current runs. Use the displayed milestone range; retain the original horizontal extent. Show hidden count and run IDs, and explain the rule. Turning off restores every point. Polling preserves state and focus. No measurement or harness changes.

Live binding: Chrome tab 1657055772, inference.example:8790/comparisons?from=2026-10-20T13-21-09_qwen38-mac_facd; viewer PID 80486, stamp 079eb1ce. Canonical main fa5ae160. Read-only snapshot saved /tmp/pokebench-outlier-proof/workbench.json.

- [x] RED: mounted test fails because filter control is absent; 8 existing tests pass.
- [ ] Implementation and focused tests
- [ ] Gates, real-data counts, desktop/phone browser checks
- [ ] Review and landing
