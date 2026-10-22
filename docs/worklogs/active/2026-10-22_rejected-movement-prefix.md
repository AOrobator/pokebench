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
- [ ] Multi-model review (Claude, Grok, GPT) LGTM
- [ ] Land, `just viewer-main`, live check

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
