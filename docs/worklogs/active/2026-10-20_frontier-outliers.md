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
- [x] Review and landing: explicit operator authorization; see closeout below.

User follow-up: keep this as the third toggle in the existing segmented control; remove all yellow explanation boxes. Guidance moved to existing collapsed how-to; hidden count on toggle, IDs on hover.

## Review, authorization and landing receipt

- Frozen source head 2d2f464a; original base fa5ae160; diff SHA256 225e9c3a4f47bfb1cdc834162c529b43b12846a75f30386a24cd39c3fab7fcfc. Grok returned terminal LGTM, exit 0, empty stderr. Fresh no-history Sol and Astra independent reviews both LGTM, each reproduced exact digest, clean HEAD and 52 passing tests. Astra independently reproduced exact 32-point restoration with snapshot/reference invariance. Non-blocking hardening suggestions deferred.
- Claude CLI direct probe confirmed expired OAuth session with failed refresh. Cursor Claude Opus/Sonnet/Haiku and Cursor GPT were usage-capped; this was not a ChatGPT usage cap. Operator explicitly authorized landing: "land your work".
- Synced main 675cc4b8 (lease-per-pool) into candidate b20e7d2b. The complete diff against the new main is byte-identical to the reviewed packet above. Combined gates pass: 2846 agent / 1398 viewer / 2896 Python tests, zero skips; lint/build pass. Coverage lines/branches/functions: agent 99.16/92.92/97.61, viewer 97.72/91.06/93.89, Python 96.95/92.46/100. Earlier retries addressed stale injected workspace dependency links after upstream package exports changed, missing ROM environment in one direct Python invocation, and two unrelated timing tests under unconstrained host load. Final viewer coverage and post-landing TS tests use four workers; no test source, timeout, skip or threshold changes.
- Fast-forward landed b20e7d2bfa6b46a1d4d7e74c6da76be6d48263af on main. Post-landing tests passed: all 7140. The canonical checkout also required refreshing injected dependencies and rebuilding before viewer tests.
- just viewer-main completed 2026-10-20 14:14:06 EDT. Exact serving stamp b20e7d2b, clean; sole 8790 listener PID 25437. All three pre-existing gameplay PIDs 35886, 35891, 75675 survived. All 437 recordings loaded; no older-viewer-build problems.
- Live Chrome comparisons tab 1657055881: third toggle starts ON, hidden count 1; pointer OFF restores f28d's 32 points and 380-minute axis, keyboard Space ON hides them and returns 160-minute axis. Both range controls work and preserve toggle. Zero yellow notices; human reference present after normal cache warm-up. Existing selected-run tab had moved to b300, so it was preserved and the live graph opened separately. No application console errors. Live 1440 and 375 screenshots opened; phone has no horizontal overflow. Viewport override reset.
- Receipts and synthesis: runs/reviews/frontier-outliers/. Screenshots: runs/mockups/frontier-outliers/shots/live-desktop-1440.jpg and live-phone-375.jpg. Scratch snapshot server stopped after live proof. This closeout commit changes only docs/worklogs/ under the landing evidence exception.
