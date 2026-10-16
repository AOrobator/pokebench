# Viewer Game + Stream

## Problem and approved design
The watch view must show the current objective, game, readable thinking stream, and unchanged timeline together. Move inspection to a PokéNav directory below the fold. Keep the Pokémon theme; retain all existing viewer fields and add completed thinking to Activity History.

## Isolation
Implemented in codex/viewer-game-stream, separate from the frozen experiment at 40262a0. Preview serves existing event logs read-only on another port. Do not modify experiment source, logs, supervisor, endpoints, or current viewer. Landing deferred while the experiment is active at the operator's request.

## Invariants
- Game and thinking share a bounded watch stage; objective above, unchanged timeline below.
- Thinking follows by default; scrolling back pauses follow until explicitly resumed.
- Trainer, Party, LLM Stats, Objectives/evidence, Splits/baseline/best, Field State, Activity History/raw events and Run Details remain available as pages.
- Viewer changes do not change game or model inputs, budgets, prompts or event schemas.

## Validation
- RED: three new checks failed before implementation (page navigation, reader-controlled follow, thinking history); GREEN: all150viewer tests pass.
- Viewer lint, build and coverage pass:98.4%lines,91.11%branches,98.46%functions. No lowered thresholds/excludes.
- Browser proof on8793: both live runs visible; allfourwatch components fit1280×720; fullobjective/evidence page,430pxhistory/raw inspector, counters/budgets and page selection across run switching verified. Browser console has no errors. Existing8791viewer and main checkout unchanged.
- Multi-model review and landing remain pending. No review agents launched from this side conversation; active model endpoints are reserved for the matched experiment. Changes remain uncommitted in the isolated worktree.
- Preview command: node packages/viewer/dist/cli.js --port8793 --runs /Users/user/dev/pokebench/runs (actual argv uses separate --port and8793).

## Landing handoff — 2026-10-12
- The operator explicitly asked the main chat to assign review/landing to a subagent; viewer_landing owns this existing patch. The 12-run experiment has now ended; original logs/source identity remain unchanged. Canonical integration remains root-owned, with concurrent native UI, objective and loop-guard work reconciled there.
- Original implementation owner reports three observed RED failures before implementation; no RED commit exists. This is retained as qualified historical evidence, not represented as a committed RED artifact.
- Repeated targeted mutations after handoff: removing page visibility, replacing reader-follow with old thinking-only behavior, and removing assistant history each produced a targeted AssertionError (three logs plus mutations.json), then restored exact source bytes.
- Full TypeScript coverage: 372 agent +150 viewer tests pass. Lint/types/format and build pass. Full Python gate currently 376 pass/2 failures because this worktree's vendor submodule is uninitialized and lacks map_groups.json; source untouched. Root is coordinating the pinned dependency topology/full integration gate. No lowered thresholds/excludes.
- External review pending frozen GREEN packet; no preview restart or canonical landing performed by this owner.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-12). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
