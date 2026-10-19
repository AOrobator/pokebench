# Battle decision readiness

## Problem Statement
The operator approved fixing the encounter-message / battle_action refusal cycle and enabling the repair in both control and bundle (2026-10-19: "ok lets make that fix and include it in control and the bundle"). This follows the reviewed proposal in this chat: settle non-choice battle text before model requests and defensively before battle_action; stop at every real choice.

## Skills Loaded
feature-worklog, feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, close-the-loop, execute-worklog; cloud review contract.

## Architecture
Reuse battle-text-auto-advance's source-grounded classifier, bounds, journal and dialogue_auto_advance recording. Add default-OFF battle-decision-ready-v1, dependent on battle-text-auto-advance-v1. Wrap observe to settle pending battle text and return its final screenshot/readout plus all pages. A pre-request transform checks fresh state and invokes that observation only when engaged, before context ledgers and JIT snapshot construction. battle_action uses the same routine before validation; no requested action runs across an intervening prompt, battle end, unknown state or exhausted bound. Existing refusal/no-press contract remains true for the action itself; preflight button presses are separately recorded. OFF preserves existing tools and request context by identity. The fixed bundle-v-control definition lists this in onInBoth, never switches; historical source, approvals and records remain untouched.

## Invariants
- INV-1: OFF preserves old tool behavior, descriptions and transforms. Production-factory identity and legacy refusal tests.
- INV-2: Only native non-choice messages get B; animations get bounded waits; prompts/menus stop. Source-grounded classifier and recorded fixture tests.
- INV-3: No stale move is executed after a boundary or failure; fresh state is validated and preflight pages remain in returned/model context. Production tool tests.
- INV-4: Both comparison arms include the same repair, without changing treatment membership or immutable control-base bytes. Parse both effective presets and verify control-base validation.
- INV-5: Automatic presses, ordered text, stop and final state are recorded through existing event owners and rendered by existing Activity History/replay consumers. Schema-valid fixture replay.

## Security Review
No game-memory writes, save edits, vendor edits, new network surface, local inference use, experiment approval or launch. All inputs use ordinary checked press and native waiting. Signal cancellation and existing pause gate remain authoritative.

## Milestones
- [ ] M1: RED regressions and commit.
- [ ] M2: Implementation, metadata, explainer and both-arm definition; GREEN gates and mutation proof.
- [ ] M3: Recorded/native probe and viewer/explainer proof; principles self-review and frozen cloud reviews.
- [ ] M4: Fast-forward local landing after required cloud approvals, viewer restart and live proof.

## Closing the Loop
Prove production entrypoint context delivery, repeated battle_action calls, prompt stops, OFF parity, finite caps and both-arm configuration. Run full tests/coverage/lint/build/vendor gates; inspect recorded pages and final state in replay and actual viewer. Do not launch measured trials.

## Session Log
- Created isolated worktree from clean main 3c626e32. Source reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 is clean; TextPrinterWait/WithDownArrow use JOY_NEW(A_BUTTON | B_BUTTON), src/text.c:865-899. Existing classifier separates message_waiting, busy, prompt, input and screen owners.

## Surprises
- Current refusal bypass and its test intentionally guarantee no buttons for refused calls; repair must make preflight explicit rather than silently falsifying that receipt.

## Multi-Model Review Log
Pending.

## Boy Scout Log
No unrelated changes.

## Archive Milestone
- [ ] User-approved archival; keep active until requested.
- M1 RED: added encounter observe, battle-action preflight, real-choice boundary and OFF regressions; current implementation fails ON cases (receipt /tmp/battle-ready-red.log).
