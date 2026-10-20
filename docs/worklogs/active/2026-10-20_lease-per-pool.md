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
- [ ] GREEN
- [ ] Gates
- [ ] Review: Claude and Grok LGTM
- [ ] Land ff-only
