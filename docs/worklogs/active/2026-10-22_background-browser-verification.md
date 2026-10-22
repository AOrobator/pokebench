# Background browser verification

Operator 2026-10-22: browser tests stealing desktop focus are extremely disruptive; update the skills so agents do the work in the background.

Scope: instructions only. CLAUDE.md routes all agents to a focus-preserving browser rule; viewer-e2e specifies the background-only procedure; close-the-loop follows it when collecting clicks, screenshots and live proof. No application code, gameplay, browser automation or desktop input is changed or executed for this documentation correction.

Required behavior: use a documented focus-preserving context, prefer an agent-owned headless browser, do not activate the user's tabs/windows, do not use global keyboard/mouse for routine proof, inspect screenshots without opening desktop applications. If the available tool cannot preserve focus, leave that check pending and report the limitation. Explicit permission to show or interact with a foreground surface applies only to the requested operation, never routine testing. Relay the boundary to subagents.

- [x] Instructions updated and skill metadata validated.
- [ ] Review and local-main landing through the shared board.

Validation: documentation-only; no foreground browser checks are needed to verify the wording change. No task-specific tests will be added that merely match instructions.

Validation: both skill-creator quick_validate checks PASS; git diff --check clean. Existing .agents/skills/viewer-e2e points to shared .claude skill. Documentation-only boundary: CLAUDE.md, viewer-e2e and close-the-loop; screenshot and browser interaction requirements remain, subject to focus preservation. No automation tools are operated to validate this correction.
