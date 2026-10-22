---
name: tool-prompt-sync
description: Keep the PokeBench system prompt in step with the model's tool list. Use whenever a model-facing tool is added, renamed, removed, re-gated or given new arguments (game-tools.ts, evolution-decision.ts, navigation, battle or move-learn tools), so the system prompt, scene tool lists and contextual docs describe exactly the tools the model has.
---

# Every tool the model has is in its system prompt

Operator rule (the operator 2026-10-21): "everytime u add a tool u update the system prompt". Run d548 had `choose_evolution` in its tool list but not a word about it in its 15881-char system prompt, and froze at an evolution decision for 100+ turns.

## Checklist (same change as the tool)

1. **Tool list**: the tool's name is returned by `playTools(features)` in `packages/agent/src/play-config.ts` behind the tool's own switch.
2. **System prompt section**: `playSystemPrompt(features, …)` adds a `- <tool_name>: …` section behind the same switch. It says when the game shows the situation the tool is for (in the game's own words), what the tool does, and what it never does. No advice on which choice is better, no story foreknowledge.
3. **Scenes**: if `just-in-time-prompt-v1` scenes apply, show the section in the scenes where the tool is kept, and update `DROP_TOOLS` when the tool must not be offered in a scene.
4. **Contextual docs**: if `contextual-interface-docs-v1` lists controls per interface, name the tool for the interface it owns.
5. **Readout pointer**: when the server readout names the controls for that interface, it names the tool (as evolution's "use choose_evolution" does).
6. **Tests**:
   - `tool-prompt-sync.test.ts` asserts every tool in `playTools(features)` is named in `playSystemPrompt(features, …)` for the default preset, every `experiments/fixed/*.json` arm and every pending experiment arm, with `tool-prompt-docs-v1` ON. Adding a tool without a section turns it red.
   - The switch's OFF test still proves the old prompt bytes.
7. **Prompt changes are behavior changes**: the new section ships behind the tool's switch (feature-switch skill). Sections added for tools that predate this rule ride `tool-prompt-docs-v1`.
8. Removing or renaming a tool removes or renames its section in the same change.

## Veto

- A tool in `playTools` with no prompt section when `tool-prompt-docs-v1` is ON.
- A prompt section naming a tool the model does not have.
- Editing the test's tool allowlist to make it pass.
