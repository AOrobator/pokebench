# Worklog: Test gate speed

Branch `claude/test-gate-speed`, worktree `~/dev/pokebench-worktrees/test-gate-speed`, base `main` at `511a6f95c`.
Requested by the operator through the project coordinator on 2026-10-27 (approved). Landing waits until `claude/type-gap-team` lands on `main`; then rebase, rerun the gate and land fast-forward through the land board.

## Problem Statement

Two kinds of cost hit every landing:

1. **Switch-registry tests pin whole lists.** Registering one switch the way `.claude/skills/feature-switch/SKILL.md` says breaks tests that never mention it, because they restate the full server off-list, the per-group counts, the "last N switches" slice or the Python default-off set. A production-only registration of a dummy switch fails 79 agent test files (96 tests), 2 viewer files (3 tests) and 1 Python test. After the skill's legacy-fixture edit, 13 agent files (30 tests) still need hand edits; `claude/type-gap-team` touched exactly those files to add one switch.
2. **The gate runs every suite twice.** `just test` ran vitest and pytest, then `just coverage` ran the same ~10,900 tests again with instrumentation.

Prior work: the 2026-10-24 landing-pipeline audits (`runs/reports/run-analysis/2026-10-24_landing-pipeline/` and `..._landing-pipeline-deep/`) recommended both changes ("make the registry tests ignore order", "remove registry tests that break on unrelated appended switches", "one validation receipt per exact input set"). They were analysis only; nothing was implemented, so this worklog does not duplicate them.

## Skills Loaded

- `feature-worklog`, `execute-worklog` (gates, review, landing), `feature-switch` (registration checklist), `close-the-loop`, `talk-to-codex` (land board).

## Architecture

**Registry tests.** `SWITCHABLE_FEATURES`, `FEATURES`, `SERVER_FEATURES` and `playHarnessFeatures` are append-only. Tests now pin:

- per-switch facts by absolute index (`SWITCHABLE_FEATURES.at(n)`, `SERVER_FEATURES.at(n)`), which appends never move;
- a switch's server off-list effect as a delta, `serverOff(changed)` equals `serverOffWith(base,{off:[ID]})` (`packages/agent/test-support/server-features.ts`). The helper throws when a named id is not a server switch or is already in that state, so an assertion cannot pass by filtering its own switch away;
- the full off-list and per-group counts once, restricted to the switches registered when the legacy fixture froze (`map-observability-v1`, 276 switches, 92 server switches);
- registry invariants: unique `SWITCHABLE_FEATURES`, `MEASUREMENT_FEATURES` and `SERVER_FEATURES`; `SERVER_FEATURES` ⊆ switches; every feature has a known group, a title and a registered `needs`, and every switch an ` Off: ` clause; TS and Python server lists are equal; `experiments/feature-configs/current.json` names only registered switches, each in one role, with `features` agreeing with `onInBoth`/`offInBoth`.

`legacy-features.ts` turns every switch registered after the freeze OFF in `LEGACY_ALL_ON` and `BATCH_DEFAULTS_OFF` (the file's existing rule, "new treatments stay OFF in legacy behavior tests", now automatic), so `withoutFrontierTreatments(...).at(-N)` pins stay put.

**Gate.** `just test` is the single coverage-instrumented pass: `pnpm -r coverage` (vitest v8 thresholds 90), `pytest --cov --cov-branch` with the JSON report, `pokebench_gates.coverage_gate --min 90`, then the protected `just trainer-card-check` line, unchanged. `just coverage: test` is an alias, so `just test coverage` or `just coverage` alone run the suites once.

## Invariants

- **INV-1** Every assertion a converted test made about its own switch still fails when that switch is removed, renamed or not sent. Test: mutation run below.
- **INV-2** Registering a valid switch needs no edits to other switches' tests. Test: the dummy switch rehearsal below.
- **INV-3** An invalid registry still fails: duplicate id, missing `FEATURES` entry, missing ` Off: `, empty title, unknown `needs`, a removed switch, a frozen switch regrouped, TS/Python drift, a changed frozen default-off set, a bad feature config. Test: mutation run below.
- **INV-4** The gate still runs every test and enforces the 90% floor for lines, branches and functions in both stacks; the trainer-card guard line is untouched. Test: `env/tests/tooling/test_gate_wiring.py`, `scripts/test_trainer_card_design_guard.py`.

## Security Review

Test and build wiring only. No new subprocesses, inputs or network. The trainer-card guard still sees `just trainer-card-check` in `test` and an unchanged `trainer-card-check` recipe, so no approval receipt is needed.

## Milestones

**M1 — Registry tests pin membership and invariants**
- [x] RED evidence: `scratchpad/add_dummy_switch.py` registers `zz-dummy-switch-v1` (skill steps 1–4, production files only). On `main`: agent 79 files / 96 tests failed, viewer 2 files / 3 tests, pytest 1. With the skill's legacy-fixture edit added: agent 13 files / 30 tests (adjacent-tiles, battle-effective-damage, battle-message-waiting, battle-triage, decision-probe, explorer-guidance, explorer-guidance-v2, features ×17, levelup-box, offscreen-objects, readout-rules, readout-truth, transition-coherence).
- [x] Convert the 13 files, the viewer `slice(-3)` pin, the Python default-off set and count, and derive later switches in `legacy-features.ts`; add `server-features.ts`, the helper-guard test and `feature-config-registry.test.ts`.
- [x] GREEN at HEAD: agent 317 files / 4479 tests, viewer 152 / 2039, pytest 4425.
- [x] GREEN with the dummy switch and no test edits: agent 317 files, viewer 152, pytest 4425, all passing.
- [x] Mutations (on top of the dummy), each RED: duplicate switch id; duplicate server id; switch with no `FEATURES` entry; description without ` Off: `; empty title; `needs` an unregistered switch; server switch removed (`adjacent-tiles-v1`); switch removed from the registry (`readout-truth-v1`); frozen switch regrouped (`ledge-hops-v1`); Python server list drifts from TS; Python default-off loses a frozen switch; gains a frozen switch; Python server list duplicates a switch; feature config names an unregistered switch; feature config puts a switch in two roles.
- [x] Feature-switch skill step 6 updated.
- [x] COMMIT: `test: pin switch-registry membership and invariants, not whole lists` (ad554d8fa)

**M2 — One coverage-instrumented pass**
- [x] COMMIT (RED): `test: RED gate wiring for one coverage-instrumented pass` (3cb3f609a)
- [x] RED: new wiring tests against the old justfile: 3 failed (`test_test_recipe_is_exactly_the_gated_pipeline`, `test_coverage_names_the_same_single_pass`, `test_python_gate_reads_the_report_pytest_writes`).
- [x] GREEN: justfile changed; wiring and trainer-card guard tests 7 passed.
- [x] Docs: CLAUDE.md commands, execute-worklog and feature-worklog gates, close-the-loop table.
- [x] Timed A/B (below): 252 s → 154 s mean
- [x] COMMIT (GREEN): `build: just test runs every suite once with the coverage gate` (b8efbc6db)

**M3 — Gate, review, land**
- [x] Full gate on the branch: `just test` (in the A/B), `just lint`, `just build`, `just verify-vendor` all exit 0
- [x] Principles self-review (PB1–PB13): 0 FAIL
- [x] Claude lane, GPT lane (Codex CLI), fallback reviewer (Grok down; blanket "land without grok" waiver): all LGTM in round 3 at 689636fb1
- [x] Rebase onto main, rerun gate, land ff-only via `just land-join` / `just land-done` (landing order changed: no wait for type-gap-team)

## Gate timings

Same worktree, alternating arms, while other sessions shared the Mac (1-minute load 12–24). Old = `pnpm -r test`, `pytest -q`, `just trainer-card-check`, then `pnpm -r coverage`, `pytest --cov`, `coverage_gate` (main's `just test` then `just coverage`). New = this branch's `just test`. All four exited 0.

| Arm | Round | Seconds | 1-min load before |
|---|---|---|---|
| old | 1 | 260 | 21.2 |
| new | 1 | 162 | 24.4 |
| old | 2 | 243 | 24.3 |
| new | 2 | 146 | 12.1 |

Mean 252 s → 154 s: about 98 s (39%) less per gate pass. Earlier single baseline on main under similar load: `just test` 137 s, `just coverage` 131 s. New pass counts: vitest agent 317 files / 4479 tests, viewer 152 / 2039, pytest 4426, trainer-card Playwright 3; coverage floor met in both stacks.

## Closing the Loop

Gate wiring is proven by the wiring tests and the timed runs of the real recipes; the registry change by the dummy-switch rehearsal and the mutation run.

## Session Log

- 2026-10-27: worktree from `main` `511a6f95c`. A fresh worktree needs `pnpm -r build` (agent `dist`), the mgba package copied into `env/.venv`, `.env` linked and `runs/sprites/trainer-card-v1` linked read-only for `trainer-card-check`.

## Surprises

- `pnpm -r test` stops at the first failing package, so RED counts for the viewer came from a separate `vitest run`.
- Viewer tests import the agent's built `dist`; a stale build from the dummy rehearsal made a viewer test fail until rebuilt.

## Multi-Model Review Log

**Round 1** — packet `511a6f95c..b8efbc6db`, diff SHA-256 `de4caa7caf7b5e509f9f8918b4f198795d52c8a75f65f3ce7b7e1a103be6d7bd`. Principles self-review: 0 FAIL.
- Claude lane (`claude -p --permission-mode plan`, `~/.claude-review`): VERDICT: LGTM. Non-blocking: record the GREEN SHA; " Off:" applies to switches only; justfile comment wording; viewer 273–276 literals; Set instead of a registry scan.
- GPT lane (Codex CLI `-m gpt-5.6-sol`, read-only): VERDICT: BLOCKING. One finding: the helper-guard test recomputes `serverOff(ALL_ON)` inside a filter and new invariant loops scan arrays, superlinear in the registry. Confirmed conversions are not tautological, legacy fixtures unchanged, the Python pin catches frozen drift, and every justfile spelling resolves to one pass.
- Fallback lane (Grok out; standing "land without grok" waiver): fresh read-only Sonnet subagent: VERDICT: LGTM.
- Fix batch: cache the base off-list and use Sets in the new `features.test.ts` invariants; record the SHA; clarify the comment and worklog wording; derive the viewer slice from `FROZEN_SWITCH_COUNT`.
- COMMIT: `test: address round-1 review of the registry pins and gate` (cbfdae24f); `just test` at that head exit 0 in 154 s (agent 4479, viewer 2039, pytest 4426, Playwright 3); `just lint` exit 0.

**Round 2** — packet `511a6f95c..cbfdae24f`, SHA-256 `4f990429ad901d7a18c8da3d1073d2b859d336cee28bce3e407850eff5aa8b2b`.
- GPT lane: VERDICT: LGTM.
- Fallback lane: VERDICT: LGTM.
- Claude lane: VERDICT: BLOCKING. B1: `feature-config-registry.test.ts` used `toContain` on a Set, which vitest copies into an array per call (config × registry). Hardening: pin `FROZEN_SWITCH_COUNT === 276`; record a gate at the fixed head.
- Fix batch: `.has()` filters in the feature-config test; `FROZEN_SWITCH_COUNT` pinned to 276. Both feature-config mutations re-run RED, then GREEN restored.

- COMMIT: `test: address round-2 review of the feature-config invariants` (689636fb1); `just test` exit 0 in 151 s (agent 4479, viewer 2039, pytest 4426, Playwright 3); `just lint` exit 0.

**Round 3** — packet `511a6f95c..689636fb1`, SHA-256 `f713e617c6a29d2bbc6c2ba5603c43b56b3d951b7d100286d64bfda622ecffdc`.
- Claude lane: VERDICT: LGTM. GPT lane: VERDICT: LGTM. Fallback lane: VERDICT: LGTM.
- Landing order changed (coordinator relay, 2026-10-27 3:39 PM New York): the first ready branch lands; no wait for `claude/type-gap-team`.
- Rebased onto `main` `72257830d`, which only touched vLLM endpoint files. `git diff --binary main 7e5eac31f` has SHA-256 `f713e617c6a29d2bbc6c2ba5603c43b56b3d951b7d100286d64bfda622ecffdc`, identical to the round-3 packet, so no new review round.
- Gate on the rebased head: `just test` exit 0 in 153 s (agent 318 files / 4540 tests, viewer 152 / 2039, pytest 4426, Playwright 3, coverage floor met); `just lint`, `just build`, `just verify-vendor` exit 0.
- `just land-join` gave slot 1 at 3:44 PM; main unchanged at `72257830d`; landed with `git merge --ff-only` to this evidence commit.

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER
