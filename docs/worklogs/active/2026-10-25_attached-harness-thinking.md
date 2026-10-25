# Attached harness thinking preservation

User request, 2026-10-25: preserve thinking when attaching Codex, Claude Code or Cursor, for behavior analysis and possible future smaller-model improvement.

Bounded outcome: record the requirement in repository instructions and the existing attachment/run-coordination workflow. There is no shared external-harness adapter in tracked source today; Astra's adapter is an ignored one-off bridge. This change requires future adapters to prove capture before attachment and explicitly discloses that it adds no runtime archiver or automatic launch guard. Do not represent procedure text as implemented integration.

Included: native transcript retention, supported summary configuration before play, actual-session/source identity, per-decision evidence association, fake rehearsal, explicit operator exception when readable reasoning is unavailable, coverage/failure reporting, provenance for potential training use, and preservation of active runs and historical recordings. No new skill, dependency, model prompt/tool, gameplay behavior, viewer rendering or timeline event. Measurement/workflow only; no behavior switch. No new experiment or training job is authorized.

Evidence: `runs/reports/astra-reasoning-audit/` in canonical checkout contains passive exports. Latest inspected Codex player had medium effort, summary none, and empty readable summaries. Wrapper text was short action commentary, not preserved thinking. Opaque encrypted records provide continuation state, not readable reasoning. Source link is included in the procedure. Current active worklog pointer was read, but this independent worktree uses its own ignored pointer to this worklog.

Validation plan: inspect the complete prose diff, verify local link targets and skill discovery symlink, check whitespace and scope, and obtain independent review. No runtime code changed: RED/GREEN, benchmark launches, viewer screenshots and coverage reruns do not validate a prose procedure and are not claimed. Before claiming future adapter capture, the required fake rehearsal and real source/archive proof must occur for that adapter.

Status: reviewed procedure landed on main as `8e93027a792bc55ee2a9c59fa2c224af545b2975`; postmerge `just test` PASS. Existing player, gateway and game server remain untouched. Terminator reached for this procedure. Split trigger: implementing a common adapter/archive runtime or changing an existing live bridge is a separate concrete implementation task.

## Review and landing evidence

Original frozen packet: base `6ba658432dd63e195e3b2697003277807e7832d8`, head `a61992fbcf02cbe3a37e486f1f554375f4cba135`, binary diff SHA256 `a83541215fd882fdd58512336282eb5b4318ce45e56c1a7b750c38d6855ec950`. Claude CLI exit0, empty stderr, one successful result ending `VERDICT: LGTM`; independent normal GPT `/root/capture_workflow_review`, fallback `/root/capture_fallback_sol` (gpt-6.1-sol/high) and `/root/capture_fallback_astra` (gpt-6-astra/high) each returned `VERDICT: LGTM`. Every PB1–PB13 row reviewed, zero FAIL. All nine test-quality dimensions N/A for prose-only changes. Three nonblocking Claude observations and dispositions are retained in `runs/reviews/attached-harness-thinking/synthesis.txt`; no accepted fixes or source growth.

Grok Cursor exit1: `ActionRequiredError` / out of usage, never approved. Direct human approval in this chat: "Yes, use the fallback reviews and land it." Reduced vendor diversity retained; this is the explicit unavailable-cloud-lane landing exception, not a claim Grok returned LGTM.

Main advanced only by an unrelated worklog evidence update. Synced base `01b91e706311248e067d80ad6a78a2ddae8b8118`, final head `8e93027a792bc55ee2a9c59fa2c224af545b2975`; own binary diff retains the exact reviewed SHA256. Final synced build, lint, test, coverage and vendor verification all PASS. Agent4448, viewer2011, Python4425 tests plus trainer guard and approved visual baselines at1280/1440/375 PASS. Coverage lines/branches/functions: agent99.17/92.76/97.60, viewer98.20/91.60/95.33, Python97.47/93.58/100, all above90. Initial isolated-checkout trainer test failed because ignored local art was absent; read-only `POKEBENCH_CARD_ART` pointed at existing approved canonical assets, then full tests passed. No baseline, timeout, test or production source changes.

Joined board at number1 with actual Codex session `00000000-0000-4000-8000-f3d3740ffcf6`; main fast-forwarded to exact final head. Coordinated a CPU handoff to viewer-state-retention before the required postmerge suite, then resumed only after explicit6:56PM EDT release. Postmerge main `just test` exit0: same4448/2011/4425 plus guard and all three visual checks PASS. Logs, packet identity, user approval, synthesis and live receipts remain in canonical ignored `runs/reviews/attached-harness-thinking/`.

Live proof: canonical CLAUDE and skill sections present; Astra429f remains live without a reported problem, and player/bridge/game-server PID identity and start times match the premerge snapshot. No viewer restart, inference launch or gameplay input. This procedure does not install a recorder or establish active thinking capture. The earlier passive native transcript snapshot remains explicitly bounded to its captured range.

Evidence-only landing record: only this worklog is changed after the reviewed merge; no runtime/source change.
