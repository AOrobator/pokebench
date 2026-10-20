# Viewer head-first loading

Authorized: improve run switching so controls, current turn and timeline become usable from the head before history; review, merge local main and restart viewer.

Scope: viewer event transport, bounded head loading, background history hydration, browser rendering and regression tests. Preserve exact recording/replay, run identity, validated events and backend control authority. No gameplay, experiment or timeline-mark additions.

Plan: RED regression; GREEN head-first bootstrap with stale-selection and history handoff guards; full gates; browser proof on owned scratch data; frozen Claude/Grok/GPT review; fast-forward landing; viewer restart and live proof.

Baseline: main 0924e149. Existing Chrome tab 1657055904 at inference.example:8790 selects 2026-10-20T13-54-28_qwen36-gpu0_b300. Listener PID 90353, detached /private/tmp/pokebench-viewer. Current controls gated on caught_up after forward log replay; /head currently feeds thinking only. Existing recordings and live games preserved.

Status: investigating transport and control state for a bounded bootstrap. No source edits yet.

RED: built agent dependency first; targeted server-stream test fails (missing head message), existing 17 pass. Protocol chosen: bounded head on primary SSE, then tail from exact complete-line byte boundary; separate history SSE folds into a detached view. Historical replay remains exact after hydration. Head is recent, not a complete aggregate, and is labeled while history loads.
