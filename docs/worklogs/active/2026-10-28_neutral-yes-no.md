# Neutral YES/NO readout

User request: the readout should be more neutral after Qwen declined May's battle. Scope: replace the other-option imperative with a fixed YES, NO control mapping, preserving current selection and grounded B semantics. No gameplay input, active-run changes, launches or unrelated readout rewrites.

Evidence: run 88ea seq59140 delivered YES selected with "To answer NO"; seq59153 explicitly called that "instructions", seq59154 deliberately pressed DOWN,A; repeated refusal at seq59242 used B. Influence is plausible, not causally established by narration. Party was healthy. No claim that neutral copy improves gameplay without a measured comparison.

Feature-switch, game-state and feature-explainer skills applied. New neutral-yes-no-readout-v1 defaults OFF and needs yes-no-answer-readout-v1. OFF reproduces prior wording; disabling parent suppresses both. Source checkout verified clean at731ad5bfd6e6f265508d0efcca0ba42f9dcf5881; Task_HandleYesNoInput maps B and1 to NO,0 to YES. Existing verified phase coverage retained.

RED: new production format_readout tests failed against prior implementation:121fail,152pass. GREEN:273pass after replacement, with original tests explicitly selecting legacy mode. Test runner uses PYTHONPATH=env so the owned worktree is imported rather than the canonical editable installation.

Pending: registry/build/lint, production wiring mutation, independent review and landing. Active Qwen untouched. Readiness: menus occur before early confirmations, no milestone barrier; no probe or experiment authorized/launched.

Production format_readout wiring mutation (neutral=False) caused all116neutral field cases to fail; restored. Build PASS after adding the optional-key type exclusion alongside the existing schema filter. Targeted TS registry suite30PASS. Full gate was started before receiving CPU coordination note, then terminated for urgent shared CPU work; this is an incomplete gate, not a pass. Queued a request via talk-to-claude; mailbox said saved/no listener. Current lint was allowed to finish; no further heavy checks until grant. No main move or viewer restart.

Latest focused Python check274PASS including reparsing the recorded native clock fixture through read_state -> render with both switches enabled. Shared CPU queue acknowledged by Claude: cap, type-gap control, YAML, scene capture, then this branch. Full gate remains pending until START.
