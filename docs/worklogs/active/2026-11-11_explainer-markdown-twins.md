# Explainer Markdown twins

Branch `claude/explainer-markdown-twins`, worktree `~/dev/pokebench-explainer-twins`, off main a6a9eff8f.

Approval: The operator approved proposal options B + E on 2026-11-11 (setup/verify explainers proposal), relayed by the coordinator thread with the scope below. Do not push; do not land: The operator lands with their own OK.

Goal: every `docs/explainers/*.html` gets a Markdown twin that reads on GitHub, its inline SVG diagrams extracted to standalone SVG files that render on light and dark backgrounds; an outside-reader explainer index; a generated `docs/features.md` switch table. HTML stays the source; output is deterministic and drift-checked. Python standard library only.

## Milestones

### M1: converter
- [x] Tests for HTML→Markdown (headings, paragraphs, lists, tables, code, links, details, emphasis), SVG extraction (style copy, shared defs, background rect, size), status branch scrub, privacy scrub
- [x] `env/pokebench_env/explainer_twins.py` pure core, thin disk entrypoint

### M2: index and features table
- [x] README index grouped by feature group; `docs/features.md` from features.ts, viewer next-run defaults, 67d7 run_start snapshot (`docs/data/run-67d7-features.json`)

### M3: recipes, generation, checks
- [x] `just explainer-twins` writes; `just explainer-twins-check` fails on drift
- [ ] generate all; scrub scan; render check light/dark
- [ ] `just lint`, `just test` (needs CPU window)

### M4: review
- [ ] Codex review via `just tell-codex`

## Log

- 2026-11-11: deviation from RED-first: the converter was prototyped against the real 345 pages first (to find what the HTML actually contains), then 26 in-memory tests written; they caught one real bug (unterminated `<svg>` duplicated preceding text), fixed. Module coverage 97% lines+branches. ruff, ruff format, mypy --strict clean on the new files.
- Recipe names: `just pages` (serves 8791) and `just pages-check FILE…` (network check) are relied on by CLAUDE.md and skills, so the twin writer/drift check are `just explainer-twins` / `just explainer-twins-check`; `just lint` runs the check. The drift check regenerates in memory and compares byte for byte (no temp dir).
- Default column reads DEFAULT_NEXT_RUN plus every later `Object.assign(DEFAULT_NEXT_RUN.features, …)`. Run 67d7 column reads the committed snapshot `docs/data/run-67d7-features.json` (from runs/…_67d7/events.jsonl run_start evaluation.features, sha 45de5ba5…), so the check works without runs/.
- Generation: 345 twins, 562 SVGs (370 class-styled; 1 decorative aria-hidden hero and the zero-size defs holders skipped), 5 PNG frames. Deterministic across PYTHONHASHSEED 1/99/12345. Render sweep of all 562 in headless Chromium: all load; none transparent; 4 dark ones are map-observation-audit's intentional terminal panels. Privacy scan clean (no /Users, tailnet host, private IP, chat id, email); "The operator"/"The operator" remain in operator-decision citations.
- COMMIT: `feat(docs): Markdown twins of the explainers, with standalone SVG figures` (846a7dc64)
