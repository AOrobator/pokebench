# Destination-first navigation guidance

Authorized by the operator: "okay lets make this change, on in both arms", following the agreed system-prompt, tool-description and result guidance proposal.

One bounded milestone: align destination selection guidance across the existing prompt and tool delivery owners. Register `destination-first-navigation-v1`, omitted/false OFF preserves previous bytes, enable explicitly in the shared current control/bundle recipe. No new tool, action, planner, guard, route knowledge, inference traffic, active-run intervention or historical preset rewrite. Keep existing stride and input execution unchanged.

Production scope: features.ts, play-preset.ts, play-config.ts, play-wiring.ts, navigate-first.ts and a small destination-first.ts policy module; viewer defaults/explainer mapping; current recipe. Readout presentation operates on existing tool-result text and leaves native state and game dialogue unchanged. Preserve raw recording/state and existing viewer event owners.

- [ ] RED: production-factory delivery, prompt conflict removal, OFF invariance and both-arm configuration tests.
- [ ] GREEN: implementation, operand deletion/restoration receipts, normal gates and local explainer proof.
- [ ] Independent review and review synthesis; landing only after the repository gates, then coordinated viewer proof.

Readiness: navigation is already exercised in current Qwen run 9c88. This is an operator-authorized shared guidance change, not a measured performance improvement. Future measurement should compare valid destination/tool selection, manual walking calls, recovery, native progress and elapsed time at matched navigation decisions. No probe or gameplay launch authorized here.

RED commit `8b4ca0507`: focused test failed because destination-first.js did not exist. An initial `pnpm test -- <path>` mistakenly selected the whole suite and was stopped; the direct `pnpm exec vitest run <path>` invocation isolates the intended tests. Initial GREEN attempt exposed an unchecked fake press (replaced with the production required executeChecked seam) and an unfrozen semantic-navigation legacy fixture (moved to the existing LEGACY_ALL_ON owner rather than maintaining a growing exclusion list).

Implementation checks: 4,808 agent and 2,228 viewer tests pass. First Python gate lacked the worktree-local .env/compiled binding; retained the failure receipt (265 failed, 3,812 passed, 536 skipped, four errors; missing POKEBENCH_ROM). Reused the configured external ROM via a .env symlink and copied only the existing compiled mgba Python package into this worktree venv; no shared runtime changed. Second normal full gate in progress. Lint test non-null assertions replaced with a typed must helper.
Six performed mutations each returned RED: prompt factory wiring, final tool factory wiring, connection projection, immediate feedback, field lock operand, shared recipe activation. Restored focused suite GREEN; receipts under ignored runs/reviews/destination-first.
Headless local explainer screenshots inspected at 1280/1440/375; removed an SVG min-width that clipped the diagram at phone width. Scratch replay fixture is explicitly synthetic, derived from 9c88 state 2925/result 2926; no emulator/model traffic. Initial preview omitted required assistant fields, caught by schema validation; removed that synthetic assistant row and checkEvent now validates every fixture row.
