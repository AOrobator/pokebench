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
