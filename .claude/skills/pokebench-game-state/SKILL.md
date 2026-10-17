---
name: pokebench-game-state
description: Ground PokeBench Pokémon Emerald observations in the pret/pokeemerald game source when implementing or debugging RAM state, menu selections, naming, clock controls, maps, or model/viewer readouts. Applies to PokeBench harness work, not unrelated repositories or game-playing automation.
---

# PokeBench game-state reference

Deliver the state the player can act on now: the active screen and UI phase, selected option or key, editable values, and whether input is accepted. Location and party alone are insufficient while a menu or editor is open.

## Source checkout

Use `/Users/user/dev/pokeemerald`, cloned from `https://github.com/pret/pokeemerald.git`. The reference revision and targeted file/symbol index are in [references/game-source.md](references/game-source.md). Read only the section relevant to the current state.

Check its `git rev-parse HEAD` and `git status --short` before relying on it. Record the actual source revision with findings. Keep this checkout as a reference; do not update or edit it as part of an observation fix. If missing, restore the recorded revision when the current task authorizes fetching dependencies, or report that the reference is unavailable. A different upstream revision is not automatically a matching address map for the running ROM.

## Ground a readout in game behavior

1. Inspect the actual PokeBench worktree, its rules/worklog, the failing run's events, and the associated recorded frame. Do not switch or modify another agent's worktree or game session. Use the current checkout's owned state/observation modules; module names can differ across branches.
2. Follow the relevant game callback, active task function, input handler, and rendering code in the reference. Identify the owner of the selected value and its lifetime. `gMain.callback2` identifies a program, but often several menus, animations, and confirmation phases share it. A callback label alone does not prove which UI is visible or accepting input.
3. Map the required symbols and struct offsets to the exact running ROM. Use matching symbol/build information when available, otherwise verify against ROM instructions and a read-only live probe. C source explains behavior; it does not by itself establish an address. Do not transplant remembered offsets from another revision, region, ROM hack, or vendor heuristic.
4. Read a coherent snapshot through PokeBench's existing emulator-memory owner and frame lock. Pair it with the corresponding rendered frame; avoid mixing an older cached screenshot with newer RAM. Validate pointers, active task/sprite identity, enum/range values, and initialization state. Report unknown/unavailable or transitioning when ownership/readiness cannot be established; never turn a failed read into plausible zeros or default save data.
5. Include actionable UI state in the typed JSON and the model's observation text. Prefer facts such as `clock confirmation; selected NO`, `naming; uppercase; cursor B at (1,0); text AB`, or `dialog open; field movement locked`. Preserve world coordinates as context, but do not describe them as the currently selected control. Keep editor buffers distinct from confirmed save data.
6. Carry the same fields through event validation and viewer rendering. Maintain historical log compatibility and label older, unverified vendor state honestly. Declare added RAM information in run feature metadata according to the repository's benchmark rules. Do not substitute the model's narration for game-derived milestones.

## Verify the state delivered to the model

Use a separate, recorded probe with ordinary run metadata, tool results, and frames. Tag manual probes so benchmark summaries exclude them. Do not inject inputs into a measured model's session or reload its save to repair a mistake.

Check at least the relevant selection change, confirmation/cancel path, and a transition/uninitialized state. Compare the frame, decoded RAM, typed state, **and the exact observation text the model receives**. For an editor, verify its buffer and cursor independently; for a menu, verify more than the default option. Synthetic tests should exercise the production reader and propagation path, with a wrong offset or cursor mapping demonstrably failing. Synthetic layouts alone are not live ROM proof.

Record source symbols/revision, ROM identity, verified addresses/offsets, run/frame evidence, and remaining uncertainty in the repository's findings/worklog. Follow its existing gates and review requirements for implementation. This skill supplies source-grounding guidance; it does not authorize landing, new navigation solvers, RAM writes, or save manipulation.

## Harness messages use the game's own words

Operator decision (the operator, 2026-10-17): the harness should give the model the guidance the game itself would give, so it can rely on it and save the time of finding out. When a readout, refusal, briefing or guard tells the model about an obstacle, an exit, a blocked action or what to do next:

1. Find what the game shows if the player tried it: the script and text in the reference (for example `data/scripts/*.inc`, `data/text/*.inc`, `data/maps/<map>/scripts.inc`). Quote that text, or a short faithful paraphrase of it, and name the speaker or sign when the game does. Cite the script or text symbol in the code comment or test, so a reviewer can check it.
2. When the game shows nothing, say the plain observable fact and stop there. Example: pressing A at surfable water without the Balance Badge or a party Pokémon that knows Surf shows nothing, because `GetInteractedWaterScript` (`src/field_control_avatar.c`) returns no script unless the badge flag is set and a party member knows Surf, so `EventScript_UseSurf` and its `gText_WantToUseSurf` prompt are never reached. The harness line is "crosses water you cannot cross yet".
3. Never name a mechanic, item, badge, move, place or person the game has not yet shown the player at that point in the run. That is route foreknowledge, which this operator rule forbids even when a switch would declare it (PB4 only requires declaring harness help). Words the game has already shown, such as a sign, a character's line or a menu label, are fine.
4. Keep the game's spelling and capitalization (POKéMON, PROF. BIRCH, ROUTE 103), as the readout already does.
5. Test the message text against the source: a fixture test asserts the quoted words, and the explainer names the script symbol.

## Unsupported-state repair workflow

A recorded `active_ui.diagnostic` / `STATE COVERAGE ERROR`, unknown callback, unknown selection owner or unsupported text character is a state-coverage defect, not permission to guess. When investigating a run, collect the event seq, turn, paired frame, callback/task facts and exact model observation. Group repeated diagnostics by owner so animation frames do not create duplicate work. Use the source-grounding procedure above to establish ownership, readiness and live selected values, then add regression tests, coherent native proof, typed propagation and reviewed repair. Keep unresolved owners in the worklog with their concrete evidence; never close the defect by relabeling it overworld or defaulting a cursor.

This workflow is for coding agents maintaining the harness. A benchmark-playing model must not edit its own harness or receive an automatically injected walkthrough. Land changes between measured cohorts and declare new readouts in harness metadata.

## Raw memory is the reparsing source

For new human and agent runs, verify the shared reader saves complete raw writable memory before decoding under the paired frame lock. Check `raw-ram/index.jsonl` and actual gzip files, not just `ram-state-v1` metadata: decoded JSON alone cannot recover omitted fields or transient bad decodes. Archives include EWRAM/IWRAM/I/O/palette/VRAM/OAM, full unbanked cartridge Flash, CPU registers, native frame/time, exact ROM identity and hashes. Successful observations are paired in `raw-ram/observations.jsonl`; a decoder failure must preserve the already indexed raw file. Raw capture/storage failures must surface, and raw files must survive screenshot pruning.

Reparse with `pokebench_env.raw_ram.load_raw_ram` and the exact matching external ROM, validating the archive hash/region layout first. Prove a production game-state readback from a real native archive. Sampling is each observation/state poll, not every emulated frame; verify actual cadence when assessing transient coverage. Keep the human final native checkpoint separately. For historical runs lacking archives, clearly distinguish saved decoded fields, screenshot evidence and unrecoverable raw memory.
