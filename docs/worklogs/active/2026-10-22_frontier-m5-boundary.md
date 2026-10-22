# Frontier M5A current boundary facts

User approved frontier implementation; isolated default-OFF boundary-crossing-facts-v1 addresses E3 already-here loop. Add current delivered map connection edge/direction/destination to zero-input already-here result only when current exact edge is foot-reachable, connection is live foot-reachable, and no current matching trigger. No crossing occurs; no route/goal inferred. OFF retains previous result exactly. Missing/blocked/unknown state withholds instruction.

Existing BlockedExits.line already expires historical barrier feedback whenever the live trigger identity no longer matches, so no duplicate expiry switch is added.

RED tests cover production wiring, OFF parity and blocked/unknown/not-edge/trigger withholding. Source owner env/pokebench_env/topology.py uses native connection edges/GetMapBorderIdAt and delivered destination label; no new source lookup or ROM mapping.

RED commit 6cfc2b6ab: target new assertion failed (plus one fixture-null defect fixed to absent optional reachability). GREEN production boundary tests 7 passed. Deleting boundaryCrossingFacts from withNavigation produced 1 failure / 6 passes, restored. Shared historical registry reconciliation belongs to parent integration. Themed tracked explainer/pages-check clean, independent pending experiment and five bundle-only normalized-arm tests prepared. No runtime changes or gameplay.

GREEN checks: production boundary plus existing stale blocked-exit regressions 27 passed; viewer normalized bundle (five definitions), card and HTTP byte serve 7 passed. Agent build passed; targeted ESLint of changed files exited 0. Shared full registry/coverage/review/browser checks remain integration work. No measured benefit claimed.
