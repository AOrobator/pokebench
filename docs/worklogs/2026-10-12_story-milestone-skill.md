# Repository skill for story milestones

The operator requested a repository skill making Emerald the source of truth for story progress, using story variables and flags rather than treating vendor milestone labels or model narration as authoritative. Scope: documentation skill and the existing Codex discovery alias pattern only. No runtime changes, vendor edits, run-log rewrites, navigation implementation, commits, or changes to the parent chat's existing implementation files.

The skill reuses the repository's game-state source-grounding workflow. Name confirmation and first truck exit are game-owned transitions, not assumed to have dedicated story flags. Persistent flags and documented script-variable transitions grade story progress; location splits remain separately identified navigation checkpoints. First-observed times and historical reconstruction retain evidence and uncertainty.

Created `.claude/skills/pokebench-story-milestones/SKILL.md` with `.agents/skills/pokebench-story-milestones` pointing to it. Bundled skill validator passed. The Codex alias resolves to the canonical skill, and the linked game-state skill exists. Runtime behavior and historical logs were not changed.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-12). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
