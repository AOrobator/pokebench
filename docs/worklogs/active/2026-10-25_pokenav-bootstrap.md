# Restore PokéNav party and milestone context on live page load

User reports RED has missing party in the PokéNav and wrong trainer milestone count. The completed clock/Frontier repair c2b72ef47 is live; this is a distinct live-bootstrap context-loss bug. Active runs/controllers must not be interrupted/restarted.

Exact production readHeadEvents diagnosis: 1073 recent events at turn4186, no state or milestone events; folded partyMembers=[] and milestones=[], while full recording card has6party members and67qualified splits. Recent trace cannot be the sole owner of accumulated game context.

Single milestone: RED, GREEN, gates, real-data headless browser proof, frozen independent review, serialized local landing, coordinated viewer-only refresh and live proof. Production owner set before implementation: runs.ts (existing sparse head metadata scan), model.ts (share existing party-sample validity predicate without changing it). Tests runs.test.ts/model.test.ts as needed. No trace-scroll/app.ts edits, no card design/CSS/catalog changes, no harness behavior/model input/recorder/event schema or new persistence/cache. Preserve current recent-tail limits and existing operator-control hydration. Context is sparse recorded native party/latest state plus recorded milestones, sorted by original sequence; never fabricate events or use compact card profile as full Pokémon stats. Structural parsing/identity checks and cancellation remain. Measure real-data head latency and memory shape; avoid full gameplay replay into head.

- [x] RED: missing old party/milestones and pregame roster fail through production head → RunView. Receipt /tmp/pokenav-red.log.
- [x] GREEN
- [x] Gates/browser proof
- [ ] Review
- [ ] Landing/live proof

## Coordination
Trace-reading chat changes app.ts and scroll retention, separate from this metadata owner. Coordinator informed. One shared refresh per coordinated landing; no concurrent8790restart. Protect original recordings and eleven gameplay/controller PID/start identities. Reuse owned isolated worktree; canonical main stays protected.

## GREEN and proof
Head scanner extends the existing asynchronous sparse-control scan to retain first recorded milestone receipts by name, the latest recorded state, and the last party sample accepted by the unchanged reducer predicate. Predicate shared from model.ts to avoid a second interpretation of unread transitions versus real empty pregame state. Recent trace turn/byte limits and controls stay unchanged; no full gameplay fold, prompt/context/control edit, new cache or synthesized event.

RED22b35ac3a:2failed/35passed; GREEN100focused pass across runs/model/server-stream. Eight independent mutations (anchors, milestones, headparty-sample, no-sidecar, identity, schema, controls, pregame-empty) fail and restore100pass. /tmp/pokenav-mutation-*.log and restored.log. Four new tests use7-8events, one initial serialization/write (malformedfixture rewrites once), bounded2turn loop, injected1turn/800byte tail, no globals/retries/sleeps. Full justtest4389agent+1919viewer+4159Python+protectedguard+3unchangedscreenshots passed. Viewer lint/build/coverage pass, lines98.05/branches91.80/functions95.20; agent/Python lint/coverage/vendor reused for byte-identical unchanged trees from preceding repair.

Real RED1.395GB recording: production headread5.271s, RSS227MB, returned1110events/1.724MB; partyseq158713 retained6fullPokémon (Combusken20, Poochyena5, Zigzagoon6, Poochyena3, Poochyena3, Zigzagoon2),70rawmilestonereceipts; existingUI filters show67reachedprogresssplits. No sourcebytes altered. Owned immutable source prefix created for preview; frames/art read-only links. Browser headless actual PokéNav party→slot6→phone view→splits shows all6slots and67reached, Roxanne3:12:27, keyboardslot activation, stable2pollcycles, zero pageerrors. Fullhistory stream deliberately held back in this proof to prove context no longer depends on its completion. This does not claim the separate unbounded-history/mobile-memory issue is fixed; trace-reading chat owns app.ts. Header actual Frontiercheckpoint count49matches49/203 (49thposition coincides for this run);67includes other progress. Screenshots1440party/splits and375party inspected; canonical runs/mockups/pokenav-bootstrap/shots/candidate*. Normal shared-browser proof after landing remains required.
