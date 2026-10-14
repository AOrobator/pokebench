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
**Definitions (tracked):** `experiments/<id>.json`, one file per experiment, validated by the typebox `ExperimentSchema` in `packages/agent/src/experiments.ts`: `id`, `title`, `changedFeature`, `hypothesis`, `activationMilestone`, `primaryMilestone`, optional `queuePosition` (absent = pending), `source` `{checkout:"main", commit}`, a full v2 `incumbent` preset, `trialsPerArm` (4–8), `modelLane` (the gateway model id), `budget`, `criteria`, `readiness` `{window, minReached}`, optional `blocked`, `discarded`, `notes`. The candidate is derived as the incumbent with `changedFeature` flipped (INV-Q1).

**Runtime state (gitignored):** `runs/experiments/<id>/` holds `approval.json` (who, when, definition SHA-256), `trials.jsonl` (launch / outcome / launcher_error, append-only), `presets/`, `logs/` and `result.json`; `runs/experiments/runner.json` names the experiment and trial the live runner is on. State is always derived: pending, not-ready, draft, approved, running, held, stale, blocked, done, discarded.

**Readiness:** runs of the experiment's model lane only. Comparable runs also share the incumbent's turn and wall limits and every switch but the changed one; with fewer than `window` of those, the latest lane runs of any registry configuration stand in (labelled "recent").

**Runner:** `packages/viewer/src/experiment-runner.ts` + CLI `packages/viewer/src/experiment-cli.ts`, recipes:
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
- INV-Q4: Every trial has its own run id and run dir (INV-7); trials share port 8074 one at a time under the lease. Test: launched argv/env per trial.
- INV-Q5: The ledger is append-only and the runner resumes from it without repeating a completed trial. Test: crash after trial k, rerun, trials k+1.. only.
- INV-Q6: Source pinning: refuse to run when main's HEAD is not the pinned commit, the tracked tree is dirty, or packages/agent/dist/live.js is older than the commit. Test: temp git repo.
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

**M3 — Viewer queue page** (design: party slots from 11 that open into 18's battle card, operator yes 2026-10-14 21:00)
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

## Review r1 (frozen base a3c343b, head 7962072, diff SHA-256 f7282f04b72e65e107d6ab5a9f86b5365ed82c99aba5a702bc79c38097a0bdb0; packet /tmp/eq-review-r1)
- Claude CLI (`claude -p --permission-mode plan --setting-sources user`; the ~/.claude-review profile is logged out, so the default profile was used): BLOCKING. B1: a started experiment with no approval derived `held` and resumed (INV-Q2). B2: a run that recorded `run_end: crash` and exited 1 was logged as a launcher error, dropped from grading and re-run (PB2).
- Grok (`cursor-agent --mode ask --model cursor-grok-4.5-high`): BLOCKING, same B1.
- GPT lane: Codex CLI's configured default gpt-6.1-sol is unsupported on this ChatGPT account (exit 1); Cursor gpt-5.6-sol-xhigh hit the account's usage limit (exit 1). Lane blocked; retrying with an explicit Codex model.
- RED for B1/B2: started + no approval derives `stale`; runner re-checks the approval before every trial; a crash with a recorded run_end is an outcome and the queue continues.
- Wording fixes accepted: INV-Q6 checks dist mtime against the commit time (not a dist hash); INV-Q4 trials share port 8074 serially under the lease, each with its own run id and run dir.
- GREEN for B1/B2: `deriveStatus` returns `stale` for a started experiment with no valid approval; `runQueue` re-checks the approval hash before every trial and holds if it no longer matches; a trial whose run recorded `run_end` is an `outcome` even when play exits nonzero (only a run with no recorded end is a launcher error). Lease directory is removed if its owner file cannot be written. Guard check: removed the per-trial approval check; the mid-run revocation test went red; restored.
- Gates: agent 960 (97.23/93.47/98.01), viewer 516 (95.34/90.38/94.64), Python 1847; lint clean.
- Elevation explainer: section 6 (switch ON vs OFF diagram, wiring) and status line; Harness Config card link tested (panels.test, server.test). Viewer tests 517.

## Review r2 (frozen head fd64e50, diff SHA-256 cc152c9224e125c846051d3388f682786d03d8b4be380eebfff0cd84b5f7d189; packet /tmp/eq-review-r2)
- Claude CLI: r1 B1 and B2 confirmed fixed. BLOCKING on N1: Ctrl-C makes play end with run_end operator_abort and exit 0, which the runner graded as a finished miss and never reran (PB3/PB5; the repo excludes operator_abort everywhere else). N2: `--once` on the last trial returned before writing result.json, and the experiment then closed ungraded.
- RED for N1/N2 written (operator stop → launcher_error, hold, rerun, not graded; `--once` on the last trial grades). Fake host run ids made globally unique.
- Codex (`codex exec -m gpt-5.6-sol --sandbox read-only`): r1 fixes confirmed. BLOCKING: (1) exit 0 without run_end was graded as an `incomplete` outcome; (2) readiness ignored the model lane and limits the worklog requires; (3) one `experiment-run` stopped after the first experiment instead of continuing in queue order; (4) the runner reread the whole ledger and rewrote presets every trial (quadratic in rows).
- Grok: LGTM. Hardening taken: `approved` in views now means the approval matches the definition hash; worklog Architecture text corrected.
- RED for Codex 1–3 written (clean exit without run_end holds; readiness filters to the lane and, for comparable runs, the same turn and wall limits; two approved entries both run in one call).
- GREEN for r2: N1 operator_abort → launcher_error + hold + rerun, never graded; N2 `--once` grades on the last trial; Codex 1: any run without a recorded run_end is a launcher error whatever the exit code; Codex 2: readiness uses only the experiment's model lane, and comparable runs must match the incumbent's turn and wall limits (ReadinessRun carries model, maxTurns, maxWallMs); Codex 3: `runQueue` continues to the next approved entry after one finishes (unless `--once` or a hold); Codex 4: the ledger is read once per experiment and kept in memory, presets written once per arm, approval still re-read before every trial (revocation must be seen). Grok: `approved` means the approval matches the hash.
- Guard check: dropped the lane filter in readinessOf; the lane test went red; restored. Real data unchanged: the three queued entries are ready on think-fast runs (3 of 4), the three pending ones are not.
- Gates: agent 960 (97.23/93.48/98.01), viewer 521 (95.36/90.43/94.65), lint clean. Python unchanged (1847).
- Explainer: docs/explainers/experiment-queue.html (lifecycle, readiness gate with the 2026-10-14 counts, arms/ABBA, per-trial checks and outcomes, current contents, commands, status); README index entry. Rendered and checked locally.

## Review r3 (frozen head b3703e4; packet /tmp/eq-review-r3)
- Claude CLI: LGTM (all r2 fixes confirmed).
- Grok: BLOCKING: an experiment whose outcomes are all recorded but whose result.json was never written derives `done`, closes and is never graded.
- Codex: BLOCKING: (1) same as Grok; (2) definitions accept values comparePatchResults rejects or disqualifies (trialsPerArm 5–8 vs the evaluator's fixed 4, speedMarginPercent 0 or >100, completionTolerance >4); (3) the `--once` last-trial test ran the full orchestration seven times to build its state.
- Operator (via coordinator, 2026-10-14 21:01, "What to prioritize next" thread): "we also need to update the experiment skills to 8 per arm". With 4 per arm only 4/4 vs 0/4 reaches p < 0.05.
- Operator design decision (21:00 "yes"): build design 11's party slots that open in place into design 18's battle card, with working status chips and a separate pending box, on PokéNav and the stats page.
- RED: comparePatchResults takes `trialsPerArm` and bounds the tolerance by it; schema rejects ungradeable criteria; `done` needs a written result (otherwise `held`, "running the queue grades it"); the runner grades an all-finished experiment without launching; the `--once` test seeds seven outcomes in one pass.
- GREEN for r3: `deriveStatus` takes `graded`; all outcomes without result.json is `held` ("running the queue grades it") and the runner grades it without launching; result.json is written to a temp file and renamed; comparePatchResults takes `trialsPerArm` (problems and limitations use it; tolerance ≤ trialsPerArm); the experiment schema bounds speedMarginPercent to (0, 100] and completionTolerance to ≤ trialsPerArm; the lease is released even if ledger loading or log directory creation throws; the `--once` test seeds seven finished trials directly.
- 8 per arm: seeds now `trialsPerArm: 8`, budget 16 × 30 min; pokebench-patch-evaluation and experiment-queue skills say eight per arm; explainer updated. Readiness window stays 4 runs.
- Gates: agent 961 (97.26/93.52/98.01), viewer 522 (95.36/90.45/94.65), lint clean.

## Review r4 (frozen head cf71ec3; packet /tmp/eq-review-r4)
- Claude CLI: LGTM. Hardening taken: grading a finished experiment should not need a launch-ready build, model discovery or the lease; grading must refuse a definition whose hash no longer matches the approval; the budget had no slack over 16 × the wall cap.
- Grok: LGTM. Hardening taken: `graded` should be a real file, not mere existence; explainer status was stale.
- Codex: BLOCKING: a result.json holding only a grading problem (`result: null`) still counted as graded, so the experiment closed as done.
- RED: an experiment stays open (held) until result.json holds a non-null result; the runner grades without a launch, lease, source check or discovery; finished trials under a changed definition are stale, not graded.
- GREEN for r4: `done` needs result.json to be a file holding a non-null comparison result (`gradedResult`); a finished experiment under a definition whose hash no longer matches is `stale`; grading a fully finished experiment skips source checks, discovery and the lease and holds with "grading failed: …" until it succeeds; budgets are 17 × the wall cap (one trial of slack).
- M3 built: `packages/viewer/src/queue-view.ts` (typed payload check, collapsed party slots with ABBA pips, A/B HP bars and median turns; click opens the battle card in place; status chips filter; separate PENDING box; DONE section), `GET /api/experiments` (5 s snapshot cache; experiments/ and docs/experiments/readiness.md beside runsRoot by default), ★ EXPERIMENT QUEUE page in PokéNav, EXPERIMENT QUEUE and PENDING EXPERIMENTS sections on Runs & Comparisons (above the existing EXECUTION QUEUE), CSS in style.css.
- Surprise: the first /api/experiments call took ~14 s because run logs are 14–83 MB (raw RAM archive) and summarize() validates every line. `scanRun` parses only the run_start, milestone and final lines (tested equal to summarize on the fixture); cold snapshot now ~0.4 s.
- Deviation: M3's tests (queue-view.test.ts, server-experiments.test.ts, scanRun) were written right after the code in this commit, not as a separate RED commit.
- Browser check on a read-only preview (127.0.0.1:8797, real runs/, scratch ledger dir): PokéNav ★ EXPERIMENT QUEUE shows 3 draft slots and 3 pending cards; clicking a slot opens its battle card; PENDING and DRAFT chips filter (0/3 and 3/0 slots/cards); Runs & Comparisons shows both sections.
- Gates: agent 961, viewer 532 (95.09/90.41/94.39), lint clean.

## Review r5 (frozen head 857fe8b; packet /tmp/eq-review-r5)
- Claude CLI: LGTM. Grok: LGTM (hardening: fuller payload check, `<div>` inside `<button>`, comment wording).
- Codex: BLOCKING: (1) the grading-failure and changed-definition tests ran 16 fake trials to reach a finished state; (2) DONE cards show no verdict or recommendation; (3) BLOCKED has no chip; (4) the browser payload check skips fields the renderer uses (readiness considered/basis/milestone/minReached, recorded, notes, runner); (5) Runs & Comparisons does not assign experiment trials to an experiment cohort; (6) the browser check had no retained screenshots or keyboard/poll/failure coverage.
- Operator (2026-10-14 21:18): "if the review passes u can merge".
- RED: verdict/recommendation in store and card; BLOCKED chip; full payload validation; experiment ledgers assign `experiment:<id>` cohorts and list unfinished trials in the workbench; the two runner tests seed finished trials in one pass.
- GREEN for r5: (1) the two runner tests seed 16 finished trials and their ledger in one pass; (2) the store exposes `result` {verdict, recommendation, eligible, problems} from result.json and the battle card shows "VERDICT → RECOMMENDATION (not eligible: …)"; (3) BLOCKED chip and filter; (4) the payload check covers readiness basis/milestone/minReached/considered, recorded, notes, result and runner; (5) `workbench-store` reads runs/experiments/*/trials.jsonl: every launched run joins cohort `experiment:<id>`, launcher errors are excluded with their message, and launches with no outcome are listed (running if the runner is on them, else withheld); (6) viewer-e2e on the owned preview: receipts and screenshots in runs/experiment-queue-e2e/ (pointer and keyboard open/close, focus kept across 5 polls, server down → "Failed to fetch" with the last snapshot kept, restart → recovery, Runs & Comparisons slot/filters). The e2e check found that re-rendering dropped keyboard focus; `QueuePanel.render` now restores focus to the same control (tested). Grok hardening: `<span>` for the HP bars inside the slot button.
- Gates: agent 961 (97.24/93.50/98.01), viewer 534 (95.05/90.38/94.33), Python 1847, lint clean.

## Review r6 (frozen head b63b982; packet /tmp/eq-review-r6)
- Claude CLI: BLOCKING: `seedFinished` wrote 16 trials for a 4-per-arm fixture, and grading scored every outcome row regardless of trial index.
- Grok: BLOCKING: the stale-definition test wrote run logs it never reads.
- Codex: BLOCKING: (1) a partial result.json (`{result:{}}`) closed an experiment; (2) ledger ingestion in the workbench was not all-or-nothing and let outcome-only rows assign cohorts; (3) a blocked pending experiment had no chip and was hidden by the BLOCKED filter; (4) fixture per-row I/O (same as Claude/Grok); (5) cohort ingestion was quadratic (`entries.some` per launch); (6) the payload check accepted unknown states, trial states, verdicts and recommendations; (7) the browser receipt named an uncommitted tree, not a frozen head.
- RED: fixture follows the definition's trial order and the stale test writes no run logs; grading takes the latest outcome per trial index the definition has; strict result validation keeps a partial result `held`; blocked pending entries are counted and filtered; enum validation; all-or-nothing, launched-only, single-pass ledger ingestion.
- GREEN for r6: result.json counts only when it holds a full comparePatchResults report (known verdict and recommendation, boolean eligible, string problems, both arm results); grading keeps the latest outcome per trial index the definition has (map, single pass); workbench ledger ingestion is single pass and all or nothing (any unreadable row or an outcome/launcher error without its launch rejects the ledger with a problem), and only launched runs join the cohort; BLOCKED counts and filters pending entries too; the payload check rejects unknown experiment states, trial states, verdicts and recommendations; the runner fixture follows the definition's trial order and the stale test writes no run logs.
