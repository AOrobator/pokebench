# Background browser verification

Operator 2026-10-22: browser tests stealing desktop focus are extremely disruptive; update the skills so agents do the work in the background.

Scope: instructions only. CLAUDE.md routes all agents to a focus-preserving browser rule; viewer-e2e specifies the background-only procedure; close-the-loop follows it when collecting clicks, screenshots and live proof. No application code, gameplay, browser automation or desktop input is changed or executed for this documentation correction.

Required behavior: use a documented focus-preserving context, prefer an agent-owned headless browser, do not activate the user's tabs/windows, do not use global keyboard/mouse for routine proof, inspect screenshots without opening desktop applications. If the available tool cannot preserve focus, leave that check pending and report the limitation. Explicit permission to show or interact with a foreground surface applies only to the requested operation, never routine testing. Relay the boundary to subagents.

- [x] Instructions updated and skill metadata validated.
- [x] Review and local-main landing through the shared board.

Validation: documentation-only; no foreground browser checks are needed to verify the wording change. No task-specific tests will be added that merely match instructions.

Validation: both skill-creator quick_validate checks PASS; git diff --check clean. Existing .agents/skills/viewer-e2e points to shared .claude skill. Documentation-only boundary: CLAUDE.md, viewer-e2e and close-the-loop; screenshot and browser interaction requirements remain, subject to focus preservation. No automation tools are operated to validate this correction.

Landing proof: reviewed source `61c26ca0ca0e90212eafd08b51eb87fe86d25a5c` landed ff-only while this branch owned board slot 1. Build, lint, test, coverage and vendor gates PASS; post-main tests PASS (agent 4506, viewer 1690, Python 3960). Claude and independent GPT reviews LGTM; Cursor Grok returned ActionRequiredError/out-of-usage, so an independent gpt-6.1-sol fallback reviewed LGTM under the operator's standing Grok-outage waiver. This has reduced vendor diversity; no Grok approval is claimed. Frozen diff SHA256: `28e62a60877e1560b30311a388db2e8ce2885a198e9d9bb736cde7cf87f5e432`.

Review and gate receipts: `runs/reviews/background-browser-20261022/`. Required viewer refresh completed in the background; build stamp names clean source `61c26ca0ca0e90212eafd08b51eb87fe86d25a5c`, sole 8790 listener PID 60157, workbench has no older-build problem, and all eight captured gameplay/server/controller processes survived. See `live-proof.json`. Current runs and automatic-start schedule remain untouched. No browser window or native input was used for this task. These are agent instructions, not a mechanical focus guard in the automation tools. Active Codex owner and Claude relay were notified to reread the shared rules and propagate them to subagents.
