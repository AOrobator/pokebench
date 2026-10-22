# Rejected movement: longest valid prefix (rejected-movement-prefix-v1)

Operator approval: The operator picked option 1 ("lets do 1, coordinate with codex so we get longest valid prefix", 2026-10-22, 1:08 PM New York). Single milestone; Codex coordination recorded below.

## Problem Statement

`navigation-tool-use-guard-v1` refuses free-field direction-only batches of 2+ presses. `rejected-movement-step-v1` replaces that refusal with only the first direction. In run 1fe0 that cut 108 batches (818 requested tiles) to 98 tiles; 53 of them were walks UP into Route 101's south-facing ledges (0x3B) that the model never reached, so it never learned why it stopped. A replay of the 108 recorded pre-press states: Codex's unlanded straight stride (`rejected-movement-stride-v1`) would walk 213 tiles with 24 batches sending nothing; the longest valid prefix walks 331 with 8 sending nothing.

## Skills Loaded

feature-switch, execute-worklog, feature-worklog, talk-to-codex, feature-explainer, experiment-queue, tool-prompt-sync (no tool or prompt change: the guard is silent in the prompt), pokebench-game-state (stop-reason wording), close-the-loop.

## Architecture

- `navigation.ts` `requestedStep(state, direction, options)`: one requested direction checked with the same planner rules `navigate_to` uses (ledge hops only in arrow direction, one-way tiles, floor, elevation rule, slopes, people and objects). Valid when `planNavigation` to the step's landing tile is exactly `[direction]` and the landing is not a matching coordinate trigger. Otherwise returns the stop reason in plain observable terms.
- `game-tools.ts` guard block: with `rejectedMovementPrefix` set, walks the batch one checked ordinary press at a time. Each step re-reads fresh state, re-validates the step, presses without automatic running, then verifies the landing. Stops at the first invalid step, at any interruption (map change, lock, battle, dialogue, unexpected position) or after entering a warp. Returns the last observation with requested/submitted/dropped and the stop reason.
- Precedence: prefix > step. Codex's stride (unlanded) is resolved by whoever lands second: prefix > stride > step.
- Switch `rejected-movement-prefix-v1`, needs `navigation-tool-use-guard-v1`, default OFF. OFF: original rejection or step behavior byte-identical.

## Invariants

- INV-1 OFF parity: guard and step behaviour unchanged when the switch is OFF (test compares results and posts).
- INV-2 No unchecked input: every submitted direction passed `requestedStep` on state read immediately before its press (test: tile changes between steps stop the walk with no further POST).
- INV-3 Never crosses a matching trigger, person or wrong-way ledge (tests per stop kind).
- INV-4 Checked navigation and non-guarded presses unchanged (test).

## Security Review

No new network surface, no subprocess, no file IO. Inputs are model button arrays already schema-validated.

## Milestones

**M1 — Longest valid prefix switch**
- [x] Write tests (prefix through grass and bends, ledge hop in arrow direction, stop before wrong-way ledge / person / matching trigger / wall, zero-step stop, interruption, warp entry ends walk, OFF parity, production wiring, recorded 1fe0 states)
- [x] COMMIT RED: `test(agent): rejected-movement-prefix-v1 walks the longest valid prefix (RED)` (22c9643ab), 19 failing / 0 passing
- [x] Implement + registry/presets/defaults/wiring (features.ts, play-preset.ts, play-config.ts, next-run.ts, FEATURE_EXPLAINERS); 49 test files' registry-tail indexes shifted for the appended switch
- [x] Wiring deletion goes red, restored: deleting the play-config mapping gave 11 failed / 10 passed; restored 21 passed
- [x] Explainer (docs/explainers/rejected-movement-prefix-v1.html, themed, pages-check clean) + FEATURE_EXPLAINERS + panels/server tests + pending experiment + readiness entry
- [x] Gates: `just lint` 0; `just build` 0; `just coverage` 0 — agent 4532 tests (97.36 stmts / 93.29 branches / 97.98 funcs / 99.21 lines), viewer 1692 (95.46 / 91.43 / 94.43 / 97.96), Python 3960 passed, 96% total. Worktree setup: submodule init, main's mgba binding symlinked into env/.venv, .env copied (all untracked/ignored).
- [x] COMMIT GREEN: `feat(agent): rejected-movement-prefix-v1 walks the longest valid prefix of a guarded walking batch` (8d09b78f1)
- [x] Multi-model review: Claude LGTM, GPT (Codex CLI) LGTM, fallback reviewer LGTM in place of Grok (Cursor out of usage; The operator "land without grok")
- [x] Landed: `git merge --ff-only 0cde4c948` on main (merge SHA 0cde4c94880c676f5fd8c719475c34d48ef7ce02); `just test` on main 0 (agent 4571, viewer 1703, Python 3961). Viewer restart and live check follow.

## Closing the Loop

Tests at the press-tool boundary, a pinned-pi delivery test, replay against recorded 1fe0 states, explainer served at 8791 and via Tailscale Reports.

## Session Log

- 2026-10-22 1:31 PM: Codex (frontier mistake mitigations) agreed: independent switch, precedence prefix > stride > step; its stride contract is unchanged and goes to landing first.

- 2026-10-22: Codex told (Map Mistakes to Switches session) via the Codex coordinator; asked about precedence and landing order.

## Surprises

- RED fixture tweak before GREEN: requestedStep's ok result gained `warp`, and the recorded 9355 case stops at the edge of its one recorded local window (live reads re-centre it each step).

- Most of 1fe0's limited presses were not blocked by grass but by south ledges (53/108) and bends (24/108 for the straight stride).

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive

### Round 1 (frozen 540cb4e02..169aafefe, packet SHA-256 3472d6a7976e8fbdf4bd7cfe3392fd97a649e5ce9d29fc57df86ee0be0692be9)

Principles self-review: 0 FAIL (runs/reviews/rejected-movement-prefix/principles.md). Gates on the synced tip: just test 0 (agent 4532, viewer 1699, Python 3961).
- Claude CLI (~/.claude-review, plan mode): VERDICT: LGTM. Follow-ups only (receipt lost if a mid-walk state read throws; no abort/slope tests).
- Grok (cursor-grok-4.5-high) and GPT (cursor gpt-5.6-sol-xhigh): Cursor "You're out of usage" (ActionRequiredError), no review. GPT lane switched to isolated Codex CLI (standing-authorized). Grok lane BLOCKED: Cursor is its only harness; no self-merge without operator decision.

### Round 2 (frozen 540cb4e02..02656a5ea, packet SHA-256 15f1f5b4f87c29ea194f17c300c4ada90fd3512c601bbc776170f65344204521)

- Claude CLI on the round-2 delta (explainer layout fix, worklog): VERDICT: LGTM.
- GPT lane via isolated Codex CLI (gpt-5.6-sol, xhigh; config default gpt-6.1-sol is refused for this ChatGPT account): VERDICT: BLOCKING, two findings, both accepted as Fix:
  1. experiment source.commit pinned the RED commit (no implementation). Repinned to GREEN 8d09b78f1 (has the switch, requestedStep and the entry).
  2. OFF parity asserted only POSTs and a substring. The test now deep-compares the whole result, every request and every hook call against the press tool with no prefix rules, for the rejection and the one-step cut, plus exact-text goldens. Mutation (prefix branch forced on) turns it red; restored green.
  Follow-up (not this branch): receipt lost if a state read throws mid-walk (also noted by Claude).
- Grok (cursor-grok-4.5-high): retried, still "You're out of usage". Lane blocked.

### Sync with main 1990105e8 (auto-talk-field-only-v1, auto-talk-v3, untalked-people-header-v1 landed)

Conflicts only in the registry and its tail-index tests: took main's side, re-appended rejected-movement-prefix-v1 after untalked-people-header-v1, regenerated the experiment's incumbent feature keys, and re-shifted registry tail indexes (guard count 58 -> 59). Gates on the merged tip: just test 0 (agent 4571, viewer 1703, Python 3961); just lint 0; coverage agent 97.38/93.34/97.98/99.21, viewer 95.47/91.43/94.44/97.97 (one experiment-cli git test timed out at 5 s under load average 20 on the first full run; passes alone in 1.7 s and on the rerun), Python 97.39/93.41/100.

### Round 3 (frozen 1990105e8..0cde4c948, packet SHA-256 8d1b9ac8522f759d425fc1e7a6ffc75f46d6d3a22195275054195345193e44bc)

- Claude CLI: VERDICT: LGTM (hardening notes only: shared free-field predicate, redundant direction filter).
- GPT lane, isolated Codex CLI gpt-5.6-sol xhigh: VERDICT: LGTM (follow-ups: receipt across transport errors, a prefix slope test).
- Grok: Cursor "out of usage" again. Lane blocked; asked the operator whether to land without it or wait.
- Fallback reviewer (fresh read-only Claude Sonnet subagent, standing in for Grok): VERDICT: LGTM, verified packet SHA; follow-ups only. The operator 2026-10-22: "land without grok" (standing rule since 10/21: Claude + GPT + a fallback reviewer is approval while Cursor is out).

## M2 — Bundle activation (the operator 2026-10-22 2:38 PM: "yes" to ON in the bundle arm, control unchanged)

Six current bundle recipes (bundle-v-control, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, bundle-v-control-2h, glm53-flash-4h) get rejected-movement-prefix-v1 false in base and appended to the bundle switches, as the potion-guidance enable did. All six already turn navigation-tool-use-guard-v1 on in the bundle arm.
- [x] RED: packages/viewer/src/rejected-movement-prefix-bundle.test.ts, 6 failing / 0 passing
- [x] GREEN: six recipes enable it (base false, appended to bundle switches); positional/arm-parity tests updated the same way the potion-guidance enable did (poison-berry slices, milestone-drought tail, birch tail and exclusion list, open-goal and story-battle-heal-gate arm exclusions, heal-first incumbent overrides). just test 0 (agent 4571, viewer 1709, Python 3961); just lint 0.
- [x] Review (packet 3d5cc66e6..2458b15a6, SHA-256 71e10bc7da9e3949667106bae3d1c9b3f346fa1b221e112e8b0d33b761f9ff42): Claude CLI LGTM; GPT via Codex CLI gpt-5.6-sol xhigh LGTM; fallback Sonnet subagent LGTM (Grok out of usage; The operator "land without grok"). Follow-ups only: positional tests could assert membership instead of tail index.
- [x] Landed: `git merge --ff-only 2458b15a6`; `just test` on main 0 (agent 4571, viewer 1709, Python 3961).
