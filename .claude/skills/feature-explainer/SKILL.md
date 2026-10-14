---
name: feature-explainer
description: Write a tracked local HTML explainer with diagrams and link it from the matching PokeBench Harness Config feature card. Use whenever a harness feature, feature switch or navigation/observation behavior is added or changed and the operator needs to understand what it does; also use when adding or repairing feature-card explainer links, not for benchmark result reports.
---

# Feature explainers

The operator wants every new feature and switch explained with diagrams, not prose alone. The explainer ships with the change report.

## Where it goes

- One file per feature: `docs/explainers/<feature-or-switch-id>.html`, tracked in Git alongside the feature. Add it to `docs/explainers/README.md`. Do not keep the only copy in ignored `runs/` or a temporary directory.
- Self-contained: inline CSS and inline SVG only. Zero network requests: no web fonts, CDNs, images by URL or scripts from elsewhere. Use system font stacks.
- Never publish it as a claude.ai artifact or any hosted link. Everything stays local.
- When reporting in a project thread, send the committed HTML with `SendUserFile`. It copies the file into the project's shared folder and reports the path, which carries an added suffix (`/mnt/project-files/<name>-<timestamp>-<id>.html`). Use that reported path exactly: link it in the reply as `[<name>.html](/mnt/project-files/<name>-<timestamp>-<id>.html)` and list it in the reply's `attached_outputs` as `{kind: "file", ref: "<reported path>"}`. A local path such as `/private/tmp/...` or `~/dev/...` is not clickable in a thread.
- Outside a project thread, link the file's absolute path with a descriptive label, for example `[Navigation memory explainer](/Users/user/dev/pokebench/docs/explainers/navigation-evidence-memory-v1.html)`. Link the canonical retained artifact, not a temporary worktree copy. Do not wrap the link in backticks or use `file://` URLs.
- After the link, add the local `open ~/dev/pokebench/docs/explainers/<id>.html` command in a `bash` block as a fallback. Never give the command instead of a link.

Verify the explainer is included in the commit, not merely present on disk. Keep probe logs and temporary helper scripts under ignored `runs/`; copy only the documentation needed to explain the feature.

## Link it from Harness Config

A harness feature explainer should be reachable from its matching card in **PokéNav → HARNESS CONFIG**, not only from the chat or documentation index.

- Use the exact feature ID from `packages/agent/src/features.ts`. Register its tracked HTML filename in `FEATURE_EXPLAINERS` in `packages/viewer/src/panels.ts`. Filenames need not equal feature IDs: `bounded-navigation-v1` maps to `astar-navigation.html`. Update the existing mapping when renaming a document.
- That mapping owns both card links and the viewer server's exact-file allowlist. `packages/viewer/src/server.ts` serves `/explainers/<filename>` from `docs/explainers/`. Reuse this owner; do not add another allowlist, arbitrary file serving, external hosting or a guessed `file://` link. Preserve host, GET-only and content-security protections.
- Keep the card's description in the existing feature catalog. An explainer link must not change ON/OFF/NOT RECORDED status or infer a historical setting from today's defaults. Leave unrelated report/UI documents unassigned rather than inventing a feature ID.
- Extend the existing tests in `packages/viewer/src/panels.test.ts` and `server.test.ts`: assert the exact card ID links to the intended URL, and that the route returns the tracked document. Retain unknown-ID, missing-file and host/method rejection coverage. Run viewer tests and the relevant build/lint checks.
- Verify delivery in the actual viewer: open the selected run's Harness Config, find the feature by name or ID, click **READ EXPLAINER**, and confirm the expected document opens. A file on disk or a link in chat alone does not prove this path works. If server code/allowlist changed, distinguish built files from the running server; coordinate any restart with active benchmarks and preserve their frozen execution checkout.

For an explainer-only edit to an already-linked feature, keep its mapping and validate the existing link rather than adding a second entry. Report the clickable canonical document link plus whether card rendering, serving and the live click were verified.

## What it shows

Draw the mechanism, not its name. Pick what the decision turns on:

- **Behavior on the map:** small tile grids (start, goal, terrain) with the chosen route solid and the rejected route dashed, and the cost or outcome of each.
- **Before and after:** the same situation with the switch off and on, side by side.
- **Thresholds:** when a rule flips (break-even tables, cut-off values), as a small labelled grid.
- **Wiring:** how the switch travels from the run preset or switchboard to the code it changes, with the one box that changes behavior highlighted.
- **Game grounding:** which game behaviors, flags or tiles it reads, with their values. Ground these in pret/pokeemerald via [game state](../pokebench-game-state/SKILL.md), and say where PokeAgent differs.
- **Actual data and interface format:** for memory, prompts or tool interfaces, show a source-checked recorded example, the exact payload/schema and field meanings, bounds/truncation and evidence/expiry rules. Label illustrative examples separately from actual recorded behavior.
- **Status:** branch, checks run, what has not been done (review, measured runs).

Every number in a diagram must match the code and its tests. Label arrows. Put one claim per figure, with a caption saying what it shows.

## Craft

- Light and dark: define colors as CSS variables on `:root`, redefine them under `prefers-color-scheme: dark`, and set an explicit `body` background.
- Works at phone width; wide figures scroll inside their own container.
- Plain, short sentences in the operator's vocabulary. No marketing tone.
- Check once by opening the file locally before reporting it.

This skill documents a change. It does not authorize runs, landing or claims that a patch helps; use [patch evaluation](../pokebench-patch-evaluation/SKILL.md) for those.
