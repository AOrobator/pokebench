# Truck dialogue loop

## Problem Statement

On `2026-10-18T01-30-48_qwen36-gpu0_e6ce` (the bundle arm of the cook), turns 52–109, the player stood at (2,2) inside the truck facing a box and pressed A. Each A started the box sign ("The box is printed with a POKéMON logo." then "It's a POKéMON brand moving and delivery service."). Dialogue auto-advance pressed B and closed it, so the tool result was the free field with no message. The loop guard counts a message only while the result still shows it, and the before-state of that call is the last B (message still up), so the place fingerprint also changes. No cycle warning fired. The model kept pressing A, which starts whatever it faces, so the same sign opened again.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state.

## Architecture

Two switches, both needs null, default off, appended after `stale-story-goal-v1`. Both are on in the bundle arm of `experiments/fixed/bundle-v-control.json` and in the `open-goal-prompt` incumbent (the cook arm). Both are off in the control arm.

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

Agent suite: 2403 passed. Viewer panels, server, and next-run: 190 passed. `just pages-check` on both explainers printed nothing.

## Not done

Not committed. Not reviewed. Not merged. `source.commit` not repinned. Experiments not queued, not approved, not launched. The live cook is unchanged.
