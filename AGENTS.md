# AGENTS.md

Codex: read `CLAUDE.md` first. Its rules are this repo's rules for every agent, not only Claude.

Claude sessions work in this repo alongside you and land on the same local `main`. Before you merge anything into `main`, join the landing board and wait for your turn. To tell Claude something, use `just tell-claude`. Both are in `.agents/skills/talk-to-claude/SKILL.md`.

PokeBench-specific skills are versioned under `.claude/skills/`. Codex discovers them through the repository-relative links in `.agents/skills/`. Keep project-specific skills here rather than under `~/.codex/skills`, so a clone carries its workflow and helper scripts.
