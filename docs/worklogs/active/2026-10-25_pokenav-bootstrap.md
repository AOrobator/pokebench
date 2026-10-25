# Restore PokéNav party and milestone context on live page load

User reports RED has missing party in the PokéNav and wrong trainer milestone count. The completed clock/Frontier repair c2b72ef47 is live; this is a distinct live-bootstrap context-loss bug. Active runs/controllers must not be interrupted/restarted.

Exact production readHeadEvents diagnosis: 1073 recent events at turn4186, no state or milestone events; folded partyMembers=[] and milestones=[], while full recording card has6party members and67qualified splits. Recent trace cannot be the sole owner of accumulated game context.

Single milestone: RED, GREEN, gates, real-data headless browser proof, frozen independent review, serialized local landing, coordinated viewer-only refresh and live proof. Production owner set before implementation: runs.ts (existing sparse head metadata scan), model.ts (share existing party-sample validity predicate without changing it). Tests runs.test.ts/model.test.ts as needed. No trace-scroll/app.ts edits, no card design/CSS/catalog changes, no harness behavior/model input/recorder/event schema or new persistence/cache. Preserve current recent-tail limits and existing operator-control hydration. Context is sparse recorded native party/latest state plus recorded milestones, sorted by original sequence; never fabricate events or use compact card profile as full Pokémon stats. Structural parsing/identity checks and cancellation remain. Measure real-data head latency and memory shape; avoid full gameplay replay into head.

- [x] RED: missing old party/milestones and pregame roster fail through production head → RunView. Receipt /tmp/pokenav-red.log.
- [ ] GREEN
- [ ] Gates/browser proof
- [ ] Review
- [ ] Landing/live proof

## Coordination
Trace-reading chat changes app.ts and scroll retention, separate from this metadata owner. Coordinator informed. One shared refresh per coordinated landing; no concurrent8790restart. Protect original recordings and eleven gameplay/controller PID/start identities. Reuse owned isolated worktree; canonical main stays protected.
