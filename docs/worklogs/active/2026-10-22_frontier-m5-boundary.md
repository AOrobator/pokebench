# Frontier M5A current boundary facts

User approved frontier implementation; isolated default-OFF boundary-crossing-facts-v1 addresses E3 already-here loop. Add current delivered map connection edge/direction/destination to zero-input already-here result only when current exact edge is foot-reachable, connection is live foot-reachable, and no current matching trigger. No crossing occurs; no route/goal inferred. OFF retains previous result exactly. Missing/blocked/unknown state withholds instruction.

Existing BlockedExits.line already expires historical barrier feedback whenever the live trigger identity no longer matches, so no duplicate expiry switch is added.

RED tests cover production wiring, OFF parity and blocked/unknown/not-edge/trigger withholding. Source owner env/pokebench_env/topology.py uses native connection edges/GetMapBorderIdAt and delivered destination label; no new source lookup or ROM mapping.
