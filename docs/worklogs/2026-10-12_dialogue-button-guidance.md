# Dialogue button guidance

Operator request (2026-10-12 ET): use B to dismiss ordinary dialogue rather than repeated A presses that can restart NPC interactions; implement and land this prompt correction.

Scope: the gameplay system prompt only. Prefer short B batches and observation, stop dismissing once field controls are available, reserve A for interactions/confirmation, and warn that B cancels menus. Do not change existing runs, inputs, tools, budgets, state readers or other chats' branches.

Evidence: Qwen run 2026-10-12T02-15-39_Qwen3.8-Flash-Next-UD-IQ4_XS_d9cc turns169–175 repeatedly press A in Birch's lab; turn176 mixes A/B and controls become available. Matching source text.c TextPrinterWait/WithDownArrow accepts A or B; field_control_avatar.c FieldInputHandle starts interactions on pressedAButton.

- [x] Update the future-run gameplay prompt.
- [x] Agent type/lint and build checks passed; exact prompt diff inspected. No string-mirroring test or new benchmark run is needed for a prompt-only edit; behavioral improvement remains unproven.
- [ ] Land the isolated patch after the gameplay runner reaches main; preserve the existing revert sequencer and untracked skill files.

Review: one frozen round requested by operator. Full selected roster, no subagents; principles and receipt artifacts in /tmp/pokebench-dialogue-review. Only prompt and this worklog are included.

Review closure: one unchanged candidate round, ce54868..4883337, SHA256 c937d2b3a5e00e13052997f2a8e2acf3d36f638a1ebb4111c294140c3583056c. Claude, Grok, GPT, think-fast and think-swarm all return valid terminal LGTM. Claude's background prose required same-packet completion repair; Swarm's menu-like objection contradicted the explicit menu warning and ordinary-dialogue handlers, resolved against text.c/scrcmd.c/std message source, then literal-verdict format repair. Invalid/initial receipts are retained, not approval-counted. No implementation change or new review round. Synthesis includes all PB1–PB13 and nine test-quality checks. Model compliance/improvement is unproven; no existing run mutated.

Landing prerequisite: canonical main still9ac9325 has no packages/agent/src/live.ts or run-agent recipe. The separate story integration owns the gameplay runner's landing. Do not import that unlanded implementation solely for this prompt patch. Patch is committed and reviewed; await integration or operator-authorized handoff. Canonical sequencer and untracked skills remain untouched.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-12). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
