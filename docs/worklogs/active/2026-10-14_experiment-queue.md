# Experiment queue

## Problem Statement
Operator (2026-10-14, whole-map thread, relayed by the project coordinator): "each feature needs to be tested and experimented on ... if theres already a queue we should add this experiment to the queue and we'd need visualization for the queue".

What exists today (discovery on main 0357cea):
- The viewer's NEXT RUN `RunQueue` (`packages/viewer/src/next-run.ts`) holds one run at a time under the shared lease `runs/.naming-gameplay.lock`.
- `serial-comparison.ts` is a frozen, counterbalanced cohort runner, but it is hard-wired to two loop-guard arms, 3 lanes and 24 trials.
- `patch-results.ts::comparePatchResults` grades incumbent vs candidate (one differing switch, 4 trials per arm, provenance check, verdict) but nothing calls it.
- Real feature experiments have been run by hand-written, untracked drivers in `runs/launch-receipts/<cohort>/launch.mjs` (plan.json, ABBA order, trials.jsonl, queue.json, terminal.json chaining). The viewer reads them back through special-cased parsers in `workbench-store.ts::cohortQueue` and `frontier-queue.ts`.
- `runs/reviews/2026-10-13-perspectives.html` proposes an experiment lane (switch flips, append-only results table) separate from the promotion lane (code changes under full gates).

So there is no general queue: each experiment needs a new driver script and a new viewer parser. This worklog generalizes the hand-written driver pattern into one tracked, typed, tested queue of feature-switch experiments, runs them serially under the existing lease, grades them with the existing `comparePatchResults`, and adds a PokéNav queue page.

## Constraints
- Local only. No push, no PR, no remote. Own worktree `/private/tmp/pokebench-experiment-queue` on `claude/experiment-queue`. Ask before merging to main.
- No measured run starts without the operator's explicit approval. The queue can run entries, but only entries the operator approved, and approval is recorded per entry.
- No automatic promotion (patch-evaluation skill). The queue reports a verdict and a recommendation; promotion stays a human decision.
- Reviewers: Claude CLI, Codex, Grok (Cursor). No local-model reviewers.
- Never touch claude.ai artifacts. The explainer stays local and is shared into project files.

## Skills Loaded
feature-worklog, pokebench-patch-evaluation (arm rules, 4 trials per arm, no auto-promotion), agent-observability (queue events in the viewer), feature-explainer.

## Architecture
**Definitions (tracked):** `experiments/<id>.json`, one file per experiment, validated by a zod `ExperimentSchema` in `packages/agent/src/experiments.ts`:
- `id`, `title`, `changedFeature` (a `SwitchableFeature`), `hypothesis`, `order` (queue position).
- `source`: `{ checkout: "main" | <worktree path>, commit }`. A trial runs the agent build of that checkout, and the runner refuses to start unless that checkout's HEAD equals `commit`, its tree is clean and its dist is built from it. This lets an unmerged branch (grass cost) be measured before merge on its own build, with both arms on the same build.
- `incumbent`: a full v2 preset (every switch explicit). The candidate is derived as the incumbent with `changedFeature` flipped, so the two arms differ in exactly one switch by construction (checked against `dependencyProblems`).
- `trialsPerArm` (default 4), `order pattern` ABBAABBA, `model` lane name resolved by gateway discovery at launch (no SKU), `limits` per trial, `budget.maxWallMs` total.
- `criteria`: primary milestone, completion tolerance 0, median speed margin 10%.
- `blocked`: optional reason string; a blocked entry is shown but never runnable.

**Runtime state (gitignored):** `runs/experiments/<id>/` holds `approval.json` (who, when, definition SHA-256), `trials.jsonl` (launch / outcome / launcher_error, append-only), `status.json` (pid, current trial, remaining), `result.json` (from `comparePatchResults`). Status is derived, never stored as truth: draft → approved → running → (held | done) | blocked, with `stale` when the definition changed after approval.

**Runner:** `packages/agent/src/experiment-queue.ts` + CLI `experiment-queue-cli.ts`, recipes:
- `just experiments` lists entries and derived status.
- `just experiment-approve <id>` records approval (operator only; agents never run it).
- `just experiment-run` runs the first approved entry in queue order, then the next, serially. It takes the existing lease (so it never overlaps NEXT RUN, the human host or an old cohort driver), runs native qualification and model discovery, launches each trial with `POKEBENCH_PLAY_PRESET` on its own run id and port (INV-7), appends to the ledger, resumes from the ledger after a crash, and stops at the budget. `--dry-run` prints the plan without launching anything.
- After the last trial, it grades with `comparePatchResults` and writes `result.json`.

**Viewer:** `GET /api/experiments` (definitions + derived status + per-trial pips + result). A new PokéNav directory entry ★ EXPERIMENT QUEUE in `static/index.html` with a `QueuePanel` (`packages/viewer/src/queue-panel.ts`): one card per entry in queue order showing the switch under test, arms (only the differing switch, plus the fixed context switches), trial pips in run order (A/B, colored by outcome), budget used / total, status, blocked reason, verdict and recommendation. Read-only; approval stays in the CLI so a browser click can never start measured runs. `workbench-store.ts::cohortQueue` also reads the new ledgers so `/comparisons` filters and plots queue cohorts without a new special-case parser.

## Seed entries (all start as draft; none approved)
Shared incumbent: the A* preset from `navigation-topology-astar-think-fast-n4` (bounded-navigation on, world-destinations off, loop guard on, objectives off, target null, 1500 turns, 30 min), with `ledge-hops-v1`, `one-way-tiles-v1` ON and `full-map-navigation-v1`, `grass-cost-navigation-v1` OFF unless the entry tests them. Primary milestone RIVAL_MET. Model lane: think_fast. 4 trials per arm, 8 per entry, about 4 h each.
1. `full-map-navigation-v1` on main (merged 353a3d1). Arms: incumbent vs full-map on.
2. `grass-cost-navigation-v1` on checkout `/private/tmp/pokebench-grass-cost` (branch `claude/grass-cost`, 72fe3bc). Same incumbent; both arms on that branch's build.
3. `ledge-hops-v1` A/B on main: incumbent with ledges off vs on.
4. `one-way-tiles-v1` A/B on main: incumbent with one-way tiles off vs on.
5. `elevation-transitions-v1` A/B on main once M0 lands (operator said add the switch).

## Invariants
- INV-Q1: An entry's two arms differ in exactly one switch. Test: schema rejects definitions whose derived candidate differs elsewhere or breaks dependencies.
- INV-Q2: No trial launches for an entry without an approval whose SHA-256 matches the current definition. Test: runner with a fake host refuses unapproved and stale entries; delete the check once and watch it go red.
- INV-Q3: One measured run at a time, machine-wide. Test: runner waits while the lease exists or a run is live; releases the lease in finally.
- INV-Q4: Every trial has its own run id, run dir and server port (INV-7). Test: launched argv/env per trial.
- INV-Q5: The ledger is append-only and the runner resumes from it without repeating a completed trial. Test: crash after trial k, rerun, trials k+1.. only.
- INV-Q6: Source pinning: refuse to run when the checkout HEAD, tree or dist hash does not match. Test: fake git host.
- INV-Q7: No automatic promotion. Result carries a recommendation only; no code path edits presets or defaults.
- INV-Q8: The viewer queue page is read-only. Test: no POST route for experiments.

## Security Review
Argv-only spawns (`node`, `git`), checkout paths treated as untrusted (resolved, must be an existing git worktree of this repo), loopback-only viewer route behind the existing Host/Origin checks, no secrets in definitions, ROM still only via `POKEBENCH_ROM` symlink.

## Milestones
**M0 — Elevation switch + feature-switch skill** (operator 2026-10-14: "we need a skill so that you always include switches for changes, and add the elevation switch. go")
- [x] RED: planner legacy rule on local/whole-map/ledge landings, tool and factory wiring, registry entry, preset default ON when omitted. 6 fail / 82 pass.
- [x] GREEN: `elevation-transitions-v1` (guidance, `needs: null`, default ON including omitted preset keys, planner-only, no prompt change). OFF restores the pre-44390a4 rule (0 keeps the walker's layer, any other mismatch blocks, 15 is not special). Explainer mapped to the existing `elevation-transitions.html`.
- [x] `.claude/skills/feature-switch/SKILL.md`: every behavior change ships behind a registered switch with OFF reproducing the previous behavior, plus an experiment-queue entry; CLAUDE.md points at it.
- [x] Gates: agent 940/940 (97.18 lines / 93.36 branches / 97.91 funcs), viewer 479/479 (95.71/90.53/95.30), Python 1840 passed (no Python change; submodule had to be initialised in this worktree). tsc/eslint clean, build clean. Guard check: removed the factory wiring, the factory test went red, restored.
- [ ] Multi-model review (batched with M1/M2).

**M1 — Definitions and derived status**
- [x] RED `packages/agent/src/experiments.test.ts` (module missing). Field renamed `reachMilestone` → `activationMilestone` to match the readiness rule main added in 2c73b02 (3 of the last 4 qualifying incumbent runs; verdicts in `docs/experiments/readiness.md`). Status now includes `pending` (no queue position: merged switch not queued yet) and `not-ready`.
- [x] RED 2: viewer `experiment-store.test.ts` (read side: queue vs pending split, approvals, ledgers, runner position, readiness.md rows, arm summaries with median turns and reached per 1k turns, recorded-run source) and the seed-parse test.
- [x] GREEN: `packages/agent/src/experiments.ts` (schema, arms, ABBA order, hash excluding queue position and notes, readiness with comparable/recent basis, ledger, trial progress, status) and `packages/viewer/src/experiment-store.ts` (snapshot, readiness.md rows, recorded-run source with caching). Seeds: queue 1 full-map-navigation, 2 elevation-transitions, 3 one-way-tiles; pending ledge-hops, counter-talk. Incumbent: the A* cohort preset plus ledge hops, one-way tiles and elevation ON, full-map and counter talk OFF; primary milestone RIVAL_HOUSE_ENTERED (the current frontier; RIVAL_MET is rarely reached).
- [x] Real data (read-only): the three queued entries are ready on recent runs (basis: recent, because no run matches the new incumbent yet); counter-talk and ledge-hops are not ready (0 of 4 reached OLDALE_TOWN / ROUTE_101), which agrees with docs/experiments/readiness.md. First snapshot over 124+ runs took ~10 s; M3 must cache.
- [x] Gates: agent 954 (97.22/93.45/98.01; experiments.ts 98.1 lines), viewer 498 (95.78/90.41/95.57), lint clean. Python unchanged since M0 (1847 passed).

**M2 — Runner and CLI**
- [x] RED: `experiment-runner.test.ts` (nothing runs unless queued + ready + approved with a matching hash; dry run; ABBA order on fresh run ids; ledger + presets + result.json; lease and runner file released; resume retires an interrupted trial without repeating finished ones; holds on launch failure, nonzero exit, budget, moved source, stop request; stale preset refused) and `experiment-cli.test.ts` (list/check/approve/pin/run, interactive-only approval with typed id, production host source checks against a temp git repo, discovery, launch env).
- [x] GREEN: `packages/viewer/src/experiment-runner.ts` (lease, runner.json, per-trial presets, ledger with model + environment fingerprint, re-verify source before every trial, budget hold, grading via `comparePatchResults` into result.json) and `experiment-cli.ts` (list/check/approve/pin/run; approval needs a TTY and the typed id; production host checks main HEAD == pinned commit, clean tracked tree, dist newer than the commit, gateway vision model, spawns `live.js play` on 127.0.0.1:8074 without POKEBENCH_ENDPOINT_FILE). Recipes: `just experiments`, `experiments-check`, `experiment-approve`, `experiment-pin`, `experiment-run`. Also: `discarded` state; snapshot `closed` list; `source.checkout` is `"main"` only (live.js writes the checkout's own runs/).
- [x] Guard check: removed the approval gate in deriveStatus; the runner's "runs nothing unapproved" test went red; restored.
- [x] Evidence: dry run against the real runs/ (read-only, nothing launched): queue = full-map-navigation, elevation-transitions, one-way-tiles (all draft); pending = counter-talk, grass-cost-navigation, ledge-hops (not ready, 0 of 4 reach OLDALE_TOWN / ROUTE_101).
- [x] Gates: agent 960 (97.23/93.46/98.01), viewer 514 (95.35/90.34/94.63; experiment-cli.ts 81.6 lines because of its `import.meta.main` entry block, same pattern as cli.ts), lint clean.
- DEFERRED (native qualification before trials): the hand-written drivers ran an untracked runs/navigation-proof/native-qualification.mjs; there is no tracked equivalent to call. Recorded for review.
- DEFERRED (prompt-changing switches): `comparePatchResults` marks a comparison ineligible when the arms' system prompts differ without an audited prompt-change contract. full-map and ledge hops change the prompt, so their results will say ineligible until a contract field exists. The views still show reach, time, turns and efficiency.

**M3 — Viewer queue page**
- [ ] Tests: `/api/experiments` shape, QueuePanel rendering (happy-dom) for draft/approved/running/held/done/blocked/stale, INV-Q8, workbench cohort integration.
- [ ] COMMIT RED / implement / gates / screenshot of the page on port 8790 / COMMIT GREEN / review.

**M4 — Skills**
- [x] `.claude/skills/experiment-queue/SKILL.md`: lifecycle (pending → queued → approved → running/held → done/discarded; never on both lists), registering a pending entry in the same merge as its switch, moving to the queue only when readiness passes, operator-only interactive approval, pinning, dry runs, reading results with turns and efficiency.
- [x] feature-switch skill step 8 now requires the pending entry in the same merge (switch id, hypothesis, arms, activation milestone, readiness, merge SHA); veto added. pokebench-patch-evaluation points at the queue's enforcement. `.agents/skills` symlinks added for both new skills.
- [x] `docs/experiments/readiness.md`: READY rows for full-map, elevation and one-way tiles (3 of the last 4 model runs, recent basis), BLOCKED row for grass cost (0 of 4 reach ROUTE_101).
- [x] Dry run of the skill on the seeds: `just experiments` equivalent output recorded in M2 evidence.

**M5 — Explainer and hand-off**
- [ ] Explainer `docs/explainers/experiment-queue.html` with diagrams; shared to project files.
- [ ] ASK USER: approve merge to main.
- [ ] ASK USER: approve each seed entry before any measured run.

## Operator additions (2026-10-14)
- "the queue should also be visible on the stats page": the queue also renders on Runs & Comparisons (`/comparisons`), replacing the EXECUTION QUEUE section.
- "i need 10 html variants of designs to choose from": round 1 at `docs/design/experiment-queue/queue-designs-round1.html`. Build waits for the operator's pick.
- "we'd need skills for creating experiments and adding them to the queue": new milestone M4 adds `.claude/skills/experiment-queue/SKILL.md` (author a definition from a switch, validate it, add it as a draft, never approve).
- Via the coordinator, from the rival-house thread: "milestone reaching isn't the only measurable effect. there's also total turns and overall run efficiency". Grading and cards report reach, median time, median turns (a miss counts the full turn cap) and reach per 1k turns.

- Via the coordinator, from the counters thread: "it doesn't make sense to run this experiment until the models can reliably reach this milestone. crud ur experiment skills so you know the right time to run experiments and when experiments are blocked like this one is cuz the models cant even reach this part yet". Each definition names `reachMilestone` (the first milestone where the switch can matter). The entry is derived `not-ready` until incumbent-config runs reach it reliably (default: at least 3 of the last 4 valid runs with the same model lane and limits). The runner refuses not-ready entries, the views show why, and the experiment skill checks readiness before proposing a run.

## Open decisions
- Elevation A/B: resolved, operator said add the switch (M0).
- Design pick for the viewer and stats views: pending (round 1).
- Operator said "go" (2026-10-14 20:07): worklog approved; M3 waits on the design pick.

## Closing the Loop
Gates per milestone: `just test`, `just lint`, `just build`, `just coverage` (≥90 lines/branches/functions both stacks).

## Session Log
2026-10-14: worktree created from main 0357cea. Discovery done; awaiting operator approval of this worklog before M1.
2026-10-14: operator asked for 10 design variants first, the queue on the stats page, skills, and turns/efficiency metrics. Round 1 designs drawn; build blocked on the pick.

## Surprises
- M0: a default-ON switch cannot declare `needs: bounded-navigation-v1`, because every preset with navigation OFF would then fail dependency validation. `needs: null`; the copy says it applies only while A* navigation is on. Captured in the feature-switch skill.
- M0: runs recorded between 44390a4 and this switch used the game rule but their harness_features lack the id, so `featuresOf` reads them as OFF. Runs before 44390a4 read correctly as OFF.

## Multi-Model Review Log
Pending.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive.
- 2026-10-14: merged main cef13fb (counter-talk-v1). Conflicts in play-preset, panels, navigation (+tests), features.test resolved by keeping both switches; guidance count 14.
- 2026-10-14: merged main a3c343b (grass-cost-navigation-v1). Resolved play-preset/features/navigation conflicts keeping both switches; harness order ...full-map, grass-cost, elevation. Seeds repinned to a3c343b with grass-cost explicit OFF; grass-cost-navigation added as pending (activation ROUTE_101). Gates: agent 960, viewer 498, Python 1847.
- RED: discarded entries leave both lists; snapshot gains `closed` (done + discarded). Operator via coordinator: an entry is never on both lists; it leaves pending when queued, finished or discarded.
- 2026-10-14: operator round-1 feedback (20:23): liked battle verdict, kanban (status filtering), party box; trial matrix too confusing; Match Call click-in lukewarm; asked for 10 more. Round 2 (designs 11-20) at docs/design/experiment-queue/queue-designs-round2.html, each with a separate PENDING list on both pages. M3 waits on the pick.
