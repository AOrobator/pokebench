# Trainer card artwork loading

User follow-up: fix delayed bottom-sheet backgrounds. Viewer-only scope: publish usable artwork before optional font completes, preload small card backgrounds, cache only allowlisted sprite assets with bounded freshness and content validation. Preserve all controls/provenance, no experiment/gameplay changes. Use owned existing worktree on codex/viewer-card-art from current main; canonical main protected.

Evidence: wide backgrounds2.2-2.4KB, font metadata5630B/image6719B; localhost asset requests each about1ms. No evidence bitmap decoding itself is slow. Confirmed serial manifest/font/image gating and no-store sprite responses; background requests not preloaded. Phone bottleneck attribution still unmeasured. Prior task Claude exception remains authorized in this same viewer work; try cloud lane again, never call missing lane approval. Plan RED/GREEN, full gates, frozen independent reviews, scratch browser proof, local landing and restart/live proof within original user authorization.

RED: pending-font callback and real HTTP cache/revalidation regressions added before implementation.
