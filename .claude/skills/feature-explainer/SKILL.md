---
name: feature-explainer
description: Write a local, self-contained HTML explainer with diagrams for a new PokeBench feature or switch. Use whenever a harness feature, feature switch or navigation/observation behavior is added or changed and the operator needs to understand what it does; not for benchmark result reports.
---

# Feature explainers

The operator wants every new feature and switch explained with diagrams, not prose alone. The explainer ships with the change report.

## Where it goes

- One file per feature: `runs/explainers/<feature-or-switch-id>.html` (gitignored `runs/`).
- Self-contained: inline CSS and inline SVG only. Zero network requests: no web fonts, CDNs, images by URL or scripts from elsewhere. Use system font stacks.
- Never publish it as a claude.ai artifact or any hosted link. Everything stays local.
- In the report, give the operator the command to open it, in its own `bash` block: `open ~/dev/pokebench/runs/explainers/<file>.html`.

## What it shows

Draw the mechanism, not its name. Pick what the decision turns on:

- **Behavior on the map:** small tile grids (start, goal, terrain) with the chosen route solid and the rejected route dashed, and the cost or outcome of each.
- **Before and after:** the same situation with the switch off and on, side by side.
- **Thresholds:** when a rule flips (break-even tables, cut-off values), as a small labelled grid.
- **Wiring:** how the switch travels from the run preset or switchboard to the code it changes, with the one box that changes behavior highlighted.
- **Game grounding:** which game behaviors, flags or tiles it reads, with their values. Ground these in pret/pokeemerald via [game state](../pokebench-game-state/SKILL.md), and say where PokeAgent differs.
- **Status:** branch, checks run, what has not been done (review, measured runs).

Every number in a diagram must match the code and its tests. Label arrows. Put one claim per figure, with a caption saying what it shows.

## Craft

- Light and dark: define colors as CSS variables on `:root`, redefine them under `prefers-color-scheme: dark`, and set an explicit `body` background.
- Works at phone width; wide figures scroll inside their own container.
- Plain, short sentences in the operator's vocabulary. No marketing tone.
- Check once by opening the file locally before reporting it.

This skill documents a change. It does not authorize runs, landing or claims that a patch helps; use [patch evaluation](../pokebench-patch-evaluation/SKILL.md) for those.
