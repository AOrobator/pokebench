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

## Review round 1 / CPU hold
- Frozen a1d1fa341..2beab854f, digest 735f483e6314910c1d16f1614a2f9087be5c8958a72cc7d32196bc9e406d72a4. Claude cloud LGTM; Grok both routes unavailable (usage quota). GPT BLOCKING for exact breaker-record/model equality evidence. Reduced-diversity Sol/Astra BLOCKING for missing ordinary-stop predicate qualification; Astra also found a concrete flipped replay bug (recorded ON supervisor prefix survives replayed OFF).
- Accepted all three in-scope findings as one R2 batch. Wrote regression tests (uncommitted, RED pending), including ON↔OFF due-supervisor probe, exact breaker payload equality, feedback-ON ordinary-stop negative cases. Prepared source patch at runs/glm-feedback-proof/replay-repair-candidate.patch but deliberately have not applied it before observing RED.
- CPU hold received: item3 recovery owns exclusive up to480s from4:22PM EDT; all heavy suites held until release. No heavy jobs remain here. Need focused RED/repair/mutations/restoration, integrate recovery main and new normal full gates in the coordinator's granted window, then frozen R2 cloud/fallback review. Fallback cannot approve missing Grok lane for self-landing. No new runs/restarts/active-run edits.

## Roster correction — verified existing human waiver
- Corrected earlier statement that Grok unavailability itself blocks landing. Verified cited human message [private message reference] at2026-10-22T14:47:31Z, retained in Claude project transcript 00000000-0000-4000-8000-1bb4e739f4f4.jsonl record 00000000-0000-4000-8000-4639412e09f1: “land without grok. you're not a very good coordinator if you force me to go into chats”. Exact source/citation retained under runs/glm-feedback-proof/grok-waiver-citation.json.
- The coordinator confirmed this existing project waiver applies here. Do not request duplicate permission. Keep both actual Grok quota failure receipts and disclose reduced vendor diversity. Required final frozen roster: Claude cloud + normal isolated GPT + fresh distinct-model fallback reviews; all must be clean. Normal gates and landing-board protocol remain required. The fallback alone never grants a waiver; the verified human instruction supplies the roster amendment.
- Actual remaining work: replay/feedback regression repair, adversarial qualification and restored GREEN, fresh full gates after recovery integration, final frozen R2 reviews, then landing board. This correction grants neither CPU admission nor gameplay launch. Heavy work remains held.

## Resume authorization
- The operator explicitly instructed this chat to keep going, finish the replay fix, run checks when the CPU window opens and land once reviews pass; do not launch new runs. Requested focused RED/repair/mutation slot and normal gates from coordinator. At16:39 EDT coordinator confirms recovery qualification released16:33:49 but separate recovery landing/build/test/refresh window is still held; interface and whiteout reservations follow. No CPU grant inferred. Offline regression preparation continues only.

- Offline R2 qualification preparation also covers the normal failureLimit3 threshold: bind a recorded supervisor to its exact assistant turn before stripping/recomposing its cut-off prefix. Without this existing event-owner binding, a future due note is attached to the first silent reply and the ON/OFF repair is incomplete for normal settings. Added an eight-turn fixture at threshold3 plus consecutive threshold1 notes, all in the existing live fixture seam; candidate patch remains unapplied pending RED/grant.

- Recovery implementation reached main429375802 while its post-landing verification/refresh continues. Its diff repairs live-human and serial-comparison fixtures plus the existing live entrypoint dispatch seam. Integrating it offline before this branch's granted qualification; no tests/builds started here.
