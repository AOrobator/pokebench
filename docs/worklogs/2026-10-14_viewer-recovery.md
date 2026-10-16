# Restore the viewer at 8793

Authorization: operator reports the viewer unresponsive and requests a fix.

Diagnosis: PID 8188 listens on 8793, queue endpoint responds 200 with idle state, but root and timeline module return 404. Its launch script/static/browser module paths reference the removed viewer-comparison-cache-live worktree. Chrome has both root and selected-run tabs at 8793. No active game/agent process appears in the process inventory.

Repair: launch viewer from the durable main checkout on the same port and run catalog, preserving the navigation checkout's existing agent launch path and Hermes endpoint. Keep launch script/log/PID receipts under main runs/launch-receipts/viewer-recovery. Do not restart or launch gameplay. Main includes comparison caching and landed timeline button labels.

Recovered: replaced only stale viewer PID 8188 with PID 49937. Stable launcher is `runs/launch-receipts/viewer-recovery/serve.mjs`, with output in `server.log` and PID in `pid`. Main viewer build passes; no source implementation changes were needed.

Actual HTTP receipts in `http-checks.json`: root 200/12ms, timeline module 200/1ms with press-label code, stylesheet 200 with matching CSS, queue 200 preserving all previous draft values/feature switches and idle state, run catalog 200/52ms. First cold comparisons 200/40946ms; repeat 200/791ms. Cold scanning remains a startup limitation of the existing cache, not a solved asynchronous-processing claim. Browser snapshot initially timed out during this cold scan; after completion, actual Chrome reload displays selected replay, catalog, model controls, native splits, recorded game frame and timeline button labels. Replay advances 10s→19s and pause button responds.

Screenshot: `/Users/user/.codex/visualizations/2026/10/14/00000000-0000-4000-8000-d00905e248c6/viewer-restored.jpg`. No gameplay launch, restart, configuration write or model inference. Original unrelated dirty worklogs preserved. Recovery uses main-owned files rather than removable managed-worktree viewer assets; agent launch remains the previous navigation-owned path deliberately.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-14). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
