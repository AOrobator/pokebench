# Experiment overviews

One local HTML page per designed experiment, written with `.claude/skills/pokebench-experiment-design/SKILL.md` from its `overview-template.html`. Each page shows the mechanism, the start, the arms, the outcomes and decision rule, the power and GPU-hours, the run rules, the threats and the provenance. Open a page directly; no server is needed.

Readiness verdicts are in [readiness.md](readiness.md).

<!-- Add one line per overview: - [Title](<experiment-id>.html) — tier, start, runs per arm -->

- [Battle effective damage](battle-effective-damage.html) — frontier behavior; Petalburg checkpoint; provisional 8 per arm; not approved or queued.

- [JIT ten-minute screen](jit-10m.html) — screen; MAIN_MENU start; 12 per arm across both GPUs; launch held.

- [JIT v2 one-pair diagnostic pilot](jit-v2-pair-10m.html) — one ten-minute run per arm; existing runs protected.

- [JIT cache fixes: concurrent twenty-minute pair](jit-v2-cache-20m.html)
