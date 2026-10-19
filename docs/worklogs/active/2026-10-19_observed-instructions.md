# Observed instruction memory

Operator: "ok lets do it, new switch, in the bundle" (2026-10-19).

## Contract
Add `observed-instructions-v1`, default OFF, ON only in the fixed bundle treatment. Preserve complete delivered field-dialogue episodes containing an explicitly identified story character, with exact text, speaker attribution source, map/state/event provenance, across later conversations and context pruning. Present YAML separately from observed progress. No semantic objective extraction, model calls, objective tools, forced writes, auto-retirement, route knowledge or gameplay actions. Repeated identical episodes deduplicate; unique episodes stay for the run, without silent clipping. Progress comes only from delivered observation text, never model claims. Old instructions are historical evidence, not an active-goal directive.

Use the existing ledger_context recording/Activity History owner; no new event types or TIMELINE additions. Evidence metadata is bounded by its existing 64-reference schema; full references remain in YAML. Preserve exact OFF context/tool behavior.

## Milestone
M1 RED → GREEN: production context chain, exact text/provenance, retention through newer conversation/arrival/pruning, failed delivery/battle/unknown attribution, registration/defaults/state-only conflict, pending experiment, bundle, explainer/card. Delete/restore production wiring. Gates and real-browser delivery proof. Frozen three-cloud-lane review, local fast-forward landing only if approved; no experiment approval or launch.

## Source and evidence
- Reference pret/pokeemerald clean at 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.
- PetalburgCity_Gym_Text_DadGoCollectBadges explicitly separates heading for RUSTBORO CITY, challenging ROXANNE, other GYMS and future battle with DAD.
- Oct19 OPEN-QUESTIONS.md #8 reports complete Norman dialogue surviving while city-arrival goal remains prominent inside Gym. This motivates representation, not a measured benefit claim.
- First version deliberately retains whole story-character conversation episodes rather than claiming to classify player-directed imperatives or infer addressees.

## Session log
- Isolated from clean local main in codex/observed-instructions. No shared runtime, benchmark, or other worktree changed.
- Read feature-switch, feature-explainer, experiment-queue, patch-evaluation, game-state, observability, close-the-loop and review contracts.

## Review log
Pending.
- RED: initial fixture validation failures corrected (missing auto-advance envelope fields and invalid stop value), retained both failed attempts. Schema-valid RED fails only missing preservation/registration assertions; OFF and rejected-page cases pass.
