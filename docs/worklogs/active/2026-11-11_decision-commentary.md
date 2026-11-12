# Decision commentary and readable agent text

## Problem Statement
The operator requests extra observability early in the Astra run. Native Responses often returns only tools. The viewer also hides reply text when thinking exists and clears its panel at the next turn. Build brief model commentary, clearly separate from exposed reasoning, without another provider request or wrapper.

## Skills Loaded
feature-switch, agent-observability, steady-screen, viewer-e2e, feature-explainer, execute-worklog, close-the-loop, talk-to-claude, multi-model-review.

## Architecture
One optional default-OFF `decision-commentary-v1` prompt paragraph flows through existing playSystemPrompt, including screenshot and JIT variants. No new tools or persistence: existing assistant.text, deltas and raw provider capture own storage. Viewer renders both fields with labels, retains latest nonempty text through tool-only replies and waiting, with original turn attribution.

## Invariants
- INV-1 OFF preserves prior prompts byte-for-byte; ON requests brief observable evidence/intent/action explanation, not private reasoning. Tests on actual prompt factory, screenshot and JIT core.
- INV-2 No extra model calls, parsing protocol, forced retry, gameplay action or stop condition. Existing recording remains authoritative.
- INV-3 Displayed commentary and reasoning remain distinct and HTML escaped; older text names its originating turn; replay never looks ahead.
- INV-4 Active ef7d runtime and logs untouched. Source readiness and landing do not authorize stopping/restarting gameplay or changing its prompt.

## Security Review
No credentials, network destination or persistence changes. Escape model-provided strings at renderer.

## Milestones
M1 — Source readiness: prompt switch plus panel readability through existing recorder/RunView/panels. Tests RED/GREEN, adversarial wiring removal, cheap checks, full gates, real recorded transcript check, isolated browser proof and independent reviews. Terminator: both fields visible, empty turns honest, latest text retained and attributed; no active-run mutation. Split triggers: new tool/provider, live prompt injection, new capture store, history redesign.
M2 — Landing: classify upstream impact, serialize local FF, post-main tests. No feature code.
M3 — Activation: viewer refresh and gameplay prompt activation require explicit operator decision after source is reviewable. Current run remains untouched.

## Closing the Loop
Focused factory/renderer tests; raw Responses to assistant.text/thinking reconciliation; headless built-viewer Chromium/WebKit desktop+phone streaming/poll continuity and replay; explainer card link/browser screenshots. Retain receipts under runs/decision-commentary-20261111.

## Session Log
- Authorized by the operator: “we're not that far in, i think it'd be worth building in some extra observability wdyt”. Implementation scoped to prior discussed short commentary and viewer readability.
- Base 49174be8b. Active runtime stays dc5436a3a. Existing viewer screenshot confirms blank active-turn panel.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] the operator approval to archive.
