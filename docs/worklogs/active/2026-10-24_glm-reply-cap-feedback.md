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
- [x] GREEN implementation: 35 targeted agent tests pass, fixed-design/recipe tests pass; fake-host audit helper corrected. Broader recipe index assertions updated for moving the existing switch into onInBoth.
- [x] Six adversarial wiring/cap deletions failed as intended; each restored in finally (runs/glm-feedback-proof/mutations.json and individual logs).
- [ ] Full tests/lint/build/coverage/vendor gates
- [ ] Fake runner verifies arm presets and chaining
- [ ] Principles self-review and frozen cloud review
- [ ] Landing board / landing / viewer proof if reviews permit

## Evidence
4f08: 6 length/no-tool replies, 26.2324 minutes, sampling 4096, cut-off switch ON. 0d5d: first 28 cost 82.8184 minutes; full retained log has 124. These are interrupted-reply latency, not guaranteed recoverable time.

## Session log
- Read CLAUDE, active pointer/body, feature-switch, feature-explainer, agent-observability, close-the-loop, talk-to-claude and review contracts. Isolated worktree from 7133032cc. No changes in canonical checkout.

- RED commit da8f38ef4. Production delivery tests failed on missing cap text in recorded supervisor. The existing recorded-context probe bypasses fixed-point collapse; full equality for that mode is not claimed when breaker is ON. Production-replayed derivation is tested instead; recorder/model payload equality remains required.

- First full test retry: agent 4232 passed; viewer 15 failures were hardcoded recipe positions shifted by removing cut-off feedback from switches, now adjusted by one while GLM positions stay unchanged. Coverage under load average 81.72 hit unchanged live-human timeout/assertion failures; retained /tmp/glm-coverage.log and will rerun separately. Build and vendor checks passed. Headless explainer checked at 375/1280/1440; screenshots inspected, no outer horizontal overflow.

- Sync main 2594c77ab (gym-door label shared in both arms). Resolved overlapping test expectations by retaining gym-label authorization and moving cut-off feedback to both arms too; positional assertions account for both removals. Prior lint overlapped the merge and saw conflict markers; discarded that attempt, rerun on resolved tree.

- Tightened delivery test to exact one fixed-point recovery event and payload-bearing assertions; added viewer schema/history/raw-inspector/replay tests for 4096/8192 notices. Registry copy assertion now reflects both-arm authorization for only the cut-off switch. Build clean passed on d44bcdb9e tree. Full gates now run without overlapping source mutations/merges.

- Corrected viewer replay fixture absolute timestamp (BASE_MS + offset), validated serialized events at schema boundary, and handled nullable eventText to satisfy lint. Targeted viewer set: 145 passed across 4 files. Full restored test gate still blocked by unchanged live-human import5s timeouts and serial-comparison child100ms startup deadline at load averages70-80; bounded two-worker attempt retained. No timeouts/guards/coverage gates altered. Coordinated CPU window and recipe consolidation ownership through talk-to-claude. Future consolidation must preserve feedback ON in both arms and GLM bundleMaxTokens8192.
