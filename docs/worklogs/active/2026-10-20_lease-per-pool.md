# Gameplay lease per compute pool

## Operator decision

2026-10-20 1:38 PM ET, the operator: "the lease split should start now". A Mac llama.cpp run (qwen38, pid 82303) holds the single gameplay lease `runs/.naming-gameplay.lock`, so the GPU pair (`whole-map-pair-1h`, pid 85979) waits on it. Mac and GPU runs should take separate leases, derived from the model endpoint, keeping stale/adopt/reclaim semantics, with waiting messages naming the held resource.

Hard constraint while those two processes live: do not restart 8790 and do not touch `runs/.naming-gameplay.lock`.

## Design

- A pool is the model endpoint's `host:port` (`leasePool`, agent `lease-pool.ts`); its lease is `runs/.naming-gameplay.<host>-<port>.lock` (`leaseName`). The owner records its pool.
- NEXT RUN: pool of the viewer's endpoint file. Experiment queue: pool of the gateway (`inference.example:80`). Fixed runs: every lane's `modelUrl` pool, taken all or nothing in sorted order (`takeLeases`). Serial comparison: each lane's gateway pool.
- The old single lease is left to processes still running old code (the hand launcher, the waiting pair runner, the current 8790 viewer). New code does not read it. Rollout: the pair runner is relaunched from the new build; 8790 is restarted after the Mac run ends.
- Not changed: the "live run is still running" checks in NEXT RUN and the experiment queue, which wait on any live game server.

## M1 Per-pool leases

- [x] RED: lease-pool naming; per-pool take/hold/reclaim/adopt; all-or-nothing multi-pool take; waiting text names pool and holder in next-run, fixed-runner and autorun; experiment queue pool = gateway pool
- [x] GREEN: `lease-pool.ts` (agent) names pools and lease dirs; viewer `lease.ts` takes, reclaims and adopts per pool, `takeLeases` for several; NEXT RUN, experiment queue (`EXPERIMENT_POOL`, gateway moved to experiment-runner), fixed runner (one lease per lane pool) and serial comparison use it; waiting text names pool and holder; NEXT RUN waits if the endpoint file cannot name a pool. Agent 2846, viewer 1396 tests pass; lint clean.
- [x] Gates: lint clean; coverage passes (agent and viewer above the 90 floor; lease.ts 95/97/100/95); pytest 2896
- [x] Review: Grok (cursor-grok-4.5-high) and Claude (subagent) `VERDICT: LGTM` on packet f1cbc77d…a38c (runs/reviews/lease-per-pool/). Follow-ups noted: serial comparison should key on the endpoint file's base_url when a lane has one (dormant: no manifest uses it); fixed runner should name each pool's lease with its own lane's child; no unit test for nameLeaseRun keeping pool.
- [x] Land ff-only on main. No dist rebuild or 8790 restart while the Mac run (82303) lives; `just viewer-main` after it ends.
