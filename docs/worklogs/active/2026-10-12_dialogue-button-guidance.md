# Dialogue button guidance

Operator request (2026-10-12 ET): use B to dismiss ordinary dialogue rather than repeated A presses that can restart NPC interactions; implement and land this prompt correction.

Scope: the gameplay system prompt only. Prefer short B batches and observation, stop dismissing once field controls are available, reserve A for interactions/confirmation, and warn that B cancels menus. Do not change existing runs, inputs, tools, budgets, state readers or other chats' branches.

Evidence: Qwen run 2026-10-12T02-15-39_Qwen3.8-Flash-Next-UD-IQ4_XS_d9cc turns169–175 repeatedly press A in Birch's lab; turn176 mixes A/B and controls become available. Matching source text.c TextPrinterWait/WithDownArrow accepts A or B; field_control_avatar.c FieldInputHandle starts interactions on pressedAButton.

- [x] Update the future-run gameplay prompt.
- [x] Agent type/lint and build checks passed; exact prompt diff inspected. No string-mirroring test or new benchmark run is needed for a prompt-only edit; behavioral improvement remains unproven.
- [ ] Land the isolated patch after the gameplay runner reaches main; preserve the existing revert sequencer and untracked skill files.

Review: one frozen round requested by operator. Full selected roster, no subagents; principles and receipt artifacts in /tmp/pokebench-dialogue-review. Only prompt and this worklog are included.
