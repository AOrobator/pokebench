# same-target-no-progress-v1: repeated navigate_to to one target that keeps ending near where it began

## Problem Statement

Control run `runs/2026-10-20T16-14-34_qwen36-gpu0_a8f9` (read-only, still being written). From turn 1282 (tool_call seq 41089, 6:42 PM New York) the model called navigate_to {x:29,y:16,map_id:[24,4]} 39 times in RUSTURF TUNNEL, then {x:18,y:20} 12+ times from turn 1341. Every call ended on one of (4,7) (4,8) (4,9) (5,7) (5,8) (5,9). 18 of about 51 walks were interrupted by a wild battle (then battle_action, then navigate_to again). No loop guard fired:

- ineffective-loops-v1 needs alternating targets ending on at most 2 tiles and resets on battles;
- the deterministic loop guard's same-target check needs no movement;
- ineffective-navigation-v2 (`navigation-failure.ts`) counts only walks ending on the start tile and resets on any battle;
- duplicate-turn-collapse-v1 needs identical turns.

Only the 5-minute milestone-drought stall briefing fired (turns 1309 and 1340).

Operator approval: the coordinator relayed that the operator approved this guard on 2026-10-20 (switch `same-target-no-progress-v1`, guard, bundle arm only, default off).

## Skills Loaded

- feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue (pending entry), close-the-loop (gates), multi-model-review (cloud lanes only).

## Architecture

- New counter `packages/agent/src/loop/same-target.ts` (`SameTargetNoProgress`), owned by `LoopCoordinator` like `NavigationFailure` is. It reads only completed calls and recorded state events.
- Target key = (map_id, x, y): navigate_to args; navigate_to_target warp/interaction tile, or an object's tile from the start state's `world_context.objects`. Connections have no tile and are not tracked.
- Episode per target, on the current map. Anchor = the player's tile when the first call began (`startState`).
- A call counts when it is not an error and ends on that map with field controls free, in a battle, or with field controls locked, at most 3 tiles (Manhattan) from the anchor. A battle state's position is the tile the battle started on.
- Kept across: battles, battle_action, presses, evolution/level-up screens, observes, calls to other targets.
- Reset all: map change (state map_id), a counted story milestone event, a story-state change (known `story` values), the target reached (navigate_to: on the tile; navigate_to_target: within 1 tile). Reset that target: a counted-shaped call ending 4 or more tiles from its anchor.
- On the 4th counted call for a target (then the 8th, 12th, ...) the coordinator opens (or rebriefs) a loop episode of kind `same_target_no_progress`. With loop-guard-supervisor-v1 the briefing is the factual note itself (it replaces the generic supervisor text); without it the generic `LOOP GUARD (...)` wrapper carries it. The episode is shielded from the generic novel-state recovery and from the 6-call window stop; it closes only on the resets above, or when a completed call leaves the player in a free field 4 or more tiles from the warned target's anchor (so an open note cannot go stale after the model walks away by presses).
- Events: `loop_guard` with kind `same_target_no_progress` (schema enum extended), evidence = first counted result seq and the current result seq. Viewer: Activity History and the raw inspector show it; `RunView` does not push it to `errors`, so the closed TIMELINE draws nothing new.

## Invariants

- INV-1 OFF is byte-identical: no counter is constructed, no new notice, the same context text. Test: a8f9 replay OFF produces no notices; existing loop tests unchanged.
- INV-2 Deterministic from recorded state only; never model text. Test: unit cases built from CompletedCall/state shapes only.
- INV-3 Every clause of the note is checked against the state. Test: evidence test asserts the a8f9 note text exactly.
- INV-4 Timeline closed: no new mark, lane, label or color. Test: viewer lanes SVG for a run with this kind has no mark for it; Activity History row present.

## Security Review

No new inputs, subprocesses, network or file access. Model-facing text quotes harness-authored result lines and recorded state only.

## Milestones

**M1 — same-target-no-progress-v1**
- [x] Write tests (unit counter cases; a8f9 evidence replay; registry; production wiring; viewer timeline/Activity History). Agent: `src/same-target-no-progress.test.ts` (18 tests; red: `./loop/same-target.js` and `playLoopGuard` do not exist). Viewer: `src/same-target-no-progress.test.ts` (1 test; red: the schema has no `same_target_no_progress` kind and the viewer has no label).
- [x] COMMIT: `test: same-target-no-progress-v1 counter, coordinator episode and a8f9 replay (RED)` (ba17f7bf)
- [x] Implement: `loop/same-target.ts` (counter + note); `LoopCoordinator` option `sameTargetNoProgress` (episode kind `same_target_no_progress`, shielded from generic recovery and the window stop, closed on the counter's resets, rebriefed every 4th counted call); `LoopDetector`/`attachLoopGuard` take it as the last positional argument; live.ts and decision-probe.ts pass `features["same-target-no-progress-v1"]`. Schema enum extended (`just schema`). Viewer: label in `loopLabel` and the trace; `RunView` does not push this kind to `errors` (the timeline's only loop source), so no timeline mark. Registry: SWITCHABLE_FEATURES/FEATURES/playHarnessFeatures last, guard, needs deterministic-loop-guard-v1; presets, flagFeatures, legacy fixture, DEFAULT_NEXT_RUN off. Registry index churn across ~45 agent tests and one viewer test (open-goal-prompt bundle arm list).
- [x] Guard-deletion checks (each restored, tests green again): (1) coordinator `this.sameTargetWarning(...)` replaced by `void same;` → 6 red (coordinator episode tests, a8f9 evidence, production wiring); (2) live.ts without the new argument → the source test red; (3) the generic-recovery shield (`this.episode?.sameTarget == null`) removed → 2 red, including the a8f9 evidence test (the generic novel-state recovery would have closed the note right away); (4) viewer `RunView` errors filter removed → the viewer timeline test red.
- [x] Gates: `just build`, `just lint` clean; `just test` agent 2998, viewer 1437, pytest 2998; `just coverage` agent 97.22/92.97/97.62/99.17 (stmts/branches/funcs/lines; `loop/same-target.ts` 99.09/94.28/100/100), viewer 95.09/91.06/93.85/97.7, Python lines 97.09 branches 92.62 functions 100. Worktree setup for the Python gates: the vendor submodule was not checked out in this worktree, so its pinned files were copied from the main checkout's submodule (rsync without `.git`, gitlink unchanged), and the native mGBA binding was copied from the main env/.venv into this worktree's env/.venv (mypy needs `mgba._pylib`). No Python source changed on this branch.
- [x] COMMIT: `feat: same-target-no-progress-v1 warns once 4 navigate_to calls to one target end within 3 tiles of where the first began (default off, bundle arm)` (3dd8b702)
- [x] Explainer `docs/explainers/same-target-no-progress-v1.html` (`just pages-check` prints nothing), README line, FEATURE_EXPLAINERS + server test; pending `experiments/same-target-no-progress-v1.json` (incumbent copied from whiteout-healed-v1's, this switch off); readiness row (PENDING until `just experiments` runs after landing: the experiment CLI reads the main checkout); bundle arm (switches) of bundle-v-control and bundle-cook-1h, off in their base.
- [ ] Multi-model review loop (principles, claude -p, Grok, GPT/Codex)

## Closing the Loop

Tests for code; the explainer checked with `just pages-check`; viewer behavior by mounted tests. No runs launched (operator rule: long runs only, operator launches).

## Session Log

- 2026-10-20 ~7:05 PM ET: discovery; fixture `packages/agent/src/fixtures/same-target-a8f9.jsonl.gz` made from a8f9 seq 41060–43000 plus run_start.

## Surprises

- The generic novel-state recovery closes any episode when a walk ends on a new tile, so without a shield the note would be withdrawn at the next call (deletion check 3). The episode is therefore owned by the guard's resets.
- While the note is open, other loop rules cannot open an episode and `stall()` refuses stall briefings (existing coordinator rule: one episode at a time). In the a8f9 replay the milestone-drought note at turn 1309 would not have been sent with the switch on.
- Design choice beyond the spec: an open note also closes when a completed call leaves the player in a free field 4 or more tiles from its anchor (otherwise a note could outlive a walk away by presses until a map change).

## Multi-Model Review Log

Local inference reviewers are never used (operator decision 2026-10-16). Packet files are in the worktree's ignored `runs/reviews/same-target-no-progress/`.

**Round 1** — packet1 = `git diff main HEAD`, base ba71c60f, head b8990732, sha256 441dc4c5…9ae2a4. Principles self-review: 0 FAIL.
- Claude lane: `claude -p` failed ("OAuth session expired and could not be refreshed"; `~/.claude-review` also logged out); Cursor `claude-opus-5-thinking-high` and `claude-sonnet-5-thinking-high` hit the Cursor usage limit. Ran as a fresh read-only Claude (Opus) subagent per the operator's 2026-10-16 word. VERDICT: BLOCKING — B1: three close paths (target reached, displacement, walk-away) untested at the coordinator; deleting the `same?.cleared` recover line left every test green. HF: card/explainer should say an open note blocks other loop notes and stall briefings; a dropped warning leaves no record. SPEC: the tool list could name an uncounted tool.
- Grok lane (Cursor `cursor-grok-4.5-high`): VERDICT: LGTM (HF: `counted` grows until a reset; no blockers).
- GPT lane: Cursor `gpt-5.6-sol-xhigh` hit the usage limit; switched to isolated Codex CLI (`codex exec --sandbox read-only`; the config model `gpt-6.1-sol` is rejected for a ChatGPT account, so `-m gpt-5.6-sol`, reasoning xhigh). VERDICT: BLOCKING — B1 object targets resolved only from `world_context.objects` while production resolves from `interaction_targets`; B2 a warning while another episode is open is silently dropped; B3 activation milestone too late (STARTER_CHOSEN; the guard needs no battle).

Fix batch 1:
- Claude B1 accepted: coordinator test for the three close paths; deletion check: replacing the `same?.cleared` recover line turns it red; restored.
- Codex B1 accepted: object tile from `interaction_targets` first (the production resolver's listing), then `world_context.objects`; test with only `interaction_targets`.
- Codex B2 partly accepted: one episode at a time is the existing coordinator rule and changing it would change other guards (a boundary split trigger), so it stays; the dropped warning is now recorded as a diagnostic `would_warn` loop_guard ("Not sent (another loop episode is open): …"), never sent to the model. Deletion check: disabling that record turns the collision test red; restored. Card and explainer now say both directions (Claude HF).
- Codex B3 accepted: activation PLAYER_NAME_CONFIRMED (experiment entry, readiness row, test).
- Claude SPEC accepted: the tool list names only tools with counted calls.
- Own finding: a walk to the warned target ending 4+ tiles away was cleared by the walk-away rule and then anchored a new episode itself, unlike the unwarned path. Now the walk-away rule applies only to other calls, and the reset walk does not anchor. Test added.

**Round 2**: the fix delta was fix1.diff (`git diff b8990732 4b403ced`, sha256 920fb648…7945a2). The cumulative packet was packet2 (`git diff main HEAD`, base main 724d9ddd, head 1d7a72dc, sha256 94fa0c91…266ff1).
- Claude lane (a fresh read-only Claude Opus subagent; the CLI and Cursor Claude are still unavailable): VERDICT: LGTM. Two HF notes. First, the loop-recovery CLI counts held would_warn records as interventions, which is the existing positive-supervisor convention. Second, the world_context fallback can count an object call that production could not resolve. One SPEC note: whole-map-pair v5 does not name the switch.
- Grok lane (Cursor `cursor-grok-4.5-high`): VERDICT: LGTM. Two HF notes: the held records are not checked through `checkEvent`, and the explainer table's wording that a walk-away "starts over" is loose.
- GPT lane (Codex CLI, `-m gpt-5.6-sol`, xhigh): VERDICT: BLOCKING, on two points:
  - B1: held warnings are not proven schema-valid through `attachLoopGuard → recordLoopGuard → checkEvent`.
  - B2: there are no deletion receipts for the interaction_targets lookup or for the anti-reanchoring guard.

Fix batch 2 (evidence only, no production change):
- New test "records a held warning as a schema-valid diagnostic loop_guard event through the production recorder path". It goes through attachLoopGuard, runs each recorder body through `checkEvent`, and checks that the open episode's context is unchanged.
- Deletion receipts. Each change below was restored afterwards and the file went green again (24/24):
  - r2-a: disabling the held `notify` turns 2 tests red (the coordinator collision test and the production recorder test).
  - r2-b: removing the interaction_targets lookup turns the navigate_to_target keying test red.
  - r2-c: reverting the anti-reanchoring guard to an unconditional `stale()` turns the reset-walk test red.
- Round 3 has not been run. The review skill and the operator's rule both say to ask the operator to confirm scope after two complete rounds that each raised new blockers. Current status:
  - Claude: LGTM (round 2).
  - Grok: LGTM (round 2).
  - GPT/Codex: BLOCKING (round 2). Its findings were evidence-only and are now addressed; a round-3 re-review waits for the operator's confirmation.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog.

### Sync with main (before review)

- main moved to ba71c60f (gym-readiness-readout-v1 and config changes). Merged main into the branch; conflicts were all registry appends and index churn: took main's side of each conflicted file and re-applied this switch after gym-readiness-readout-v1 (registry, presets, legacy fixture, DEFAULT_NEXT_RUN, FEATURE_EXPLAINERS, README, readiness, bundle arm of both fixed experiments), then re-bumped the index assertions the tests reported. Pending entry source.commit set to main ba71c60f (branch base until landing fills the merge SHA).
- After the merge: `just lint` clean; `just test` agent 3009, viewer 1438, pytest 2998.
- After the merge: `just coverage` agent 97.21/92.97/97.57/99.16 (`loop/same-target.ts` 99.09/94.28/100/100), viewer 95.09/91.06/93.85/97.7, Python 97.09/92.62/100.
- COMMIT: `merge: main (gym-readiness-readout-v1) into same-target-no-progress-v1` (b8990732)
- Fix batch 1 gates: `just lint` clean; `just test` agent 3011, viewer 1438, pytest 2998; `just coverage` agent 97.21/93.0/97.57/99.16 (`loop/same-target.ts` 99.1/95.2/100/100), viewer 95.09/91.06/93.85/97.7, Python 97.09/92.62/100.
- COMMIT: `fix: same-target-no-progress-v1 review batch 1 (...)` (4b403ced)
- Merged main 724d9ddd (whole-map pair v5 definition only; it does not name this switch, so it runs OFF there; agent 3011 and viewer 1438 tests pass after the merge).
- COMMIT: `merge: main (whole-map pair v5) into same-target-no-progress-v1` (1d7a72dc)
- COMMIT: `test: same-target-no-progress-v1 held warning through the production recorder path, plus deletion receipts (review batch 2)` (6e2e542d)

## Landing (2026-10-20, 8:25 PM ET)

- The operator 8:07 PM ET: "land it" on Claude and Grok LGTM after the GPT/Codex lane's round-2 evidence-only blockers (6e2e542d answers them; no round 3).
- Merged main 55e105b7 (party-item-confirmation-v1). Conflicts were both-sides switch-list additions; resolved by keeping both, party-item-confirmation-v1 first and this switch last. Position tests that both sides had shifted by one were shifted once more (61 lines). Added the switch to the bundle arm of whole-map-cook-1h (bundle-v-control and bundle-cook-1h already had it).
- Gates after merge: lint, build clean; agent 3013/3013, viewer 1440/1440, pytest 3015 passed. Coverage agent 97.21/92.99/97.57/99.16, viewer 95.08/91.05/93.85/97.7, Python lines 97.11 branches 92.67 functions 100.
