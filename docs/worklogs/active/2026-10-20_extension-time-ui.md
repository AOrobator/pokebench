# Extension timing UI repair

Operator request: audit broadly using subagents, report first, implement all identified UI timing gaps, review, land on main and restart viewer.

Base: 0924e149. Owned worktree: /private/tmp/pokebench-extension-time, branch fix/extension-time-ui.

Audit: three read-only subagents covered viewer, stats/comparison and backend/runtime. Consolidated report: docs/reports/2026-10-20_extension-time-audit.md. Report read before implementation.

Plan: RED regressions; GREEN effective cap presentation, acknowledgement reconciliation, copy/metadata, feature-history horizon; gates; frozen Claude/Grok/GPT review; fast-forward landing and viewer-only restart. Preserve original recordings, benchmark horizons and live game processes. No new harness behavior or experiments.

Status: audit/report complete; implementation next. Landing/restart not yet performed.
