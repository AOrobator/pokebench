Harness switch · guidance · `explorer-guidance-v2`

# Talk to people, v2

> Markdown twin of [explorer-guidance-v2.html](../explorer-guidance-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

A generic version of the talk-to-people prompt section. It says that talking to people gives the model information and can move the story forward, that talking to the people around it helps when it is unsure where to go or after the story has moved on, and that what people say is evidence. It points toward no particular person. Off by default. `explorer-guidance-v1` stays registered and unchanged.

## Why a v2

Operator decision, 2026-10-16 4:18 PM EDT: keep the talk-to-people guidance generic, with no guidance toward any particular NPC. Two v1 lines read as a walkthrough toward particular people: "including the families and neighbours of characters you have met" and "A short remark, such as where someone has gone, is a direction to follow". Both describe the early Emerald story (the rival's family next door, PROF. BIRCH saying where the rival has gone) without naming it. v2 drops them and keeps only the general point.

## v1 and v2, word for word

### v1 · `explorer-guidance-v1` (unchanged)

Talk to people: in this game, people tell you where to go next. After each story event, and whenever you are unsure where to go, talk to everyone in the room you are in before you leave, including the families and neighbours of characters you have met. People often say something new once the story has moved on, so talk again to people you spoke to before. A short remark, such as where someone has gone, is a direction to follow, not small talk.

### v2 · `explorer-guidance-v2`

Talk to people: talking to people gives you information about the world and can move the story forward. When you are unsure where to go, or after the story has moved on, talking to the people around you is a good way to learn more. What people tell you is evidence; use it to decide where to go.

Highlighted: the v1 lines the operator read as pointing toward particular people. With dialogue auto-advance on, both versions are followed by the same sentence, in the same paragraph:

```
Talking is cheap: face the person and press A; the harness reads the conversation until your next decision.
```

## Where it goes in the system prompt

![System prompt order with the talk-to-people slot](explorer-guidance-v2/fig-1.svg)

*Each section is added only when its own switch is on; the order is fixed. v2 takes v1's slot exactly: after the map rules, battle triage and trainer heal sections, before untaken exits and the objective record; with `navigate-first-prompt-v1`, its Moving around section also comes after untaken exits (`playSystemPrompt` in `packages/agent/src/play-config.ts`).*

## Both switches on

| explorer-guidance-v1 | explorer-guidance-v2 | Section in the prompt |
|---|---|---|
| off | off | none (today's prompt, byte for byte) |
| on | off | v1 text (today's v1 prompt, byte for byte) |
| off | on | v2 text |
| on | on | v2 text only, once: v2 supersedes v1 |

The registry has no way to declare two switches mutually exclusive; its only refusals are dependencies and the state-only list. One switch replacing another's prompt text already happens: `navigate-first-prompt-v1` drops the `navigate_to` usage rule. Superseding also keeps a one-switch flip valid on an incumbent that already has v1 on, such as the bundle arm of bundle-v-control. Both ids are still recorded in `harness_features` when both are on; v2's switchboard description says only its section is shown.

## Wiring

![Switch wiring from preset to prompt](explorer-guidance-v2/fig-2.svg)

*Agent-side only: no game-server switch, no readout change, no tool change. The highlighted box is the only place behavior changes.*

## Registration

| Field | Value |
|---|---|
| Id, title | `explorer-guidance-v2`, TALK TO PEOPLE V2 |
| Group, needs | guidance, none |
| Defaults | off in presets, legacy flag presets and the viewer's next-run defaults |
| Recorded | last in `harness_features` |
| State-only decisions | refused with it on, as for v1 |
| Experiment | `experiments/explorer-guidance-v2.json`, pending, no queue position; incumbent lists the switch off explicitly |

## Status

- **Tests**: `packages/agent/src/explorer-guidance-v2.test.ts`: exact text, placement, talking-is-cheap pairing, v1 unchanged on and off, both on, preset path, registry; OFF builds every main prompt byte for byte (sha256 golden from the incumbent and from every switch on, each main switch flipped, two targets)
- **Not done**: measured runs (only the operator approves them)
