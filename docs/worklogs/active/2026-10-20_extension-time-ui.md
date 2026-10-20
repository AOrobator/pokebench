# Extension timing UI repair

Operator request: audit broadly using subagents, report first, implement all identified UI timing gaps, review, land on main and restart viewer.

Base: 0924e149. Owned worktree: /private/tmp/pokebench-extension-time, branch fix/extension-time-ui.

Audit: three read-only subagents covered viewer, stats/comparison and backend/runtime. Consolidated report: docs/reports/2026-10-20_extension-time-audit.md. Report read before implementation.

Plan: RED regressions; GREEN effective cap presentation, acknowledgement reconciliation, copy/metadata, feature-history horizon; gates; frozen Claude/Grok/GPT review; fast-forward landing and viewer-only restart. Preserve original recordings, benchmark horizons and live game processes. No new harness behavior or experiments.

Status: audit/report complete; implementation next. Landing/restart not yet performed.

Implementation: shared effective cap/details; selected live-card ACK reconciliation; Copy Live effective limit; original/effective metadata; feature-history original active horizon. Fail-first receipts: /tmp/extension-{stats,viewer,history}-red-green.txt. Focused suites: stats97, viewer136, history9 pass. Full tests: 2846 agent /1410 viewer /2896 Python, zero skips. Lint/build/vendor pass. Initial worktree failures were missing built browser modules and native mGBA binding; resolved via completed build and existing installed native runtime link, no test changes. A direct Python coverage command lacked dotenv and is discarded; repository coverage rerun uses just with .env.

Browser preview: isolated startViewer on8793, scratch-only root /tmp/pokebench-extension-preview-runs, health stub18999, no autorunner or live game writes. Copied recorded frame visible under paused overlay; intentionally unavailable live frame socket emits expected preview warnings. Stats paused card20:00/1:00:00 for original30m; viewer card/header/sidebar agree; extension dialog1h→1h30; Copy Live input60minutes; metadata explicitly exposes3600000. Real stats before fix: all3 live API caps2h, cards1h. Screenshots under canonical runs/mockups/extension-time-ui/shots. Main advanced to c124ed3f during gates; sync before frozen review next.
