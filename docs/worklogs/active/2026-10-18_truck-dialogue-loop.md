# Truck dialogue loop

## Problem Statement

On `2026-10-18T01-30-48_qwen36-gpu0_e6ce` (the bundle arm of the cook), turns 52–109, the player stood at (2,2) inside the truck facing a box and pressed A. Each A started the box sign ("The box is printed with a POKéMON logo." then "It's a POKéMON brand moving and delivery service."). Dialogue auto-advance pressed B and closed it, so the tool result was the free field with no message. The loop guard counts a message only while the result still shows it, and the before-state of that call is the last B (message still up), so the place fingerprint also changes. No cycle warning fired. The model kept pressing A, which starts whatever it faces, so the same sign opened again.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state.

## Architecture

Two switches, both needs null, default off. Registry order ends `stale-story-goal-v1`, `input-cuts-v1`, `loop-guard-screen-v1`, `reopened-dialogue-loop-v1`, `dialog-button-b-v1`. Both new switches are on in the bundle arm of `experiments/fixed/bundle-v-control.json` and in the `open-goal-prompt` incumbent (the cook arm). Both are off in the control arm. `input-cuts-v1` and `loop-guard-screen-v1` stay as main had them: base false, in the bundle switches list, true on the cook incumbent.

`reopened-dialogue-loop-v1` (guard). `LoopDetector`'s last argument `closedDialogue`, after `clockViews`, wired from the FeatureSet in `live.ts` and `decision-probe.ts`. A separate `closedTalk` counter. ON counts the lines shown during a press when the result is the free field and the message is already gone, at the same place. The first showing is count 0. The fourth showing of the same lines raises the existing cycle warning and the supervisor briefing, and sets the reopened flag so navigation truth still says reopening the message is not story progress. One showing, a different line, and the same lines after leaving that tile do not count. A result that still shows the lines stays on the older counter. OFF: a call whose result has no dialogue does not count as reopening it.

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

## Not done

The feature commit is `05060925`. Main moved to `56dfa98f` (`loop-guard-screen-v1`) during round 1, so that landing is merged in ahead of these two switches. Round 1 is not an LGTM. Not on main. `source.commit` on the two new experiment files is still `bcde8cd4`; repin after landing. Experiments not queued, not approved, not launched. The live cook is unchanged.
