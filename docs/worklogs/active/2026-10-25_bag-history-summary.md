# BAG history and incremental summary

Authorization: The operator 2026-10-25: "Fix both bugs, make the graph show the actual history clearly, and land it on main after review. Don’t interrupt the active runs. there should also be a history summation that we keep up to date so we don't have to reload and recompute everything from the beginning of a run".

## Contract and frozen boundary

One bounded viewer correction: a server-owned persisted incremental BAG ledger, complete history independent of recent trace paging, delayed mart debit correlation, and readable quantity graphs with explicit scale and current cash. Original recordings and gameplay processes untouched. Production owners: bag.ts ledger/serialization/rendering; new bag-history.ts server summary reader/cache; server.ts endpoint wiring; app.ts summary loading/polling; static/style.css BAG-only presentation. No dependencies, model observations, tools, configuration or timeline changes; trainer-card protected design unchanged. Summary storage is specifically requested. Read complete historical prefix once, persist a byte cursor and compact reducer state including transaction context, tail only appended complete lines thereafter, recover after restart. Atomic cache writes; source replacement/truncation/rewrites and code changes invalidate cache. Concurrent requests share one reducer operation per run. Partial lines wait. Loading/failure must not appear as legitimate zero totals.

Source: clean pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 src/shop.c BuyMenuTryMakePurchase adds bag item, BuyMenuDisplayMessage schedules BuyMenuSubtractMoney after message; native recording Astra429f item change#11537 precedes debit#11547, GreatBall#32832 precedes debit#32843. Four buys total6300 (300+900+3000+2100), fee50 separately excluded. Initial bag history35 gained/13 removed; current cash7722 atT1014. Tutorial loan excluded by existing owner facts.

## Delivery

- [ ] RED tests committed: delayed purchase, persisted resume/tailing/invalidation, full history endpoint and client loading/error/polling.
- [ ] GREEN: implement bounded correction and graph.
- [ ] Gates: test, lint, build, coverage>=90, vendor, trainer-card-check.
- [ ] Read-only real-data comparison, background desktop1280/1440 and phone375 browser proof; two polling intervals and failure/recovery.
- [ ] Principles self-review; frozen packet multi-model review and synthesis.
- [ ] Serialized fast-forward main, complete main tests; single coordinated viewer-only refresh; active process identities preserved; live proof.

## Scope termination

Stop at exact correction above and requested persisted summary. Review advice adding unrelated capabilities stays follow-up. No run launches, model calls, emulator inputs, recorder changes or run interruptions. No writes outside owned cache and evidence artifacts on real runs. Follow normal review roster; unavailable lanes remain blockers unless applicable operator authorization is verified. Two review rounds maximum before operator scope choice.

## Evidence

- Read applicable repo/global instructions and existing active worklog. Initial read-only headless reproduction: BAG shows0/0/0 and all SVG paths M0,0.0H1000 while complete ledger35/13. Served bag.js matches current build. Background browser only; no operator focus changes.
- RED: delayed-debit restore path fails (checkpoint missing) and incremental reader module absent, as expected. Existing bag regressions remain in place. Test fixtures use finite original bagRun + one appended transaction; 97-byte injected chunks exercise boundaries without filling production limits.
