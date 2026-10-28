# Persisted current-run snapshots — scoped implementation plan

**Started:** 2026-10-25 (America/New_York)
**Archive Name:** `docs/worklogs/2026-10-25_current-run-snapshots.md`
**Status:** Authorized implementation; activation and shared viewer refresh explicitly prohibited
**Current Phase:** implementation — M1 closeout verified; M2 in progress
**Phase Started:** 2026-10-25
**Branch:** `codex/current-run-snapshots-service`
**Worktree (active milestone):** `/Users/user/.codex/worktrees/current-run-snapshots/pokebench`
**Milestone tracking:** M1–M5 in this worklog. No repo-local Beads exists; installed bd resolves an unrelated global local stack database. Repository principles explicitly do not inherit Beads; do not create unrelated issues.
**Required Phase Skills Checked:** repository feature-worklog and its canonical planning references
**Situational Skills Considered:** viewer-e2e, close-the-loop, talk-to-claude, multi-model-review; load/recheck at execution boundaries
**Execution Mode:** serial milestones; user authorizes implementation and cross-chat coordination. No service activation on live root, cache seeding, or shared viewer refresh. Keep runtime activation pending.

## Problem statement

**Context:** The viewer separately discovers recordings, reduces card/progress state, opens live frames, and reconstructs browser panel state from events. Large active recordings make reconstruction expensive.

**Problem:** Live reducer checkpoints do not currently survive process restart on the investigated served build. The selected `events?head=1` request reads recent events and scans the log for panel anchors before opening its stream. A new browser page measured approximately 1.25 seconds to card elements and 16.04 seconds to the initial event snapshot on a roughly 2.9 GiB active recording. Separate warm requests measured 52 ms for 545 run summaries and 135 ms for cards. These are investigation samples, not p95 benchmarks or cold-server measurements.

**Goal:** Persist bounded current display state and restart cursors; serve current cards/stats independently of historical reduction; stream current updates without history scans; backfill activity/replay separately. Preserve provenance, last-known-party semantics, active-run isolation, and honest completeness.

**Non-goals:** No model prompts/tools/gameplay changes, emulator inputs, game-server changes, recording rewrites, run restarts, new trials, benchmark grading policy changes, trainer-card redesign, timeline additions, arbitrary transcript search, full historical database ingestion, multi-host service, or database on a network filesystem. Runtime activation and shared viewer refresh remain prohibited by the implementation authorization.

## Phase model

- 2026-10-25 bootstrap -> intake: user requested a scoped plan and worklog; read repository workflow and existing production owners.
- 2026-10-25 intake -> planning: user requested overlap review; inspected “Fix disappearing trainer card” and its owned candidate worklog. This document remains a proposal.
- Future transitions: coordination -> implementation -> verification -> merge-release -> closeout-learning, each only within then-current user authorization.
- Keep canonical root `WORKLOG.md` unchanged: it belongs to the budget-extension flight. At implementation, create the worktree-local pointer to this body in an owned isolated branch.

## Skills Loaded

| Skill / source | Purpose |
| --- | --- |
| `.claude/skills/feature-worklog/SKILL.md` | Required local worklog shape, approval boundary, RED/GREEN and 90% coverage |
| Local stack feature-worklog planning/template/process references | Freeze contracts, owners, terminators, split triggers and checkpoints; repo-specific rules prevail |
| `.claude/skills/execute-worklog/SKILL.md` | Read to plan milestone gates and distinguish implementation, review, landing and activation |
| `.agents/skills/viewer-e2e/SKILL.md` (investigation turn) | Background browser measurements and focus boundary |

Before execution load relevant current skills, including close-the-loop and landing coordination. No permission or waiver from another chat is inherited as this plan's activation authority.

## Architecture

### Dependency and overlap decision

Read on 2026-10-25: Codex chat **Fix disappearing trainer card**, ID `00000000-0000-4000-8000-69334d9dba94`. Latest inspected user request explicitly authorizes persistence across refresh/restart. Its owned branch is `codex/viewer-card-persistence`, worktree `/Users/user/.codex/worktrees/viewer-state-retention/pokebench`, worklog `docs/worklogs/active/2026-10-25_viewer-card-persistence.md`. Observed HEAD `807dde160`; its worklog reports final source gates/browser proof but review, landing and activation remain unchecked. Canonical main observed `a39ad79b9`. Recheck all of these before execution; no claim that the candidate is landed or live.

That candidate owns atomic `.viewer-cache/cards-v1` persistence, card-only fallback during cold reduction, consumed-prefix binding, source invalidation, fresh/reset replacement and exclusion from validated grading. The earlier retained-state repair is documented in `2026-10-25_viewer-state-retention.md`.

**This plan does not reimplement that fix.** M1 rebases on its final reviewed outcome and records the exact dependency SHA. Preserve its tests and production semantics. Until M5's separately reviewed storage handoff, its existing card store remains the sole saved-card writer. The new service owns resumable current telemetry/checkpoints, not a parallel card fallback. Reuse the established retention rules through a shared pure display reducer/adapter where needed; do not invent a second party-reset policy.

### Ownership and storage

Proposed one independent snapshot process per runs root. It reads recordings and approved metadata, writes only its derived local store, and does not run inside an agent, emulator, or viewer request handler. Viewer restarts leave it running; its own restart uses disk checkpoints. An OS-held singleton lock prevents concurrent writers; a PID file alone is insufficient.

Use a versioned local SQLite store under `runs/.viewer-cache/current-v1/`, WAL mode, one writer, bounded read transactions. Verify the installed Node runtime's SQLite API and TypeScript bindings before binding selection; no new third-party dependency by default. Connection work lives outside the viewer request event loop if the chosen binding is synchronous. Missing database is a fast explicit not-ready result, never synchronous initialization/replay in an HTTP handler.

Logical tables: service metadata/revision; run discovery and card identity inputs; per-run public snapshot plus private reducer checkpoint/cursor; sparse turn/sequence-to-byte-offset history index; bounded committed revision journal. Do not store complete traces or image bytes in SQLite. Public snapshot schema and internal reducer schema have separate versions. Full viewer code hashes do not invalidate compatible state.

Public state includes identity; current turn/phase; effective budgets and applied-control provenance; elapsed-time anchor/pause accounting; current retry attempt/limit; independent lifetime totals; latest estimated/measured context with request/turn/time; game display sources; recorded progress and validation status; field-level completeness; source sequence/generation; observation/projection/health timestamps; lag and problems. Unknown totals are null, never zero. Private state must retain every accumulator/open operation required to continue reduction, including pending request/tool timing and pause state. Public JSON alone is not a resumable checkpoint.

Progress snapshots are display evidence. Saved card payloads cannot seed measurement eligibility, frontier results, timing grades or validated splits. Keep the existing strict paths separate.

### Restart and consistency protocol

1. Read complete events using a single opened source descriptor and a frozen upper byte boundary per batch. Preserve source run identity and valid restored/continuation sequence namespaces; do not assume all logs are simply seq+1 from zero.
2. Apply the ordered batch; atomically commit public state, private checkpoint, sparse index additions, source generation, last consumed seq, next complete-line offset and revision. Emit updates only after commit.
3. A crash before commit replays the batch; a crash after commit resumes after it. Sequence/generation checks prevent double counting. Incomplete lines remain unconsumed.
4. Restart validates source identity, size and bounded cursor/anchor evidence, then reads only appended bytes. Replacement, truncation, observable rewrite, changed restoration/evidence receipts or incompatible reducer schema quarantines that run's checkpoint and rebuilds it independently.
5. Arbitrary same-inode edits to an old prefix cannot be disproved by a bounded fingerprint. Append-only recordings and explicit invalidation by restoration/edit operations are the supported contract; full integrity verification remains a separate background operation. Never claim constant-time checks prove an unchanged multi-GiB prefix.
6. Source logs currently use appendFileSync without an explicit durability barrier. SQLite durability cannot promise source survival after machine power loss. If source no longer supports a committed cursor, invalidate/rebuild rather than presenting the snapshot as current.
7. Corrupt/unwritable/busy database: bounded error response and retained browser last-known display; gameplay proceeds. Keep the last database for diagnosis; no automatic destructive repair or tight retry loop. Rebuild into a new derived store after operator-approved recovery.

### Existing-run bootstrap and history backfill

For a missing checkpoint, discover the run from bounded metadata/header reads. Reuse the dependency's saved card for immediate last-known card display. A bounded recent tail may supply provisional turn/context/state; unresolved pause accounting, retained roster anchors, controls and lifetime totals remain unknown or last-known with timestamps.

Concurrently reconstruct a complete checkpoint up to a frozen high-water boundary H, persisting reconstruction progress so a service restart does not restart a multi-GiB scan. Follow appends after H in bounded batches. Provisional current observations and reconstructed lifetime state are distinct lanes: never add their counters together. Publish a complete replacement only once it reaches at least the current published sequence. If reconstruction remains behind, keep newer provisional fields and mark aggregate coverage explicitly. No event backlog grows unbounded in memory.

Two backfills are distinct:

- **Checkpoint reconstruction:** once per unindexed/incompatible generation, necessary for exact lifetime state; lowest-impact, resumable background job.
- **Browser history:** recent activity first, then older pages on request. Use the sparse offset index to seek near a sequence/turn; bound events and bytes per page, return opaque generation-bound cursors. When an index segment is missing, report indexing or return a bounded partial page; never scan from byte zero in the request. A single oversized event must have explicit refusal/reference semantics, never be silently chopped into invalid JSON.

Use a single bounded scheduler with live-tail priority and yielding historical chunks. Initial proposed reconstruction budget: aggregate 20 MiB/s, at most 10 ms processing before yielding, one reconstruction at a time; measure and reduce during shadow rollout. Bound parsers, line sizes, revision journal, DB write cadence, queued jobs and subscriber buffers in M1. Snapshot commits coalesce within 250 ms; flush terminal/control transitions promptly. Lag is visible if incoming volume exceeds the budget; no resource escalation without review.

### Endpoint and browser contracts

Proposed API:

- `GET /api/current-runs`: indexed active/paused/unresponsive/recently ended rows; recently ended default 10 minutes, older listing paginated separately. Includes last-known fields plus explicit freshness/completeness. No full recording, receipt crawl or synchronous health probe.
- `GET /api/runs/:id/current`: selected current state, including historical runs if already indexed; otherwise explicit indexing status.
- `GET /api/current-updates?after=<opaque-cursor>`: bounded committed snapshot replacements, removals/tombstones and reset messages; cursor binds store epoch and revision. Expired/incompatible cursor requests a fresh snapshot. Initial read and subscription boundary cannot lose intervening updates.
- `GET /api/runs/:id/history?before=<opaque-cursor>`: bounded pages for activity/replay, separate from current-state updates.

Existing host/origin/loopback checks apply. Current reads never trigger full reduction. Health probes occur asynchronously, bind latest run ownership to server port/process where evidence permits, and return age. Recorded running/paused/ended, connectivity and projection completeness are separate axes; lack of new events during inference is not death.

Browser starts current snapshot requests and optional art loading immediately, before historical run-list completion. Render available cards/stats; connect live frames independently; subscribe from returned revision; fetch recent activity next; request older history on demand. A complete changed snapshot replaces the current one by generation/sequence/revision, including updates at the same seq for health. Epoch changes force a fresh fetch. Persisted clock anchors project local time without server queries every second; pauses and stale/unresponsive state follow established policy, with freshness disclosure.

Keep current display state separate from historical/replay reducers. Older history cannot rewind party/turn/clock or double-count totals. Replay intentionally uses historical state and never imports a future retained party. Stream reconnect retains explicitly stale values, recovers to a fresh snapshot and deduplicates revisions. Existing cold `events?head=1` history scan leaves the new current startup path; legacy playback remains available during rollout.

## Invariants

| ID | Invariant and rationale | Test strategy |
| --- | --- | --- |
| INV-1 | Recording remains authoritative; derived writes never touch source/run controls. | Assert all writable paths are owned store/output; immutable copied sources; reject traversal/symlinks. |
| INV-2 | Checkpoint, cursor, index and revision commit atomically; only consumed bytes can be acknowledged. | Crash before/after commit, growth while queued, truncation while reading, torn tail and replay parity. |
| INV-3 | Current queries do no history scans or health waits. | Production-path observers show zero source-log reads; held reconstruction and health probes do not delay snapshot response. |
| INV-4 | Historical events never change current state or duplicate aggregates. | Overlap pages, reconnect, out-of-order updates and generation reset integration tests. |
| INV-5 | Last-known party/identity follows the dependency's retained-state/reset and battle-health identity rules. | Preserve existing regressions and compare native sparse/battle/reset fixtures, including six slots and replay boundaries. |
| INV-6 | Partial/unknown/stale data stays explicit; retry attempt and lifetime failures remain distinct. | No-zero bootstrap, measured-vs-estimated context provenance, quiet inference, health failure/recovery. |
| INV-7 | Display caches cannot establish benchmark eligibility or grading. | Held strict validation; cached cards available while frontier/splits remain independently unverified. |
| INV-8 | Active agents/emulators/runners receive no inputs/restarts or config changes; singleton/resource isolation holds. | PID/start-time continuity, no control HTTP methods, bounded source I/O, singleton collision/recovery. |
| INV-9 | At storage handoff there is exactly one authoritative saved-card writer. | Gate old writer off in new mode; read-only legacy adapter; migration rollback and reset/source invalidation tests. |

## Security Review

- Untrusted run IDs, paths, receipts, JSON and cursor parameters: strict schemas and sizes; validate root containment; refuse symlink escape; parameterized SQL; opaque bounded cursors bound to source generation. Never serialize secrets, ROM data, full prompts or image bytes into snapshots.
- Local source mutation/stale cache: source generation and cursor validation, honest bounded-check limitation above, per-run quarantine and no grade promotion.
- Resource exhaustion: bounded source/page/event/subscriber buffers, coalesced writes, journal retention, WAL checkpointing in background, bounded DB reader timeouts; slow subscribers resync rather than retaining unlimited updates.
- Double service ownership: OS-held lock and explicit startup failure; never kill a process merely because a stale PID file names it.
- Preserve existing read/control access separation; no new write/control API. Snapshot process cannot claim inference leases, launch runs or mutate GPU endpoints.

## Current Milestone: M2 (implementation; fixture-only service, no live activation)

### Completed Milestones

M1 foundation: source landed7c3b52c12; original postmerge failure retained; current-main closeout PASS2ad999682. Review disposition includes explicit operator Sol/Grok waivers. Runtime service/API/browser integration not claimed.

### Remaining Milestones

For each behavior milestone: RED -> GREEN commits; record counts/build/coverage; `just test` (includes at least90% lines/branches/functions across both stacks), `just lint`, `just build`, `just verify-vendor`; do not repeat the identical `just coverage` alias; appropriate focused checks and production wiring; adversarial deletion of each claimed guard; required current multi-model review on frozen scope. No local-inference reviewers. Recheck review/landing rules and independently verify any applicable waiver. No milestone advances with failing gates.

**M1 - Freeze compatible contract and persist resumable checkpoints (tracked by this worklog):**
- [x] Contract freeze: recheck card-persistence chat/main/served source; bind dependency SHA; schema/field semantics, SQLite binding, source generations, public/private checkpoints and bounded resource parameters. Owner: snapshot store/reducer. No daemon activation, UI changes or card-cache rewrite.
- [x] M1 primitive proof: native SQLite commit/close/reopen and bounded JSON reduction parity; supplied continuation namespace validation. Actual source consumption, process-kill recovery, replacement/truncation and torn-line proof remain M2; no source-verification or schema-migration completion claimed.
- [x] Split triggers: changing recording durability, introducing remote storage/third-party database service, new party retention policy, or migration beyond additive derived schema.
- [x] M1 tests: native single-writer lock, close/reopen persistence, late-SQL-error rollback, read-only connection, checkpoint/schema rejection, retry/context/cumulative provenance, read-journal pruning interleave.
- [ ] M2 remaining proof: actual process-kill before/after commit, torn line, queued growth/validated consumed offset, source replacement/truncation and partial-reconstruction restart.
- [x] COMMIT: `test(viewer): specify durable current-state checkpoint recovery` (RED;447e738b0).
- [x] Implement minimal typed reducer/store and checkpoint restore; no integration in production startup yet.
- [x] Adversarial deletion; focused persistence/recovery tests; full gates and coverage.
- [x] COMMIT: `feat(viewer): persist resumable current-run checkpoints` (GREEN;a5d14eee199498c56afb17aef1ee883aa99c9b10).
- [x] M1 review disposition: Claude/GPT/Astra round2 LGTM; Sol initial-event fixture gap explicitly waived by operator Oct27; no test fix or third review. Grok usage unavailable, independently verified standing human Grok waiver recorded. Not all lanes LGTM; no false approval claim.

**M2 - Independent bounded service and existing-run reconstruction (tracked by this worklog):**
- [ ] Contract freeze: local daemon lifecycle, singleton, source discovery, live-tail scheduling, resumable initial reconstruction and asynchronous health. Owner: snapshot service. No agent/game writer edits; no production enablement.
- [ ] Terminator: process-level fixture service restarts from cursor, resumes interrupted initial reconstruction and stays responsive under held/large history; complete/provisional handoff has no rewind/double count.
- [ ] Split triggers: modifying runner lifecycle/leases, distributing the service, or requiring a new direct game-state sampler.
- [ ] Tests: service killed/restarted against append fixtures; quiet inference vs health; reused port; late terminal event; partial reconstruction restart; DB unavailable; resource budget/backpressure and fair scheduling.
- [ ] COMMIT: `test(viewer): exercise snapshot service restart and catch-up` (RED; SHA pending).
- [ ] Implement dormant service entrypoint/lifecycle with bounded diagnostics and configurable limits.
- [ ] Adversarial deletion; fixture process rehearsal; full gates and coverage.
- [ ] COMMIT: `feat(viewer): add bounded current-run snapshot service` (GREEN; SHA pending).
- [ ] Multi-model review against service ownership/recovery contract and INV-1/2/6/8.

**M3 - Fast endpoints, reconnect and indexed history pages (tracked by this worklog):**
- [ ] Contract freeze: four routes above, indexed card identity metadata, consistent epoch/revision/resync, sparse bounded history and independent read execution. Owner: viewer read API. No default browser migration or historical catalog ingestion.
- [ ] Terminator: production HTTP path returns current snapshots while reconstruction and health are held; source-read observer shows zero event-log reads for current endpoints; paged history has no gaps/duplicates within generation.
- [ ] Split triggers: unbounded arbitrary trace search, remote/public write APIs, or new grading/index authority.
- [ ] Tests: conditional response, initial-fetch/subscribe race, expired cursor, tombstones/ended rows, store rebuild epoch, oversized event policy, missing history segment, index invalidation, hostile cursors, slow client.
- [ ] COMMIT: `test(viewer): specify fast snapshot and indexed history APIs` (RED; SHA pending).
- [ ] Implement API adapters, bounded revision delivery and history seeks; legacy route remains available.
- [ ] Adversarial deletion; API fixture proof; full gates and coverage.
- [ ] COMMIT: `feat(viewer): serve current snapshots and bounded history` (GREEN; SHA pending).
- [ ] Multi-model review against endpoint contracts and INV-3/4/6/7.

**M4 - Snapshot-first browser with separate history/replay state (tracked by this worklog):**
- [ ] Contract freeze: off-by-default viewer configuration selects new current-state path; history fills separately; existing card store still supplies saved-card fallback until M5. Owner: browser current view. No artwork, layout/identity redesign, protected baseline edits or timeline additions.
- [ ] Terminator: fresh page and viewer/service restarts show known cards/current stats before deliberately held history; controls remain correctly bound; recent/older pages cannot rewind current display. Full legacy mode still works.
- [ ] Split triggers: changing displayed card identity or appearance, model-visible feature flags, or changing operator budget application semantics.
- [ ] Tests: snapshot before legacy run list; missing data labels; clock/pause; switch runs; party tabs; history out of order; reconnect; genuine reset; replay has no future leakage; grade path remains independent.
- [ ] COMMIT: `test(viewer): specify snapshot-first display and history isolation` (RED; SHA pending).
- [ ] Implement opt-in browser adapter and independent history/replay state; reuse approved retention rules.
- [ ] Adversarial deletion; headless desktop 1280/1440 and phone 375 real-pointer/keyboard proof on copied recordings; happy/failure/recovery; inspect screenshots; `just trainer-card-check`; full gates and coverage.
- [ ] COMMIT: `feat(viewer): render current state before loading history` (GREEN; SHA pending).
- [ ] Multi-model review against startup/backfill contract and all affected invariants.

**M5 - Card-store handoff and authorized rollout (tracked by this worklog):**
- [ ] Contract freeze: controlled migration from dependency cards-v1, exact one-writer mode, preserved legacy rollback path, operator-authorized staged activation only. Owner: derived snapshot service after handoff. No active-run change or grading migration.
- [ ] Terminator: native parity, restart/browser proof, performance/resource receipt, explicit rollout decision, queued landing/main gates and authorized activation with process continuity. Accept initial unindexed historical rows as explicitly indexing; never claim instant reconstruction of unseen history.
- [ ] Split triggers: replacing source recordings, changing game/agent process supervision, deleting the legacy rollback capability, or widening performance claims beyond tested scope.
- [ ] Tests: read-only import accepts display fields only, rejects foreign/truncated/replaced sources; no imported totals/checkpoints/grade status; old/new mode never write card persistence concurrently; rollback restores prior mode without source mutation.
- [ ] COMMIT: `test(viewer): specify snapshot card handoff and rollback` (RED; SHA pending).
- [ ] Implement reviewed handoff/configuration and rollout runbook. Legacy cache is not rewritten or deleted by migration; its reader is transitional and has a documented retirement follow-up.
- [ ] Adversarial deletion; offline rollout/rollback rehearsal; full gates, coverage, protected cards and required multi-model review.
- [ ] COMMIT: `feat(viewer): add controlled snapshot rollout and card handoff` (GREEN; SHA pending).
- [ ] STOP: obtain explicit activation authorization; follow rollout below. Approval to implement alone does not clear this stop.

## Closing the Loop

### Rollout without disturbing active runs

1. **Dependency reconciliation:** re-read “Fix disappearing trainer card” and its final source/receipts; do not request that owner expand or pause its work. Before implementation or landing coordination, read the applicable messaging skill. No messages sent by this planning task.
2. **Offline first:** use immutable copied native prefixes and a fixture append writer in an owned directory; separate database, service PID and preview port. No GPU/model calls. Rehearse viewer restart, service restart, process kill, partial source line, migration and rollback there.
3. **Shadow authorization:** STOP before reading live multi-GiB sources at scale or starting a background service against live runs. With authorization, capture process identities/start times (agents, emulators, bridge, runners), endpoints/run ownership and existing viewer pin. Start only the snapshot service with owned derived output and bounded I/O; existing production viewer remains unchanged. No source/run-directory sidecars.
4. **Shadow observations:** tail current events and rate-limit one-time reconstruction. Measure projection lag, actual bytes read, CPU/RSS, DB/WAL sizes, API/frame timings and source growth. Stop/throttle only the new service if it interferes; never kill or pause active runs. Capture at least 10 minutes of baseline and 10 minutes shadow; gate on zero gameplay/control writes and no attributable sustained frame/API latency regression above 20%. Insufficient baseline/noise means no activation claim.
5. **Preview:** opt-in owned viewer reads the shadow store, not a second projector. Headless fresh page/reload/run switching against real active identities; control requests intercepted/refused in proof. Confirm visible current state and advancing native frames, source timestamps, no card loss, no stale-current mislabeling, no history rewinds and zero browser errors. Never take desktop focus.
6. **Landing:** current repository gates/reviews and serialized landing-board slot; exact reviewed local FF only. Main build/ordinary test and evidence before refresh. Do not revive the retired experiment queue or launch a benchmark. Keep candidate, landed and served identities separate.
7. **Activation authorization:** retain explicit stop even if source is landed. Coordinate one viewer-only refresh with current owner; never restart game/agent/runner processes. Capture process identities immediately before/after, including start times to defeat PID reuse. Activate only indexed current state; missing rows retain dependency fallback/indexing labels.
8. **Live proof and rollback:** repeat headless desktop/phone freshness, selected-run/frame/card membership, reset and history-isolation checks across at least two polling/update cycles. Roll back only viewer configuration/build and stop the owned snapshot service if necessary. Leave database/cache/source recordings intact. Recheck process continuity and final served pin.

### Acceptance and evidence

- [ ] Local current endpoint p95 <100 ms over at least 200 reads with explicit hardware/load/sample scope; warm OS caches declared. Same query stays bounded as an unrelated recording grows. No zero-log-read claim based only on wall time.
- [ ] First available persisted current cards/stats <500 ms after application readiness on local indexed fixtures; measure roster/card DOM and meaningful stats, not a loading shell. Missing optional font must not block ordinary text. Remote/Tailscale budget reported separately.
- [ ] Normal live projection lag <1 second over a declared 10-minute fixture/shadow window; separate coalescing, source event silence, reconstruction and health age. Targets require evidence, not relaxed assertions if missed.
- [ ] Restart reads only post-cursor source bytes for compatible checkpoints; initial reconstruction is separately resumable and bounded.
- [ ] Legacy/card-persistence/party-retention regressions and protected trainer-card checks pass unchanged.
- [ ] Full TS/Python gates and 90% minimum coverage dimensions pass; no widened exclusions, skipped tests or timeout inflation.
- [ ] Independent reviews, exact pin/diff, source parity and browser receipts preserved outside ephemeral worktrees under canonical `runs/reviews/current-run-snapshots/`; screenshots under `runs/mockups/current-run-snapshots/`. Artifacts needing expensive regeneration get explicit preserved paths.
- [ ] Implementation, landing, activation and live proof each have separate status/receipts; operator confirms outcome before archive.

## Dependencies

Card persistence final reviewed outcome -> M1 -> M2 -> M3 -> M4 -> M5. M4 depends on M3 plus preservation of the dependency's existing store behavior. No parallel implementation agents scheduled; independent review agents per review skill only.

## Deferred (V2+)

- Full historical analytics/search database and automatic ingestion of every ended run: unrelated to fast current-state startup.
- Strong power-loss guarantees for authoritative recordings: requires a separate durability decision.
- Detection of arbitrary unannounced same-inode prefix edits without scanning: outside append-only contract.
- Permanent retirement of cards-v1 compatibility and the old full event startup route: follow-up only after stable rollout/rollback window; do not delete another chat's just-landed repair in this flight.
- New health/grade semantics, remote storage and database backup product: separate ownership/threat-model domains.

## Key Design Decisions

1. Independent projector and durable checkpoints remove history from the fast request path without adding work to gameplay.
2. Existing card persistence is a dependency, not a competing implementation. M5 explicitly transfers ownership after parity; until then it remains authoritative for saved cards.
3. Provisional fields and complete lifetime aggregates have separate completeness/cursors; a bounded tail cannot invent exact totals or retained party anchors.
4. Private checkpoint state is durable alongside public state, avoiding the false assumption that a card payload can resume reduction.
5. Index history offsets during required passes; never copy the full recording into SQLite or block current reads on index completion.
6. This viewer-only change uses a viewer rollout configuration, not a model-visible harness experiment feature switch.

## Session Log

### 2026-10-25 — planning only

- User requested investigation, proposed design, then a scoped implementation plan/worklog with explicit “Don't build anything yet.”
- Read production log writer, current snapshot/recent-history owners, repo worklog rules, and prior retention worklog. Principles inform authoritative source, visible unknowns, process isolation and preserved evidence; principles document not modified.
- User requested checking overlapping chat. Read “Fix disappearing trainer card” and its current candidate/worklog; found direct persisted-card implementation already under review preparation. Revised scope to depend on it and reserve one-writer storage handoff for M5. No message, delegation or coordination mutation sent.
- Created only this planning document. Root WORKLOG pointer unchanged; no source/tests/config changes, commits, service/cache operations, live-log scans, builds, reviews, landings or refreshes performed in this planning task.
- Next: operator review/approval of this scoped plan; then isolated execution setup and dependency status refresh. No automatic continuation into implementation.

## Surprises

- The overlapping chat expanded from in-memory retention to durable cards after this chat's original investigation. A new universal card writer would duplicate that authorized work; dependency plus explicit handoff prevents that.
- RunLog supports restored sequence namespaces and writes without explicit fsync. Recovery design must preserve sequence rules and qualify power-loss guarantees.

## Multi-Model Review Log

M1 round1 frozen8431a2259: ClaudeLGTM; GPT/Astra/SolBLOCKING; Grok account usage unavailable. Four accepted findings are classified in runs/reviews/current-run-snapshots/m1-r1-synthesis.md. Corrections committed5fd1ceb89 after REDc5f7d840c,21 focused tests/22 corrected mutations PASS; new full gates and cumulative round2 pending. No M1 completion, landing, activation or live claim. See chronological receipts below.

## Boy Scout Log

- BSL-1: inherited full-suite scheduling sensitivity is recorded in adjacent worklogs. No tests run in this planning-only task; no new test failure diagnosed. During execution coordinate CPU windows without weakening test assertions/timeouts or using local inference.
- BSL-2: prior investigation's numeric-stats observer could match the initial zero shell. Use meaningful observed values/source sequence for M4 performance proof; the separately observed SSE head timestamp is the supported 16.04-second metric.
- BSL-3: this proposal's queue IDs/worktree-local pointer remain deliberately deferred because authorization is documentation only. Resolve before source edits, preserving unrelated root pointer.

## Commit Checkpoint Summary

No commits created in this planning task. Intended behavior checkpoints:

| Milestone | RED | GREEN | SHA/status |
| --- | --- | --- | --- |
| M1 | 447e738b0, c5f7d840c | a5d14eee1, 5fd1ceb89 | corrected source; gates/review pending |
| M2 | Service lifecycle/catch-up tests | Bounded independent service | pending |
| M3 | Fast API/history/reconnect tests | Indexed current/history routes | pending |
| M4 | Browser startup/isolation tests | Opt-in snapshot-first browser | pending |
| M5 | Single-writer migration/rollback tests | Controlled handoff/runbook | pending |

## Rollback Plan

Before activation, rehearse rollback using fixtures. Disable new viewer mode and return to prior reviewed viewer build; stop only the owned projector. Existing cards-v1 remains intact for legacy rollback and can refresh through the prior code path. New service stops writing card state before old mode resumes. Preserve SQLite/WAL consistently for diagnosis; no downgrade-in-place migration, source edits or active-run stop. Recheck served identity, card visibility and protected process identities. A failed rollback surface is a blocker, not a reason to restart gameplay.

## Archive Milestone (user-gated)

- [ ] All implementation milestones gated/reviewed and every in-scope BSL item resolved or explicitly dispositioned.
- [ ] Required landing, separately authorized activation, live proof and rollback readiness documented.
- [ ] Operator confirms the result; preserve artifact paths and worktree cleanup status.
- [ ] ASK USER for archive approval; do not check this box on behalf of the user.
- [ ] Only after approval, move body to archive path and remove a root pointer only if it belongs to this flight.

### 2026-10-25 — implementation authorization and coordination

User: “go ahead and implement the plan. Coordinate with the disappearing trainer card chat so we don’t duplicate work, preserve active runs, and stop before activating the new service or refreshing the viewer.” Isolated managed worktree created at branch codex/current-run-snapshots from cf5c9cf5a. Root pointer exists only in owned tree. Native Node26.7.0 SQLite3.53.4 verified locally (no external dependency).

Direct message sent to card owner; coordinator receipt independently confirms final source807dde160116a597138ba44913f8f13826fba22e and evidencecf5c9cf5ad98fdf0f580b0f447e1f79bd7adff1d, shared8790 last refreshed21:34EDT at807dde160. CPU/slot released. cards-v1 remains exclusively owned by createCardStore/createWorkbenchLoader. No live writer handoff is authorized. M5 may prepare dormant mode/runbook and rehearse on owned fixtures only; no existing writer edits or live handoff.

M1 frozen production boundary: new current-state.ts (bounded typed display/checkpoint reducer), current-store.ts (SQLite transactions/cursors/index/single writer), their tests. Existing model/party retention semantics reused unchanged. No runtime wiring or source log writer edits. Basecf5c9cf5a. Process baseline includes active agent PIDs70713/84705/89032/97517 and their game launcher/server children; no changes performed.

M1 RED: current-state/current-store tests fail to import nonexistent implementation. Tests freeze cumulative resume parity, party retention/reset, context/retry provenance, source/seq/terminal validation, bounded pending operations, atomic cursor/index/revision rollback, writer singleton, read-only connections and revision reset/tombstone behavior. No live sources read. Receipt /tmp/current-snapshots-m1-red.log.

M1 progress:14 focused fixture tests PASS; strict TS and scoped ESLint PASS. Ordinary initial buildPASS20.66s. Full gate runner paused at lint boundary on coordinator CPU-ownership correction (capture owns window); lint later failed3 new style assertions/delete issues, corrected without changing rules. Scheduler stopped before any full test/coverage. No full-gate pass claim; rerun pending CPU release.

Performed14 single guard/wiring/behavior deletions against a GREEN baseline; each failed its exact source suite and restored: order, terminal, foreign-run identity, injected pending-tool limit, restored roster, resumed tokens, next/start seq, source offset/size, stale cursor, sparse index end, singleton lock, late SQL rollback, symlink refusal. Added separate failing dangling-symlink regression and fixed lstat detection. All artifacts in owned runs/reviews/current-run-snapshots; not yet copied to canonical preservation root. First mutation attempt ran while platform /var symlink rejection broke fixtures and is NOT valid evidence; reran entire mutation set against restored GREEN baseline after fixing configured store path handling. Preserve that distinction.

M1 full ordinary test PASS4448agent/2044viewer/4425Python+3 protected cards after explicit ROM env correction. Coverage first run failed unchanged app.test.ts:1529 phone rolling-window reader5000ms timeout,5775ms observed; code/app test have empty diff from base and same inherited timeout is recorded in budget-extension worklog. No retry, suppression or unrelated fix; released CPU for capture/Flannery and will request a new coordinated coverage window after diagnosis.

Self-review found an in-scope JSON restart provenance issue: raw/party state serialize as separate objects and reference-based current-party notice would falsely report stale state. Added exact reference regression, observed RED, then rebind same-sequence anchors at hydration. Receipt /tmp/current-snapshots-m1-provenance-red.log. Gate source invalidated; final full gates will rerun on corrected source (no claim first gate covers correction).

M1 provenance correction:16 focused testsPASS, scoped TS/ESLintPASS; native recorded battle fixture retains22/39HP with current-source identity after JSON restart. All16 mutation cases now independently RED/restored, including current roster reference and battle-health source reference. Added no alternate party policy; rehydration reuses same-sequence anchors. Raw fixture values retained; isolated replay fixture rebinds envelope run/sequence/time only. Full corrected-source gates pending next CPU window after capture/Flannery. Before-env failure logs are redacted for inherited environment credentials before preservation/review.

Owned-branch sync to current main535989c4b before corrected-source gates; mergecc0219c9fcfc620cea4a7c1d4e50431d807c4ecc. Main changes are Flannery controls-summary and its test/worklog, no M1 source conflict. Shared main was not moved by this task. CPU order now final-context-budget, Flannery finite postmerge main-test, then snapshots; no owned heavy job until explicit relay. Current focused set17PASS, prior14case full-gate results remain historical, not final proof.

M1 source conformance refinement before review: retained bounded raw milestone anchors were missing from the checkpoint despite the approved recorded-progress group. Added failing progress-retention and injected-limit tests, then persisted unique recorded anchors (default1024 bound). currentView still does not hydrate milestones/validated splits: these anchors remain recorded/unverified data and cannot seed grading or timeline state. Source event schemas validate them at the SQLite boundary. Receipt /tmp/current-snapshots-m1-progress-red.log. New in-contract data field only; no grade or card-owner change.

M1 final CPU window released22:37EDT after Flannery live proof; synced latest documentation-only mainba6361e74 in owned branch. Current focused18PASS; fixed callback narrowing before starting full gates. No service/API/browser code or runtime changes exist yet. Full corrected-source build/lint/test/coverage/vendor starts now, single owned runner.

M1 final GREEN source gates allPASS on unchanged executable hashes recorded m1-source-hashes.json: build19.84s, lint106.40s, ordinarytest113.51s (4448agent/2049viewer/4425Python plus3protected trainer widths), coverage127.14s (agent99.17/92.76/97.60; viewer98.24/91.61/95.26; Python97.47/93.58/100 lines/branches/functions), vendor0.13s.18 focused source/SQLite tests PASS;18 performed guard/behavior deletions independently RED/restored after GREEN baseline. No application/test/config bytes changed during or after final gates, except temporary restored mutation probes; hashes match final gate source. All earlier failures preserved and explicitly superseded, never suppressed.

No runtime callers, daemon/API/browser wiring or card writer changes in M1. Gate CPU released22:45EDT. Coordinator declined main hold under current standing policy (branches not ready cannot hold); review frozen ba6361e74, join board only after LGTM; byte-identical diff digest can preserve reviews if main moves. No board slot currently joined and no shared refresh authorized. COMMIT: persist resumable current checkpoints GREEN (SHA recorded next).

COMMIT: `feat(viewer): persist resumable current-run checkpoints` (a5d14eee199498c56afb17aef1ee883aa99c9b10);18 targeted/18mutations/full gates above. Independent review pending; milestone not complete.

M1 round1: ClaudeLGTM, GPT/Astra/SolBLOCKING; Grok Cursor account usage unavailable (not approval). Reduced vendor diversity explicit. Synthesis classifies four accepted findings: transactional revision reads, anchor-dependent native party validation, stale-sequence operand evidence, and a mis-targeted roster mutation. All stay in M1 owner/contract; correction batch and round2 pending. No M2 work or landing. Original general human Grok-waiver records independently preserved; no activation authority inferred.

M1 correction batch:21 focused testsPASS, strict TS/scoped lintPASS. Native two-connection read fixture forces pruning between metadata and journal rows; removing the whole read transaction yields a missing tombstone (removed:false versus expectedtrue), then GREEN restored. Same-offset decreasing-seq mutation independently accepts stale state and fails the new unchanged checkpoint/revision/index assertion. Independent card/health anchor bypass mutations accept [null] parties and fail exact rejection assertions. Corrected full-assignment roster deletion now loses sparse retained party (length0 versus1), rather than merely breaking reference identity. All22 performed mutations RED/restored against GREEN21-test baseline; logs m1-r2-mutation-*, receipt m1-r2-mutations.json. Source gate invalidated; full corrected-source gates queued after capture/final-context-budget. No M2 implementation or runtime wiring yet.

M1 corrected-source full gates PASS on c46932a20 (synced main0352ae567): build19.14s, lint87.21s, test107.14s (4475agent/2052viewer/4425Python + protected trainer cards), coverage125.19s (agent99.15/92.62/97.54; viewer98.23/91.63/95.26; Python97.47/93.58/100 lines/branches/functions), vendor0.14s. Receipt m1-r2-gates.json; source hashes m1-r2-source-hashes.json. Test window released explicitly after client/tool interruption; no suites remain. No executable source changes after these gates. Round2 frozen packet pending; no M2/landing/service/viewer changes.

M1 round2 STOP: frozen ca3d4d125/digest0e9d6526...8c72. Claude/GPT/AstraLGTM; SolBLOCKING on one new required-evidence gap: initial non-run_start fixture has seq1 and is rejected by sequence before initial-type identity operand. Owner verified masking in source and absent independent mutation. Existing production guard is correct; proposed correction is only isolated seq0 negative fixture plus targeted guard deletion/restoration proof, gates/review. Not performed because execute-worklog round cap requires operator scope confirmation after round2. Detailed m1-r2-synthesis.md and m1-r2-review-verdicts.md preserved in canonical runs/reviews/current-run-snapshots. M1 not complete, M2-M5 not started, branch unmerged; no service/API/browser activation, shared viewer refresh, game/agent/runner changes. CPU released; no landing slot. Corrected overly broad checked M1 planning rows to exact proven primitives; crash/source-reader claims explicitly still M2. Earlier fullRun16 prose is14 actual events, no functional fixture change. Pending user's bounded scope decision, no third round launched.

### 2026-10-27 — operator waiver, identical sync, dormant M1 landing
Original native coordinator record independently verified: [private transcript] cited user [private message reference], Oct27 01:37 America/New_York: “we dont need the test addressed, we dont need another round of review”. Preserved exact record m1-r2-operator-waiver.json, disposition m1-operator-disposition.md. Left test/source unchanged, no third review. This clears only remaining Sol proof gap and review checkpoint; runtime activation/shared refresh still forbidden. Grok remains unavailable, standing general waiver separately preserved, not LGTM.

Main advanced from0352ae567 to3cb27905e while waiting. Preserved original evidence branch codex/current-run-snapshots at8b70fae3f; created codex/current-run-snapshots-m1 from exact reviewedca3d4d125 and merged newmain. Synced7c3b52c1251498b03fd8cc5aeef6910f3018808c full delta SHA2560e9d65269c533efa4dc955a28130178277df179254af91f48bb926f85a368c72 matches original approved round2 packet byte-for-byte. Current workflow just-test includes coverage, so no duplicate coverage run. Fresh synced gates PASS: build17.31s, lint77.23s, test133.47s (4540agent/2060viewer/4426Python plus3protected card widths; all coverage floors enforced), vendor0.11s. Artifacts m1-main-sync.json and m1-sync-gates.json with logs. Source/test hashes unchanged.

Joined board with verified actual chat ID 00000000-0000-4000-8000-5c2156fb325f as codex/current-run-snapshots-m1, position1. Preserved own original untracked planning document at canonical runs/reviews/current-run-snapshots/planning-original-before-M1.md with SHA receipt before tracked replacement; untouched foreign untracked recipe and root WORKLOG.md. Local main fast-forwarded exactly to7c3b52c1251498b03fd8cc5aeef6910f3018808c. No runtime caller or activation exists; no shared viewer refresh performed.

Postmerge just-test FAIL after32.33s: packages/agent/src/citation-evidence.test.ts96 expects false for filename hyperqwen-control-3h.json but canonical foreign untracked experiments/fixed/hyperqwen-control-3h.json has citation evidence=true. Agent4545/4546 PASS; viewer/Python/card postmerge stages not reached. Same tracked synced source passed isolated gates, which lack this foreign untracked recipe. This task did not create/change/remove it. No retry, hiding fixture, test suppression or source fix. Canonical tracked tree otherwise clean at landed SHA. Failure log m1-postmerge-test.log and receipt m1-postmerge-test.json preserved. CPU explicitly RELEASED, coordinator notified with exact issue and legitimate owner disposition requested. Board released after this evidence-only commit. Postmerge gate remains unpassed; M1 operational closeout and M2-M5 advance blocked pending resolution. No claim full plan complete or live performance. Original service activation/viewer-refresh STOP remains.

### 2026-10-27 — M1 closeout after external recipe/test resolution
Read-only coordinator update prompted assessment, not a claim of passing tests. Verified external20320344cccb6300ba6bb6fd04aa795e18c8f5bf tracks HyperQwen recipe and explicitly includes its name in citation-evidence current-recipe test set. This repairs the actual false expectation; no artifact was hidden and this task changed neither recipe nor test. Canonical clean main2ad9996824d4bec793554404ea2e52c61c9c9dfc contains unchanged M1 source/tests (empty diff from7c3b52c12 for all four files).

Reserved CPU window from Claude6:36PM America/New_York, one canonical just-test PASS146.69s. Head/final-head both2ad9996824d4bec793554404ea2e52c61c9c9dfc. Counts4570agent/2083viewer/4431Python +69gateway contract tests and3protected trainer-card checks (1280/1440/375). Coverage floors enforced in same pass; no duplicate coverage run, retries, exclusions or test suppression. Receipt runs/reviews/current-run-snapshots/m1-closeout-main-test.json with full log. Earlier m1-postmerge-test.json/log remains FAIL on original pin, not rewritten or retroactively called PASS.

CPU RELEASED immediately. M1 operational closeout now complete on current main, with original operator-approved remaining Sol evidence gap and Grok unavailability honestly retained. No third review or isolated fixture correction performed. Evidence-only worklog update under landing board; no new runtime code. M2–M5 remain unimplemented; original approved implementation scope resumes after M1 closeout. No new service/shadow activation, shared viewer refresh, active-run input/restart or experiment launch performed. Root canonical WORKLOG.md remains owned by its existing flight and unchanged. Archive and live-proof checkpoints remain open.

### M2 execution boundary — 2026-10-27
Original user authorization is to implement the approved M1–M5 plan and stop before service activation/shared viewer refresh; no new permission is inferred from coordinator status relays. M1 source/closeout complete at1b7ae8b96, inherited Sol fixture waiver remains scoped and unchanged. New owned branch codex/current-run-snapshots-service, same isolated worktree. M2 production boundary: current-store.ts additive staging/metadata transaction methods, new current-digest.ts (resumable SHA256 state verified against native crypto for restoration-prefix hashing), current-source.ts (bounded descriptor reads/identity/anchors/continuation checks), current-service.ts (fair/coalesced projector and async health), current-service-cli.ts (explicit argv-only dormant entrypoint), direct tests/owned fixture rehearsal. No existing viewer/server/agent/game writer, card-cache writer, frame/control API or default startup changes. Source logs remain read-only.
M2 terminator remains process kill/restart and partial reconstruction recovery, single writer, provisional-tail vs full-prefix completeness, no counter double-add/rewind, bounded/fair source work and quiet-health semantics. Sparse index/staging/current cursor/public metadata commit atomically; latest provisional display and private reconstruction are separate. Prefix hash checkpoints must contain only digest state/offset, never raw prompts/transcripts; incomplete line bytes may be reread after restart within line cap. Current-source cursor binding has declared append-only/bounded-anchor limitation, never claims complete old-prefix integrity. Actual API/browser/performance/rollout remain M3–M5. Full suites need a fresh reserved CPU window. No live root service start, no game health requests against active ports, no main moves outside board, no viewer refresh.

M2 RED: new digest/service fixture suites fail to load missing current-digest/current-service modules (m2-red.log). First fixtures specify native-SHA parity and bounded hash restart state, cursor resume/no double-add, torn-line append, independent provisional/reconstruction state, source replacement generation reset, and held async health. No runtime callers or live source reads. Remaining M2 fairness/restoration/process-kill cases still pending; no milestone completion claim.

M2 interim (not GREEN milestone): new resumable SHA/digest, bounded descriptor reader, additive native staging/auxiliary store and dormant projector/CLI implemented in owned branch. Current scoped tests:11 service fixtures plus digest/source/stage/CLI/M1 regressions, strict TS PASS; no full M2 gates or review yet. Stage-only index publication regression observed RED then fixed; native late-publication trigger proves rollback of state/cursor/index/metadata/private-stage transition. Prefix hashing checkpoints omit all uncompressed raw remainder; at most63 source bytes are reread to rehydrate a native-oracle-checked digest. Prefix verification resumes separately from current event reconstruction. Partial-prefix resume, byte-observed postcursor event reads, hot-cache eviction fairness, bad-prefix quarantine, timestamp-regression liveness separation and late terminal-event handling have targeted proof. Source evidence invalidation uses bounded metadata fingerprints of existing visual/recovered receipt files; this projector does not read/re-grade whole recovered traces/images. Header discovery and append reads remain outside request handling; actual API/browser code untouched.
Pending M2: process SIGKILL before/after commit proof on owned fixtures; remaining resource/probe-ownership/error/CLI paths and native fixture rehearsal; performed mutations; scoped lint; full reserved gates; independent review. No source tests changed for the waived M1 initial-event operand. Current service entrypoint requires explicit root/database; loopback health probing is disabled unless explicitly selected. No service was started against live recordings, no active-game ports probed, no shared refresh or source recording edits outside fixture writers.

M2 core checkpoint:48 focused tests PASS (including unchanged21 M1 tests); scoped ESLint PASS, earlier scoped TS PASS. Still WIP: no full gates/review or process-kill proof yet. Initial header/public/private seed now one native transaction, avoiding duplicate durable writes. Health probes are bounded, abortable and tied to current port/run/generation; parser/source retry quarantines unchanged failed sources, checks receipts by metadata only, and preserves current display separate from strict prefix provenance. New SHA state remains native-oracle-verified. Next is owned-process transaction-barrier/SIGKILL proof and remaining coverage, not live activation.

M2 restart/resource checkpoint (2026-10-27 20:05 EDT): root-scoped SQLite lease prevents duplicate projectors even at different database paths; database binds canonical root identity and releases startup ownership on rejection. Separate monotonic commit/discovery scheduling survives wall-clock regression. Byte credit has an explicit capped burst plus whole-batch reservation; tiny injected limits verify exhausted-credit parking/refill. Held old health response cannot update a newer port owner. Same-inode truncation starts a new generation, foreign/gapped append preserves durable current and reports a problem, and old ended sources remain provisional outside recent reconstruction scope. CLI reports revision changes only; idle-report and discovery-regression tests were independently RED before fixes. Latest service/CLI focused24 tests PASS; earlier seven-suite52 PASS precedes these additions. Scoped TS/ESLint previously passed; final rerun pending after new source. Native first2 crash tests passed on earlier built prototype only; newly added freshness guard and actual CLI lifecycle case require a fresh build. Coordinator queued a reserved ~30s build/three-fixture window after grass-strides and before aborted-runs. No live/root service activation, actual game probe, card-store writer change, or shared refresh.

M2 native rebuilt proof: `just build` PASS and actual child-process3tests PASS (Vitest1.29s) on current source including root lease/burst/monotonic changes, receipts m2-rebuilt-native-build.log and m2-rebuilt-native-process.log. Before-commit barrier exposes old durable current/private/index, SIGKILL rolls back, new child resumes once; after-commit kill preserves exact cursor; actual explicit-root CLI reaches complete500-input snapshot with health OFF, exits0 on its own SIGTERM and leaves recording SHA unchanged. CPU released20:05:43EDT; aborted-runs next. Additional disappeared-ended-source regression observed RED (after correcting an initially wrong journal cursor in the test); discovery now reconciles persisted run IDs to emit tombstones and clear derived state even across restart, without parsing every stored state. Latest six-suite54PASS excludes current-stage (a stale filename in that scoped invocation); prior stage5PASS exists, final run will explicitly include correct current-stage.test.ts. This is a WIP checkpoint, not milestone GREEN/full-gate completion.

M2 pre-gate sync: merged current main896088908 into owned service branch without source conflicts. Included upstream type-gap/supplies/gym changes as dependency only; M2 still touches no runtime wiring/agent behavior. New gate receipt must name this synced source; earlier prototype proof remains separately identified.

M2 test preparation: added direct recorded native party-health file-adapter/restart proof (expected22HP and exact party/health anchor provenance) and tiny candidate1vs2 fail-closed discovery fixture. Prepared isolated20+ adversarial mutation cases and sequential final gate runner (just-test includes coverage once). No claims from prepared scripts until execution. CPU queue currently aborted-runs, grass-strides postmerge if landed, then snapshots; no heavy jobs active in this chat.

M2 scheduler conformance: direct tiny two-run test found multiple private historical reconstructions could advance in the same step, contrary to approved one-at-a-time budget. Observed RED [1,1] versus [0,1]; enforce one historical reconstruction per step while current tails remain independent, then all seven correctly named scoped suites62PASS. This source correction supersedes the earlier rebuilt-native proof for final source; final reserved build and process tests/full suite will run again. No production-value fixture fill, default change, activation or shared refresh.

M2 resource conformance: tiny three-distinct-port/hot-cache2 held-probe test observed RED3vs2 calls; added independent health-probe concurrency cap tied to configured hotRuns. This bounds outstanding health even when source jobs rotate/evict, without waiting on a probe or impacting source progress. Coordinator reports main948095751 grass-strides landing and requests new pre-gate sync; no recipe/launch approval claimed by this task.

M2 second pre-gate sync: current main948095751 merged into owned branch without conflicts after grass-strides source/evidence landing; dependencies only, no task launch/config activation. Gates remain pending reserved queue, source remains dormant.
