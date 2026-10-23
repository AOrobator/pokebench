# Experiment overviews

One local HTML page per designed experiment, written with `.claude/skills/pokebench-experiment-design/SKILL.md` from its `overview-template.html`. Each page shows the mechanism, the start, the arms, the outcomes and decision rule, the power and GPU-hours, the run rules, the threats and the provenance. Open a page directly; no server is needed.

Readiness verdicts and supporting run IDs are recorded in the matching feature or evaluation worklog under [worklogs](../worklogs/).

<!-- Add one line per overview: - [Title](<experiment-id>.html) — tier, start, runs per arm -->

- [Battle effective damage](battle-effective-damage.html) — frontier behavior; Petalburg checkpoint; provisional 8 per arm; not approved or queued.

- [JIT ten-minute screen](jit-10m.html) — screen; MAIN_MENU start; 12 per arm across both GPUs; launch held.

- [JIT v2 one-pair diagnostic pilot](jit-v2-pair-10m.html) — one ten-minute run per arm; existing runs protected.

- [JIT cache fixes: concurrent twenty-minute pair](jit-v2-cache-20m.html)

- [Starter decision salience diagnostic](starter-decision-salience.html) — eight per arm, Route101 checkpoint, five-minute cap; not approved or launched.

- [Whole-map navigation cook, 1 hour](whole-map-cook-1h.html) — screen; MAIN_MENU start; 12 one-hour pairs; gated on bundle fixes.

- [October 22 Frontier mistake mitigation evaluation catalogue](frontier-mistake-mitigations-plan.html) — correctness and study preparation; 8/arm screen proposal; checkpoint/readiness/cost/power unresolved; no approval or launch.





- [Roxanne autonomous sixteen GPU-hour campaign — proposal](roxanne-autonomous-16gpuh-20261023.html)

- [Roxanne controller offline proof](roxanne-controller-offline-20261023.html): native/history qualification, full-trace scoring and network-denied rehearsal; no campaign launch.
