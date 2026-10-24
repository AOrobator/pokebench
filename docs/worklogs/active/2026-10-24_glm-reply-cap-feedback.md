# GLM reply cap and truthful cut-off recovery

User authorization: raise GLM to 8192 in bundle only; supervisor fix in both arms; no new runs. One implementation milestone.

## Contract
- GLM 1h/2h/4h definitions: control 4096, bundle 8192 via optional definition.bundleMaxTokens. Other model sampling unchanged. Feature-recipe overlays retain the target model cap.
- Repair existing cut-off-reply-feedback-v1; OFF stays byte-identical. Enable it in both arms of current recipes, including GLM.
- Every delivered recovery after a length/no-tool reply names the configured limit, including due supervisor notes and fixed-point notes. Recorded supervisor/loop-breaker payload equals model delivery; replay retains it.
- No GPU traffic, new gameplay, runner approval, launch, or active-run mutation. Test streams and fake-host rehearsal only.

## Scope
Governor, play wiring/live, fixed-point recovery, decision-probe wiring, fixed-definition schema/preset, recipe configuration, tests, existing cut-off explainer/catalog. No new tools, timeline marks, trainer-card presentation, or model-SKU matching.

## Milestone
- [x] RED tests: Governor drops CUT when supervisor due; fixed-definition parser rejects bundleMaxTokens; recipe assertion fails. Added production delivery/replay tests. Initial viewer attempt lacked agent dist; built it before meaningful RED rerun.
- [ ] GREEN implementation and commit
- [ ] Adversarial wiring deletion and restoration
- [ ] Full tests/lint/build/coverage/vendor gates
- [ ] Fake runner verifies arm presets and chaining
- [ ] Principles self-review and frozen cloud review
- [ ] Landing board / landing / viewer proof if reviews permit

## Evidence
4f08: 6 length/no-tool replies, 26.2324 minutes, sampling 4096, cut-off switch ON. 0d5d: first 28 cost 82.8184 minutes; full retained log has 124. These are interrupted-reply latency, not guaranteed recoverable time.

## Session log
- Read CLAUDE, active pointer/body, feature-switch, feature-explainer, agent-observability, close-the-loop, talk-to-claude and review contracts. Isolated worktree from 7133032cc. No changes in canonical checkout.
