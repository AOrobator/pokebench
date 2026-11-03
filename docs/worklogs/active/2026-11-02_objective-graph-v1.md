# objective-graph-v1 — ranking a legal badge order instead of a display order

Design contract: `docs/designs/objective-graph-v1.md`. Machine-readable edge draft:
`docs/designs/objective-graph-v1.edges.json`.

This worklog is **not** the target of `WORKLOG.md` (that pointer belongs to
`2026-11-02_bound-switches-both-arms.md`); read it directly until it becomes active.

## Problem Statement

The harness scores progress by position in `FRONTIER_MILESTONES`, and `next-milestone-hint-v1` asserts
`MILESTONE_HINTS[furthest+1]` as the next thing to do. The record run's badge order is
`1 → 3 → 4 → 2 → 5 → 6 → 7 → 8`; Dewford's gym is deferred four badges and Fortree's is entered only
after Steven. Under a linear frontier that legal order reads as under-performance, and GLM `0d5d`
reached Stone + Dynamo without Knuckle and concluded the supervisor was wrong for nagging Rustboro.
`docs/findings/campaign-milestones.md:7` already declares catalog order a display order, not a route.
The measurement layer does not honour that contract; this work fixes the measurement, then the nag.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md` — sections, milestone sizing, start gate.
- `.claude/skills/feature-switch/SKILL.md` — a measurement feature needs no switch (scope split below).
- `docs/agent-principles.md` PB1 (the game grades the run), PB3 (N ≥ 3), PB4 (declare harness help),
  PB5 (one variable per measured run).
- `docs/findings/campaign-milestones.md` — the node catalog and its predicate discipline.

## Decisions (operator, 2026-11-02)

1. **One system, two layers.** The operator's pushback on splitting the supervisor: it is the mechanism that
   keeps a run on track, so it is part of the same concept. Accepted, with a narrower split: the
   topology and depth are measurement (`feature-switch` exempts measurement and viewer-only changes),
   and only the model-facing conditioning is a switch. Reason it survives: if scoring sits behind the
   same id as the nag, the OFF arm is scored on the linear rank and the ON arm on the graph, so
   turns-to-badge stops being comparable across arms — and the historical re-score would depend on
   whether a run happened to have the switch on.
2. **Re-score historical runs.** Depth applies to every already-recorded run. The record-order column
   stays beside it so the delta is visible.
3. **Route-plan granularity:** map level plus key interior points.
4. **Graph switch ships ON in the bundle.** The bundle arm is the ceiling measure; each ablation runs
   off a pinned base that differs by exactly one switch (PB5).
5. **Pre-registered drought read** confirmed: longest inter-milestone gap in play minutes, as the
   mechanism metric beside turns-to-badge.

## Architecture

`PROGRESS_CATALOG` already holds every node — 62 base entries plus 103 campaign additions with
source-grounded predicates, and `REQUIRED_FRONTIER_MILESTONES` holds 200 ids (49 hand-written plus 151
derived from the catalog) overlapping it on 154, so 211 recordable ids in all. The graph adds **no
nodes**, only edges and a depth function:

- `K(R) = { v ∈ R ∩ non-optional : ancestors(v) ⊆ R }`, depth `= |K(R)|`.
- `remaining` = the count of non-optional nodes in the plan closure of `GAME_CLEAR_CONFIRMED` that the run
  has not reached. Counting the whole closure, not one path, matters: a cleared game needs every branch
  (all badges, both HM chains), and a shortest path would silently drop the siblings.
- Both computed at view time from recorded splits, beside `furthestMilestone`, which stays.

Consumers, named: `packages/viewer/src/frontier.ts` (chart and depth), `reports-view.ts` and the
grades/report path (column), `milestone-hint.ts` + `loop-supervisor.ts` (M3 conditioning, behind a
switch), and `story-route-plan-v1`'s step order (M4, follow-on).

`furthestMilestone` is a backwards max-index scan, so final ranks are order-insensitive already; the
damage is mid-run nagging. The re-score is designed to show small rank deltas and large correction
counts, and that split is the falsification test for M3.

## Invariants

- **INV-OG1** — Edges form a strict partial order: every id resolves, no cycles, no optional and no
  location-only prerequisites. Test: extend the shape of `milestone-prerequisites.test.ts:41`.
- **INV-OG2** — Qualification is a subset of ranking: every `prerequisites` entry in `PROGRESS_CATALOG`
  also appears as a graph edge. Rationale: two sources of truth otherwise drift apart silently.
- **INV-OG3** — Depth is monotone and order-insensitive: `R ⊆ R' ⇒ depth(R) ≤ depth(R')`, and a
  permuted arrival order gives the same depth.
- **INV-OG4** — M3's OFF state reproduces today's hint and briefing bytes exactly, and ON only changes
  which objective is named; it never names an objective with unmet ancestors or one already reached.
- **INV-OG5** — The route plan is advisory: no plan state may cause a refusal, block or gate. Guards
  the 0517 turn-73 class of defect.

## Security Review

No new model tools, no new privileged readout, no network, no ROM copy, no game-memory write. M1/M2 are
measurement and viewer paths. M3 changes model-facing text only, derived from catalog ids the model
already sees. M4 adds a large harness advantage and must be declared in run metadata under PB4.

## Milestones

**M1 — Topology and depth (measurement-only, no switch)**
- [x] Author `packages/agent/src/objective-graph.ts`: the edge table from the JSON draft, with pret
      `file:line` evidence carried per edge, plus `objectiveDepth()`, `remainingToClear()`,
      `enabledObjectives()`, `blockingPrerequisites()` and `unmetPrerequisites()`.
- [ ] Close the three remaining `status: "hypothesis"` edges (Route 118 east bank, Mossdeep open sea,
      Ever Grande waterfall). Procedure per edge: read the script or layout; promote to `verified` with
      `file:line`, demote to a `route` edge that never blocks, or drop it. Two candidate edges were
      dropped on 2026-11-02 this way, one became two stronger edges, and one dissolved into an open
      question about badge 7/8 enforcement. Those three now live in the module as `expects` edges, so
      they cannot block anything while they are unfinished.
- [x] Tests: INV-OG1 (resolvable, acyclic, non-optional), INV-OG2 (qualification ⊆ ranking), INV-OG3
      (monotonicity and permuted-order equality), plus each verified edge asserted against its cited
      fixture where one exists. 17 tests, `packages/agent/src/objective-graph.test.ts`.
- [x] Cheap checks: `vitest run src/objective-graph.test.ts` 17/17; file coverage 100/96.66/100/100
      (stmts/branch/funcs/lines); `eslint` clean on both new files.
- [ ] Gates per `execute-worklog`; record counts and coverage **≥ 90**. Focused and package-wide
      checks pass (`packages/agent` 382 files / 5409 tests after `pnpm -r build`). Full `just test` and
      `just lint` are not yet run: `just lint` is currently red on `main` itself for two pre-existing
      type errors (`cut-off-reply.test.ts:75`, `semantic-refusal-reasons.test.ts:75`), so the lint gate
      needs either that fix or an operator decision before M1 can seal.
- Terminator: graph module + tests green, zero unverified edges. Split trigger: if more than five
  edges resist citation, split the story edges into a second milestone instead of guessing.

**M2 — Depth column and the historical re-score**
- [x] Read-only rescoring pass over every run: `scripts/objective-graph-rescore.mjs` (dist imports, in the
      style of `scripts/audit-milestone-memory.mjs`) writes `docs/findings/objective-graph-rescore.md`.
      775 runs scored, 119 droughts of 200+ turns. Re-runnable; do not hand-edit the output.
- [x] Report the split explicitly, after a review caught the first version counting trainer defeats as story
      milestones: of the 58 droughts that ended on a *frontier* milestone, **3 (5%)** ended on one other than
      the entry the list named next; 61 of the 119 ended on a story-kind milestone the list never contains
      (trainer defeats, evolutions), which cannot testify about the list's aim. Depth trails record order by
      9.0 positions on average (max 58) because the index credits positions whose prerequisites are missing.
- [ ] View the depth beside the record-order index in `frontier.ts` / `reports-view.ts`; card keeps both.
      Held: the two numbers diverge by up to 58 and a card can show one bar, so which number the bar means is
      a design call, not a mechanical edit.
- Terminator reached, with a caveat that changes M3. The pre-registered primary read — *corrections
  suppressed* — is **not computable from the pool**: the recorded `loop_guard` `milestone_drought` payload
  is a stall briefing with no milestone id, so which objective the supervisor was pressing for cannot be
  recovered from any of the 775 runs. M3's ablation therefore needs the briefing to name its target before
  it can measure anything. Second finding: `remainingToClear` reads 14 for every run in the pool, because
  the hard-gated closure is the league sequence behind badge six and nothing has reached badge six — it is
  a late-game distance, not progress, and depth is the usable half.

**M3 — `objective-graph-supervisor-v1` (behaviour switch)**
- [x] Registry: appended to `SWITCHABLE_FEATURES` and `FEATURES`; optional in the play preset, `??false`
      in `normalizeFeatures` and in the v1 preset map, off in `DEFAULT_NEXT_RUN`. OFF is byte-identical:
      the briefing test strips the one line and compares the rest to the same briefing with the switch off.
- [x] Conditioning shipped as **forward-only**: the line names the first *legal* step after the furthest
      step the run has **earned** (reached, with its hard gates met — an out-of-order milestone such as the
      6bbd/d41e `SLATEPORT_HARBOR` before Mauville does not move the mark), and never a step behind it.
      The fallback that names a blocked step with its blockers is defensive: the record order always has a
      legal step ahead until the game is cleared, so a live briefing normally carries no `needs …` clause.
      Caveat a review caught: "earned" only holds while the gate evidence is in the log, and a save-state
      start reports what is true at that moment — the map visits before it are lost. So the mark ignores
      *location-only* prerequisites (a catalog entry with a `map` and no flag behind it, 74 of 165) and
      respects story and flag gates only.
- [x] Tests: `next-objective.test.ts` (15) + `objective-graph-briefing.test.ts` (5); `next-objective.ts`
      100 stmts / 100 branch / 100 funcs / 100 lines.
- [x] **Activated by operator instruction (2026-11-02): on in the bundle.** Encoding is the repo's:
      `experiments/feature-configs/current.json` gains the id in `switches` (bundle arm turns it on) and
      `"objective-graph-supervisor-v1": false` in `features` (the control base keeps it off; the parser
      refuses a bundle switch that is on in the base). Control base preset untouched. Suite green at
      384 files / 5422 tests; three pinned-definition tests refused the first attempt, which is the
      validator stopping a switch from being on in both arms — recorded here so the next flip is one try.
- [ ] Explainer page; ablation recorded here, not launched by merging.

**M3 finding — the graph cannot un-nag a legal objective.** `KNUCKLE_BADGE` is index 59 of the record
order and `DYNAMO_BADGE` is 83; nothing hard-gates the Dewford gym, so a run that deliberately deferred it
(0d5d) is offered it again by any scan that starts at the earliest gap. Forward-only scanning fixes the
specific nag by never looking backward, but it is the *plan's* order doing the work, not the graph's
legality. The graph's contribution is the id, the legality annotation and the `needs … first` clause.
That is the boundary between M3 and M4: M3 can say where the run is going, only M4 can say what the
route is.
- Terminator: switch merged with OFF proven identical; a fixed-run design for ON vs OFF is written and
  awaits operator approval.

**M4 — `story-route-plan-v1` (follow-on worklog)**
Named here only for sequencing: its step order is M1's topological order, map + interior granularity,
advisory-only, three-state off-plan line. Do not implement inside this worklog.

Surveyed 2026-11-02 before starting anything: `search_files "story-route-plan"` over the repo returned 0,
no branch or worktree carries it, and `docs/designs/` has no route-plan doc. Nothing is in progress
elsewhere; the plan is not built by anyone yet.

## Pre-registered reads

| metric | definition | arm |
|---|---|---|
| turns to badge | split receipt per badge | both |
| longest drought | longest inter-milestone gap, play minutes | both |
| `milestone_drought` events | per 1,000 turns | both |
| corrections suppressed | nags naming an objective with unmet ancestors | ON (retro for both) |
| plan adherence | steps per 100 turns; off-plan stationary turns | ON only |

## Closing the Loop

- [ ] Tests + gates for M1/M2/M3, counts recorded.
- [ ] Multi-model review per `execute-worklog`; cloud lanes only, never `inference.example`.
- [ ] Landing as separate stage; activation/ablation as a third.
- [ ] Explainers for M3 and M4; viewer refresh only if a viewer path changes.

## Session Log

- 2026-11-02 — Read `keepingiticy speedrun commentary (2026-11-02)` and `Run grades (2026-10-30)`;
  surveyed `frontier.ts`, `workbench-view.ts`, `reports-view.ts`, `milestone-hint.ts`,
  `story-progress.ts`, `campaign-catalog.ts`, `findings/campaign-milestones.md`. Verified gates against
  pret at `~/dev/pokeemerald` (`vars.h:153`, `SootopolisCity_Gym_1F:86`, `MossdeepCity_StevensHouse`, `Wallace`,
  `RusturfTunnel`, `MauvilleCity_House1`). Wrote the design doc and the edge draft. No source change.
- 2026-11-02 — M1 on branch `claude/objective-graph-v1` (worktree `/private/tmp/pb-objective-graph`).
  RED `c528a844c` (tests only, module absent, suite fails at import). GREEN: `objective-graph.ts` with
  30 edges (17 `requires`, 13 `expects`) and five read functions; 17 tests pass; file coverage
  100 stmts / 96.66 branch / 100 funcs / 100 lines; eslint clean on both files. `tsc --noEmit` still
  reports `cut-off-reply.test.ts:75` and `semantic-refusal-reasons.test.ts:75`; both reproduce on main at
  `def665b08` with nothing of mine present, so they are pre-existing and untouched.
- 2026-11-02 — Package smoke on the same commit: `pnpm -r build` then `packages/agent` `vitest run`
  → 382 files / 5409 tests pass in 27s. The fresh worktree needed the build first; without it 31 files
  fail at import on `@pokebench/agent/milestones`, which is a worktree artefact, not a regression.
  `remainingToClear(∅)` = 14, the plan closure of a cleared game; `OBJECTIVE_NODES` = 211.
- 2026-11-02 — M2 re-score. `node scripts/objective-graph-rescore.mjs` over 776 runs with milestone events
  (offline, no model or emulator): 12 runs at two or more badges, 119 droughts of 200+ turns. **Correction
  after review:** the first cut reported "64 of 119 (54%) off-linear", but 61 of those endings were trainer
  defeats and evolutions the catalog files as `kind: "story"`, which are off the list by construction. Of the
  58 droughts that ended on a frontier milestone, 3 (5%) ended on a different one than the list named.
  Mean record-order minus depth 9.0, max 58 (`glm53-mac_6bbd`, `qwen36-gpu1_d41e`). Wrote
  `docs/findings/objective-graph-rescore.md`. The three longest droughts (2647, 2264, 1831 turns) named the
  milestone the run did eventually reach, so they are "correct target, no progress", not wrong-target — the
  graph would not have fixed those, a waypoint plan would.

## Surprises

1. **Sootopolis gym is gated on the Feather Badge, not seven badges** (`SootopolisCity_Gym_1F:86`,
   `GoGetFortreeBadge`). My own review said "Dive + 7 badges" from memory; the script corrected it.
2. **Waterfall comes from Wallace before Juan**, not after (`SootopolisCity:1252-1261`), so it gates
   Ever Grande and Victory Road, not the Rain Badge. The commentary note has this backwards.
3. **The nodes were already built.** 103 campaign additions cover the full game through
   `GAME_CLEAR_CONFIRMED`; the missing artifact is edges, which is a much smaller job than the note implies.
4. **The contradiction is already documented**: `findings/campaign-milestones.md:7` says catalog order is
   a display order while three consumers treat it as a route.
5. **Final ranks barely move.** `furthestMilestone` takes the maximum reached index, so deferred badges
   are already not penalised in the end-state table; the penalty is live, in the nag.
6. **Field moves are badge-gated, not item-gated.** Rock Smash is refused without badge three and
   Strength without badge four (`field_move_scripts.inc:62,124`), so the HM in the bag is inert until the
   badge arrives. Every "the HM gates this map" claim needs the badge edge beside it.
7. **The league door checks one badge.** `EverGrandeCity_PokemonLeague_1F/scripts.inc:46-63` guards on
   `FLAG_BADGE06_GET` and the source comment calls Winona's the only skippable badge — so nothing read so
   far forces badges seven and eight. Either an unread script does, or the Rain Badge is mechanically
   optional, which would make the linear frontier rank a badge the game does not require.
8. **INV-OG2 caught a prerequisite the hand table missed.** `SLATEPORT_HARBOR` declares
   `MAGMA_HIDEOUT_STORY_COMPLETE` in the catalog (`campaign-catalog.ts:409-410`), and the first test run
   failed on it. The invariant that keeps qualification and ranking from drifting apart earned its keep
   before the module even compiled.
9. **The drought briefing never names an objective.** 314 of GLM 0d5d's 318 `loop_guard` events are
   `milestone_drought`, and every one of them carries a stall briefing — location, exits, tried-and-failed —
   with no milestone id anywhere in it. "Which objective is the supervisor pressing for" is therefore not
   recoverable from any recorded run, which is exactly the quantity M3's ablation was going to measure.
10. **`remainingToClear` is a constant for the whole pool.** 14, for all 775 runs, because the hard-gated
   closure of a cleared game is the league sequence behind badge six and nothing here has reached badge six.
   A distance measure that cannot move until the last third of the game is not a progress measure.

## Multi-Model Review Log

- Pending M1.

## Boy Scout Log

- `packages/agent/src/__probe0517.test.ts` is untracked in the main worktree and not mine; left alone.

## Archive Milestone (user-gated)

- [ ] ASK USER — archive after M3 lands and the ablation is recorded.

### Review round 2 — 2026-11-02

Third read of the branch (`4c3bb2fba`) found four things that were still wrong, all fixed here:

- **A checkpoint start stalled the mark.** The location rule was applied only where the mark scans, so
  `enabledObjectives` still dropped a badge whose sole hard parent was a map visit, and the plan skipped
  ahead. The earning index now skips location-only parents for every consumer (depth, enabled, blocking);
  the plan index keeps them so a chain through a place stays connected.
- **The checkpoint test cut before Lavaridge** and passed without the fix. It now cuts after
  `LAVARIDGE_GYM_COMPLETE` and pins `HEAT_BADGE` as the target, which is the first prefix where a full log
  and a save-state log disagree.
- **Four `requires` edges cited a directory, not a line.** All four now name a `file:line`
  (`LavaridgeTown_Gym_1F/scripts.inc:62`, `MagmaHideout_1F/map.json:57,Kalos`,
  `Route111/map.json:222,235`, `FortreeCity/scripts.inc:58,80`), and the test enforces `\.(c|inc|json|md):\d`
  on every hard edge instead of a bare path prefix.
- **Two documents overclaimed.** The design's closure paragraph claimed "all eight badges, both HM chains";
  the closure of `GAME_CLEAR_CONFIRMED` is 14 nodes — the league sequence plus the gates recorded in front
  of it — and both the design and the findings now say so. The findings' "hard-gated behind badge six" and
  the uncomputed checkpoint sentence are replaced by computed text: 3 runs at four badges score 54, 54, 109,
  and 2 of them began from a checkpoint (each carries a `continuation-provenance.json`).

Gates on `4c3bb2fba` → this commit: `pnpm -r build` and `pnpm -r lint` clean; `packages/agent` **384 files /
5432 tests**, `packages/viewer` **184 files / 2419 tests**; coverage agent **96.4 / 92.38 / 97.45 / 99.02**,
viewer **94.57 / 90.78 / 94.83 / 98.22**; re-score unchanged at 776 runs / 119 droughts / 3 of 58
frontier-ending droughts off-linear / mean frontier-depth 9.0. No run launched.
