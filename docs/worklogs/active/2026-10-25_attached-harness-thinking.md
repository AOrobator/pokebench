# Attached harness thinking preservation

User request, 2026-10-25: preserve thinking when attaching Codex, Claude Code or Cursor, for behavior analysis and possible future smaller-model improvement.

Bounded outcome: record the requirement in repository instructions and the existing attachment/run-coordination workflow. There is no shared external-harness adapter in tracked source today; Astra's adapter is an ignored one-off bridge. This change requires future adapters to prove capture before attachment and explicitly discloses that it adds no runtime archiver or automatic launch guard. Do not represent procedure text as implemented integration.

Included: native transcript retention, supported summary configuration before play, actual-session/source identity, per-decision evidence association, fake rehearsal, explicit operator exception when readable reasoning is unavailable, coverage/failure reporting, provenance for potential training use, and preservation of active runs and historical recordings. No new skill, dependency, model prompt/tool, gameplay behavior, viewer rendering or timeline event. Measurement/workflow only; no behavior switch. No new experiment or training job is authorized.

Evidence: `runs/reports/astra-reasoning-audit/` in canonical checkout contains passive exports. Latest inspected Codex player had medium effort, summary none, and empty readable summaries. Wrapper text was short action commentary, not preserved thinking. Opaque encrypted records provide continuation state, not readable reasoning. Source link is included in the procedure. Current active worklog pointer was read, but this independent worktree uses its own ignored pointer to this worklog.

Validation plan: inspect the complete prose diff, verify local link targets and skill discovery symlink, check whitespace and scope, and obtain independent review. No runtime code changed: RED/GREEN, benchmark launches, viewer screenshots and coverage reruns do not validate a prose procedure and are not claimed. Before claiming future adapter capture, the required fake rehearsal and real source/archive proof must occur for that adapter.

Status: implementation drafted on isolated branch; review and landing receipts pending. Existing player, gateway and game server remain untouched. Terminator: reviewed procedure committed; landing remains subject to the existing cloud-review and landing-board rules. Split trigger: implementing a common adapter/archive runtime or changing an existing live bridge is a separate concrete implementation task.
