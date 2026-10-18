# Truck dialogue loop

## Problem Statement

On `2026-10-18T01-30-48_qwen36-gpu0_e6ce` (the bundle arm of the cook), turns 52–109, the player stood at (2,2) inside the truck facing a box and pressed A. Each A started the box sign ("The box is printed with a POKéMON logo." then "It's a POKéMON brand moving and delivery service."). Dialogue auto-advance pressed B and closed it, so the tool result was the free field with no message. The loop guard counts a message only while the result still shows it, and the before-state of that call is the last B (message still up), so the place fingerprint also changes. No cycle warning fired. The model kept pressing A, which starts whatever it faces, so the same sign opened again.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state.

## Architecture

Two switches, both needs null, default off. Registry order ends `stale-story-goal-v1`, `input-cuts-v1`, `loop-guard-screen-v1`, `reopened-dialogue-loop-v1`, `dialog-button-b-v1`. Both new switches are on in the bundle arm of `experiments/fixed/bundle-v-control.json` and in the `open-goal-prompt` incumbent (the cook arm). Both are off in the control arm. `input-cuts-v1` and `loop-guard-screen-v1` stay as main had them: base false, in the bundle switches list, true on the cook incumbent.

`reopened-dialogue-loop-v1` (guard). `LoopDetector`'s last argument `closedDialogue`, after `clockViews`, wired from the FeatureSet in `live.ts` and `decision-probe.ts`. A separate `closedTalk` counter. ON counts the readable lines shown during an A press when the result is the free field (overworld, not in battle, controls unlocked, no ready interface) and the message is already gone, at the same place. A message identity is not a line. Native story progress clears the count. The first showing is count 0. The fourth showing of the same lines raises the existing cycle warning and the supervisor briefing, and sets the reopened flag so navigation truth still says reopening the message is not story progress. One showing, a different line, the same lines after leaving that tile, and the same lines still open do not count. A locked menu does not count and does not clear. OFF: a call whose result has no dialogue does not count as reopening it.

`dialog-button-b-v1` (guidance). Appends one system-prompt section immediately before the trust order. B is the button for a message. A talks to whatever you face and starts that message again. Once you can walk, leave. The section names no character, place, or story step. It does not rewrite a chosen A into a B. OFF: the prompt is unchanged, byte for byte.

Pending `experiments/reopened-dialogue-loop.json` and `experiments/dialog-button-b.json`, no queue position. Activation `PLAYER_NAME_CONFIRMED`. Primary `FIRST_TRUCK_EXIT`. `source.commit` is `bcde8cd4` (HEAD before landing); repin after the merge.

## Invariants

- INV-1: OFF is the previous guard and the previous prompt. A closed result does not count, and the prompt gains no section.
- INV-2: The fourth showing is the warning. Count starts at 0 and the guard's ineffective threshold is 3.
- INV-3: The prompt section does not name a character, a place, or a story step, and it does not change the button the model already chose.
- INV-4: The cook already running is not restarted. It loaded its definition at start.

## Observability

The warning is the existing `loop_guard` event (kind cycle, phase warning, then supervisor). Activity History already shows that event. No timeline mark was added. The supervisor briefing is the model-facing recovery, the same path the other cycle warnings use.

Deletion receipt, 2026-10-18: removed `features["reopened-dialogue-loop-v1"]` from `live.ts` once. `reopened-dialogue-loop.test.ts` "the production path…" failed at the `live.ts` contains assertion. Restored the argument. The same test then passed, including the replay of the recorded press shape (A, lines shown, last B while the message is up, result the free field): OFF warns never, ON warns on the fourth showing.

## Tests

Before the main merge: agent suite 2403 passed; viewer panels, server, and next-run 190 passed; `just pages-check` on both explainers printed nothing.

Gates on `f9d26a34` (main merged through `336c174a`):

- `just test`: agent 2410 passed (153 files), viewer 1145 passed (81 files), pytest 2707 passed.
- `just lint`: tsc, eslint, ruff, and mypy (92 files) clean.
- `just build`: agent and viewer tsc succeeded. Viewer stamp `f9d26a3`.
- `just coverage`: agent lines 99.22 / branches 94.18 / functions 98.3; viewer lines 97.62 / branches 91.38 / functions 93.79; pytest lines 97.66 / branches 93.82 / functions 100. Floor is 90.
- `just verify-vendor`: vendor OK at `bbab97ad`.
- `just pages-check` on both explainers printed nothing.

One agent test (`serial-comparison` hung-child stdout) failed once while lint and the build were running on the same machine, and passed on the next isolated run and in the gate above. It is not part of this diff.

## Review round 1

Frozen packet `336c174a..40991fb2`, diff SHA-256 `d62fdfb6965e143fb781b52ffa86fb69b607ab3fedaf866bcded37594a99306b`. Claude CLI review login was logged out, so the Claude lane was Cursor `claude-opus-5-thinking-high`. Grok was `grok-4.7-high`. GPT was `gpt-5.6-sol-xhigh`. All three returned `VERDICT: BLOCKING` with empty stderr.

Accepted and fixed:

- Both explainers had copied `<title>Clock view loop</title>`. Titles are now the page subjects, and the card tests assert them.
- The counter now counts only a `press` whose requested buttons include A. A `navigate_to` and a B-only press do not add. An open result whose lines differ from the counted lines clears the count. The same lines still open do not.
- Deletion receipts, each restored after the red run: removing the `dialog-button-b-v1` prompt insertion failed `expect(sectionAt).toBeGreaterThan(0)`; removing the `decision-probe.ts` argument failed the probe `toContain`; removing `if (closedLoop) hit ??= "cycle"` failed the fourth-showing `["warning", "supervisor"]` assertion.

Rebutted, not changed: replaying the live cook cannot show this warning, because that run loaded the old build. The production-path test already drives `attachLoopGuard` with the recorded press shape, and the event type is the existing `loop_guard`. The live 8790 viewer is not restarted while the cook is up. Leaving and returning inside one call is judged by the result place, the same rule as the clock counter.

## Round 2

Frozen packet `56dfa98f..8ce3dbb5`, diff SHA-256 `01b932e0ac61e8b7b017f768eef73410e6df7e43e350ee4ab60ad2f57b66542c`. Cursor Claude `claude-opus-5-thinking-high` returned `VERDICT: LGTM`. Grok `grok-4.7-high` and GPT `gpt-5.6-sol-xhigh` returned `VERDICT: BLOCKING`. Empty stderr, one verdict each. The operator approved a third round on the accepted fixes only.

Accepted:

- The same lines still open, after a count is already under way, do not clear it. A test now does three closed showings, one open result of those lines, then one more closed showing, and expects the warning.
- A result counts only on the free field. A locked menu, a ready interface, and a missing world context do not.
- Readable dialogue only. A message identity is not stashed for this counter. The ineffective-loop stash is unchanged.
- Native story progress clears `closedTalk` with the other loop memory. `clockLooks` is left as main has it.
- `live.ts` and `decision-probe.ts` are checked by the last two arguments of `attachLoopGuard`, so swapping this flag with the clock-view flag fails.

Deletion receipts, each restored after the red run:

- Removing the free-field return failed `ON: a locked menu…` with `expected [ { kind: 'cycle' …} ] to deeply equal []`.
- Stashing `message.identity` as a line failed `ON: a message identity…` with the same cycle-versus-empty assertion.
- Removing the `closedTalk` reset in `nativeProgress` failed `ON: native story progress clears the count` with that same assertion.
- Always clearing on any open result failed `ON: the same lines still open…` with `expected [] to deeply equal [ 'warning', 'supervisor' ]`.
- Swapping the last two arguments in `live.ts`, and separately in `decision-probe.ts`, each failed `the production path…` with `expected 'features["clock-view-loop-v1"]' to be 'features["reopened-dialogue-loop-v1"]'`.

Index test names that still said "last" while asserting `at(-4)`, `at(-3)`, and `at(-5)` now say fourth, third, and fifth from the end.

## Round 3

Frozen fix delta `8ce3dbb5..5e7b399f`, diff SHA-256 `315471e1de7579b4325e2d9da4b7c1c6862754b5787f3da1e16c85bce1527961`. Cursor Claude returned `VERDICT: LGTM`. Grok and GPT returned `VERDICT: BLOCKING`. Empty stderr, one verdict each.

The free-field return was skipping the different-line clear, so a locked result that showed a different line left the count in place. The open-line comparison now happens first: a different line clears, including when controls are locked, and the same lines still open do not. A result whose message is still ready is not the free field, even when its dialogue string is empty.

Deletion receipts, each restored after the red run:

- Checking the lock before the different-line clear failed `ON: a different line still clears the count when that result is locked` with `expected [ { kind: 'cycle' …} ] to deeply equal []`.
- Dropping the ready-message clause failed `ON: a ready message with no dialogue text is not the free field` with that same assertion.

A ready message at another tile was still leaving the count in place, so the next showing at the old tile warned. That result now clears the count, the same way any other result does after the player leaves the tile. Emptying `leftTile` failed `ON: a ready message at another tile clears the count` with `expected [ { kind: 'cycle' …} ] to deeply equal []`, and the clear was restored.

## Landed

Fast-forward of `86d0994ea1341b1b3aced49b736a5ec398f6c145` onto main. The leave-tile delta `bbb48850..86d0994e` (SHA-256 `b496bf7d63dfcc36ba83058ab1e2ecc61dd3fe7ed7338f11216b0a93117b5dd6`) got `VERDICT: LGTM` from Cursor Claude `claude-opus-5-thinking-high`, Grok `grok-4.7-high`, and GPT `gpt-5.6-sol-xhigh`, each with empty stderr and one verdict. `just test` on that commit: agent 2425, viewer 1146, pytest 2707. On main after the fast-forward, agent 2425, viewer 1146, pytest 2707. The cook already running is unchanged. The next launch after this merge picks the switches up. `source.commit` on the two new experiment files is still `bcde8cd4`; repin with `just experiment-pin` when those entries are queued. Experiments not queued, not approved, not launched.

## Not done

The feature commit is `05060925`. Main moved to `56dfa98f` (`loop-guard-screen-v1`) during round 1, so that landing is merged in ahead of these two switches as `0c9db3da`. Round 1 reviewed `336c174a..40991fb2` and is void: the tree changed and main moved. Its accepted fixes are in `b41f09ce` (explainer titles; count only a press whose requested buttons include A; a different open line clears the count). Not on main. `source.commit` on the two new experiment files is still `bcde8cd4`; repin after landing. Experiments not queued, not approved, not launched. The live cook is unchanged.

Gates on `0c9db3da`, before this worklog commit: `just test` agent 2418 (154 files), viewer 1146 (81 files), pytest 2707. `just lint` clean (tsc, eslint, ruff, mypy 92 files). `just coverage` agent lines 99.22 / branches 94.21 / functions 98.3; viewer lines 97.62 / branches 91.38 / functions 93.79; pytest lines 97.66 / branches 93.82 / functions 100. Floor 90. `just build` viewer stamp `0c9db3d`. `just verify-vendor` clean. Viewer tests printed `fatal: not a tree object` and still passed; that line is not a failure of this diff.

Gates on the round-2 fixes, before their commit: `just test` agent 2422 (154 files), viewer 1146 (81 files), pytest 2707. `just lint` clean. `just coverage` agent lines 99.22 / branches 94.24 / functions 98.3; viewer lines 97.62 / branches 91.38 / functions 93.79; pytest lines 97.66 / branches 93.82 / functions 100. Floor 90.
