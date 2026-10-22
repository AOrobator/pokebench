# Turn-based milestone drought clock (turn-drought-clock-v1)

Operator request: The operator, 2026-10-22 (relayed by the coordinator thread). The milestone-drought nudge is useful but wall-clock based (`STALL_DROUGHT_MS=5*60_000`): on slow GLM that is a nudge every 5-8 actions while Qwen gets about 28 actions per 5 minutes (measured: Qwen 25-30 actions/5 min across 8 recent 2h runs, GLM 5-8). Its text "What you have been trying is not working" is false during deliberate heal-and-grind; the model pushed back 7-13 times per run. Decision: make it turn based, ON in the bundle. Single milestone; reviews and landing are done by the coordinator.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, pokebench-game-state (wording), close-the-loop.

## Architecture

- `stall-briefing.ts` `StallBriefing`: with `turn-drought-clock-v1` ON (and positive-supervisor-v1 OFF, whose retired path is unchanged) the drought level is `floor(actions / STALL_DROUGHT_ACTIONS)` (30), where actions counts tool results since the clock last restarted.
- The clock restarts on a new story milestone (as before), a hold that ends after keeping a due briefing back (as before), and with ON on observed state: a party member's level going up (same identity, higher level), a trainer battle won (a trainer seen not defeated, then shown defeated), and the party reaching full HP after being below full.
- With ON the drought briefing is sent even when milestone-drought-suppression-v1 is ON; its text is a factual `action_drought` stall (`loop-supervisor.ts` `stallText`). Held-drought (drought-battle-heal-hold-v1) diagnostics use action wording; story-character gate holds are unchanged.
- OFF: wall clock, text, evidence and events byte-identical.

## Invariants

- INV-1 OFF parity (same timing, text, events).
- INV-2 ON level counts tool results only; walking and failed actions do not restart it.
- INV-3 ON resets only on observed game state (milestone, level, trainer defeated flag, party HP).
- INV-4 ON overrides milestone-drought-suppression-v1; positive-supervisor-v1 retired path unchanged.

## Milestones

**M1 — turn-drought-clock-v1**
- First series (6ab9d726d RED, a49eb1fdf merge, 0b3a830e4 GREEN, e7afe2fd2 pin, 51718d2c8 gates) was cut before Codex's frontier-mistake-plan landed 11 switches on main (4b3a9e37a); merging main conflicted in ~80 files, so the coordinator asked for the change to be re-applied on top of main. The old head stays reachable as 51718d2c8.
- [x] RED tests (packages/agent/src/turn-drought-clock.test.ts), re-picked onto 4b3a9e37a as 43789bf63: 13 failing / 4 passing
- [x] GREEN implementation + registry (appended after rejected-movement-prefix-v1, the current tail, so after every frontier switch) / presets / defaults / LEGACY_ALL_ON / recipes (bundle arms keep every frontier switch, this one appended last) / explainer / pending experiment / readiness entry. Agent test registry tail indexes shifted by exactly one; experiment-incumbent exclusion lists gained the id; story-progress-clock and drought-battle-heal-hold ALL_ON fixtures pin it OFF; viewer recipe-index tests (rejected-movement-prefix-bundle, open-goal-prompt) account for the new last bundle switch. The workbench-offthread fixture bump from the first series is no longer needed on this main.
- [x] Wiring deletion red/green check: `turnClock()` forced to false gave 13 failed / 5 passed in turn-drought-clock.test.ts (production `stallBriefing` factory); restored 18 passed
- [x] Gates before the GREEN commit: `just lint` 0; `just build` 0; `just coverage` 0: agent 4749 tests (97.30 stmts / 93.31 branches / 97.79 funcs / 99.20 lines), viewer 1784 (95.47 / 91.44 / 94.44 / 97.97), Python 3975 passed (lines 97.40 / branches 93.46 / functions 100, floor 90); `just verify-vendor` OK. `just experiments-check` reports no definition problems; it exits 1 only on runs/.../starter-decision-salience trials.jsonl 'not a ledger entry' lines, as main's checkout does.
- [x] COMMIT GREEN: `feat(agent): turn-drought-clock-v1 counts the milestone drought in actions` (d9b4bc7e8)
- [x] Pin the pending experiment's source to the GREEN commit (1fc816088)
- [x] `just test` at 1fc816088: 0 (agent 4749, viewer 1784, Python 3975); `just pages-check` on the explainer prints nothing
- [ ] Multi-model review and landing (coordinator)

## Session Log

## Surprises

- Main's docs/explainers/README.md no longer lists rejected-movement-prefix-v1 (the line from 8d09b78f1 is gone at 4b3a9e37a); left as is, out of scope.

## Multi-Model Review Log

(Coordinator runs reviews.)

### Round 1 (packet 632089f43..4f6398968; coordinator merged docs-only main 632089f43 as 4f6398968)

Claude LGTM; GPT BLOCKING; fallback BLOCKING. Accepted findings:
1. (GPT) The progress-causing result counted toward the next 30, so a nudge came after 29 later actions. Fix: a restart triggered by a state (or by a milestone that arrives between a state and its result) leaves that state's tool result uncounted; 30 later no-progress results are required.
2. (GPT) Unknown party state fabricated progress: (a) level-ups keyed by slot+species when identity is null; fix: no identity, no level-up credit. (b) withHp() dropped unreadable members, so [full, unreadable] read as a full heal; fix: every non-egg member must have identity and readable hp/max_hp, and the hurt and healed party must be the same set of identified members (a hurt member deposited in the PC is not a heal; a whiteout healing the same party is).
3. (GPT) The facts-only note included the next-milestone hint; removed from the action_drought text.
4. (fallback) OFF parity proof: `packages/agent/src/turn-drought-parity.test.ts` runs 8 traces (`packages/agent/test-support/stall-parity.ts`: a synthetic 160-action run with level-ups, a trainer win, heals, a heal warning, a map back-and-forth, a bag-menu dwell, a story milestone and a story character, under plain / suppression / battle-heal hold / story-character gate / positive supervisor / hold+suppression; and recorded run f28d with its own features, plain and with suppression) through the production stallBriefing factory with the real loop guard and supervisor, and compares loop_guard events, stall_gate events and delivered supervisor contexts with `packages/agent/test-support/stall-parity-golden.json.gz`. Golden produced by copying stall-parity.ts into a detached temporary worktree at 632089f43 (`git worktree add --detach .../scratchpad/parity-golden 632089f43`, pnpm install) and running a throwaway vitest file that wrote `JSON.stringify(parityTraces().map(runParity))` gzipped; the worktree was removed afterwards. Golden counts (guards/held/contexts): ordinary 9/0/9, suppression 9/0/3, hold 8/0/7, gate 5/5/5, positive 9/0/1, hold+suppression 8/0/3, f28d 21/0/25, f28d+suppression 21/0/24.

- [x] R1 RED: turn-drought-clock.test.ts 8 failing / 15 passing; turn-drought-parity.test.ts 9 passing on the unchanged code (it is the OFF proof)
- [x] R1 GREEN: stall-briefing.ts restart() leaves the progress-causing result uncounted (skip when a state arrived since the last result); progressed() credits level-ups only to identified members and heals only to the same fully readable, identified party; loop-supervisor.ts droughtFacts drops the hint line; FEATURES copy and explainer say so (pages-theme re-run, pages-check clean). One existing ON test changed with the rule: the battle-hold test now needs 30 actions after the one whose state ended the battle. stall-parity.ts lost a type-only `as FeatureSet` cast for lint after the golden was generated (no runtime effect).
- [x] R1 wiring deletion: `turnClock()` forced to false gave 18 failed / 5 passed in turn-drought-clock.test.ts; restored 23 passed. The parity test stays green either way (it is the OFF proof).
- [x] R1 gates: `just lint` 0; `just build` 0; `just coverage` 0: agent 4763 tests (97.30 stmts / 93.37 branches / 97.79 funcs / 99.20 lines), viewer 1784 (95.47 / 91.44 / 94.44 / 97.97), Python 3975 passed (lines 97.40 / branches 93.46 / functions 100, floor 90); `just verify-vendor` OK
- [x] R1 commits: RED e41854629, GREEN 924b109c7; pending experiment source.commit repinned to 924b109c7ec315479c1478febb5e2b69712cf9ce; `just test` 0 (agent 4763, viewer 1784, Python 3975); experiments-check: no definition problems (exits 1 only on the pre-existing starter-decision-salience runs ledger lines)

## Archive Milestone (user-gated)
- [ ] ASK USER: archive
