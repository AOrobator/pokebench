# Frontier M2 checked requested strides

User approved implementation of frontier worklog; this isolated packet covers E1/E6/E8/E16 only. No gameplay, experiments, GPU changes or service restarts authorized/performed.

Contract: rejected-movement-stride-v1 defaults OFF; with original navigation-tool-use guard ON, takes precedence over rejected-movement-step-v1. Uses existing planStride/native checked stride for one straight safe prefix of the model's requested directions (max eight), stops BEFORE bends, grass, obstacles, warps, triggers, unknown geometry and elevation changes. Discards remainder and returns observation plus requested/submitted/dropped and native completed receipt. Does not invent directions, enter triggers, or continue after interruption. Existing trigger boundary remains separate.

- RED: production regression added for prefix, OFF parity, hazard ends, unknown geometry, interruption and guard OFF.
- Existing navigation-strides tests ground safe geometry; trigger boundary tests will be rerun.
- Pending: implementation, gates, wiring deletion, explainer/pending entry/bundle settings and review.
