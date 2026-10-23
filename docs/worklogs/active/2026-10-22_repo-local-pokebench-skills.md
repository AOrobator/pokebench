# Repository-local PokeBench skills

Operator request: move all PokeBench skills out of personal global scope into the shareable repository. This side conversation permits local requested changes but forbids subagents and disruption of the parent thread.

Scope: migrate decision probes, run coordination and update package with all scripts/references/UI metadata; retain existing repo cross-model-analysis and game-state skills; reconcile the one newer cross-model routing reference; add relative Codex discovery links and project-local authoring guidance. No harness, recipes, launches or parent branch edits.

The decision-probe source includes the general-wording/specific-error-correction lesson and iterative prompt tuning; preserve both. Replace checkout-specific example paths with repository-relative notation and fix the update-package audit invocation to name its repo-local script.

## Migration checks
- [x] Inventory global copies and compare duplicate repo skills.
- [x] Copy complete skill folders into `.claude/skills/` and add relative `.agents/skills/` links.
- [x] Three migrated skills validated; publisher4tests and ZIP-audit5tests pass (9total).
- [x] All14 Codex discovery links resolve inside an independent copy; complete source inventories verified, with only3 documented portability edits. Initial checker mistook macOS /var versus /private/var aliases for an escape; resolving the temporary root fixes the checker, with no skill-path change.
- [x] Migration committed as `4c947022b` (`docs: move PokeBench skills into the repository`).
- [ ] Required landing reviews and coordinated merge to main.
- [ ] Retire verified global copies and global game-state alias after main contains replacements; preserve recoverable backup outside global discovery.

Global copies remain in place until the canonical checkout contains the replacements, avoiding disruption to the parent thread or other active chats. Do not replace them with global symlinks: that would keep project skills globally discoverable.

Pre-review source refresh: global decision-probes SKILL.md changed after the captured inventory. Preserved the concurrent strengthened pilot-first standing instruction verbatim in the repository copy; retained the portable report path. Other captured source files unchanged. Fresh pre-retirement inventories will be checked before moving globals to backup.

## Parent landing qualification

Refreshed source inventories confirm all three full folders and exactly three portability edits, plus preserved concurrent pilot-first instruction. Global cross-model differs only in the reconciled routing reference; all other files match. Fourteen relative links resolve within an independent copy; both helper CLI entrypoints execute through those relocated links and all nine tests pass there. Three quick_validate checks pass. No project runtime/recipes changed.

Full configured just test: agent4889, viewer1811, native Python4013 pass. First native attempt ran before the worktree ROM/binding setup was complete and failed/skipped; receipt retained, no tests changed, configured rerun passes. Build/lint/vendor pass. TypeScript >=90% coverage passes with30s instrumentation timeout; Python configured coverage gate passes >=90. Initial Python coverage invocation used wrong working directory/CLI shape; retained as failed attempt, correct env-local command passes. No exclusions, threshold changes, retries or skips introduced. Deterministic receipts /tmp/local-skills-* and ignored runs/reviews/repo-local-pokebench-skills. Frozen review follows.
