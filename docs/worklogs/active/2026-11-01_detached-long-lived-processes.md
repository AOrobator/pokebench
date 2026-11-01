# Detached long-lived processes (runs / viewer / proxy)

**Started:** 2026-11-01
**Status:** Landing (reviews waived)
**Branch:** `cursor/detached-long-lived-processes`

## Problem Statement

A DeepSeek control `live.js play` started in a Cursor background terminal died as `operator_abort` when Cursor restarted. Long-lived gameplay, fixed-run runners, viewers, and proxies must not be owned by an LLM/agent session.

## Skills Loaded

- `.claude/skills/detached-long-lived-processes/SKILL.md` (new)
- `.claude/skills/fixed-run-launch/SKILL.md`
- `.claude/skills/pokebench-run-coordination/SKILL.md`
- `.claude/skills/close-the-loop/SKILL.md`
- `.claude/skills/execute-worklog/SKILL.md`

## Architecture

Non-negotiable detach recipe: `nohup` + logs under `runs/` + pid file + `disown`, launching shell returns immediately. Forbid Cursor/Claude/Codex background terminals (`block_until_ms: 0`, `run_in_background`, lingering `exec`) as process owners. Wire the rule into launch/coordination/close-the-loop skills and `CLAUDE.md` / `AGENTS.md`.

## Invariants

- **INV-1:** Documented launches of play / fixed-run / lasting viewer / proxy require detach proof (pid parent not an agent helper) before calling launched.
- **INV-2:** Fixed-run continues to use `nohup just fixed-run run …` with a recorded runner pid.

## Security Review

Documentation/skills only. No runtime, ROM, network, or secret changes.

## Milestones

**M1 — Skill + wiring (prose-only)**
- [x] Add `.claude/skills/detached-long-lived-processes/SKILL.md`
- [x] Update fixed-run-launch, pokebench-run-coordination, close-the-loop
- [x] Update `CLAUDE.md` / `AGENTS.md`; symlink `.agents/skills/` discovery
- [x] `git diff --check` clean on candidate
- [x] Cloud review waived by operator 2026-11-01 (“reviews are waived, land ur changes”); Claude CLI lane had already returned `VERDICT: LGTM` on frozen packet `905c465760b4f7fecb0096afbf30364177bb953f00abc5dbe243138c493afc97` before Grok/GPT harness outages
- [ ] Land FF to main; prose checks on main; `just land-done`

## Multi-Model Review Log

- Packet: BASE `1961fb3d7`..HEAD `ab61a672b`; `git diff --binary` SHA-256 `905c465760b4f7fecb0096afbf30364177bb953f00abc5dbe243138c493afc97`
- Claude CLI (`~/.claude-review`, plan mode): `VERDICT: LGTM` (hardening follow-ups only: process-group note, runner.pid ambiguity, viewer-main wording)
- Grok (cursor-agent): unavailable — Cursor usage limit
- GPT (codex exec): unavailable — default `gpt-6.1-sol` rejected; retry interrupted
- Operator waiver 2026-11-01: land without remaining cloud LGTMs

## Evidence

- Incident run: `2026-11-01T01-01-00_deepseek-v4.1-flash_control4h` ended `operator_abort` on Cursor restart (LLM-owned background shell).
- Operator 2026-11-01: “all runs always need to be detached… when a viewer or run starts, the process can NOT be LLM owned”; “land ur changes”; then “reviews are waived, land ur changes”.
