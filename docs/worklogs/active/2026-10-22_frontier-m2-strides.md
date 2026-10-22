# Frontier M2 checked requested strides

User approved implementation of frontier worklog; this isolated packet covers E1/E6/E8/E16 only. No gameplay, experiments, GPU changes or service restarts authorized/performed.

Contract: rejected-movement-stride-v1 defaults OFF; with original navigation-tool-use guard ON, takes precedence over rejected-movement-step-v1. Uses existing planStride/native checked stride for one straight safe prefix of the model's requested directions (max eight), stops BEFORE bends, grass, obstacles, warps, triggers, unknown geometry and elevation changes. Discards remainder and returns observation plus requested/submitted/dropped and native completed receipt. Does not invent directions, enter triggers, or continue after interruption. Existing trigger boundary remains separate.

- RED: production regression added for prefix, OFF parity, hazard ends, unknown geometry, interruption and guard OFF.
- Existing navigation-strides tests ground safe geometry; trigger boundary tests will be rerun.
- Pending: implementation, gates, wiring deletion, explainer/pending entry/bundle settings and review.

2026-10-22 execution: RED commit f294bd936 produced 9 failures / 2 passes. GREEN focused production/geometry/trigger tests: 25 passed. Deleting the production toolSwitches mapping reproduced 9 failures / 2 passes; restored. Agent tsc/eslint passed. Existing trigger-navigation tests verify bounded goal-entry behavior; contract unchanged. Source reference pret/pokeemerald at 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean. No game source/RAM mapping changed.

Registered default-OFF treatment, appended metadata, optional schema/default normalization and prompt explanation; pending single-feature experiment keeps safe-native-strides and original guard ON in both arms. Five currently configured bundle definitions add treatment ON/control OFF without changing frozen control-base files. Themed tracked explainer/card mapping/byte-serving tests added. pages-check printed no diagnostics.

Full isolated agent suite: 4354 passed, 167 failed across 97 files, primarily historical feature-tail/count/explicit-flag fixtures affected by appended feature. Parent owns combined registry reconciliation to avoid overlapping edits across parallel packets. Full integration gates, cloud review, browser/screenshots and post-landing proof remain parent responsibilities; no claim of completed landing or gameplay benefit. No probes, gameplay, experiments, GPU activity, canonical viewer restart or main mutation.

GREEN validation additions: agent build passed. Viewer normalized bundle-only tests (five definitions), Harness Config card link and HTTP byte-serving: 7 passed, 329 unrelated skipped. These verify generated arm presets, rather than JSON source flags alone. Canonical runtime is unchanged.

Lint correction: the initial background lint header was incorrectly reported as success before completion. Final ESLint found fixture non-null assertions/stringification and a redundant direction guard. Corrected; tsc/build had passed. Full lint is rerun explicitly after these fixes. This receipt supersedes the earlier premature lint claim.
