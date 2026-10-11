# CLAUDE.md

Project rules for PokeBench. Inherits `~/.claude/CLAUDE.md` (global). Where they differ, this file wins.

## What this is

A benchmark harness that measures how far local vision-language models get in Pokémon Emerald when given a specialized harness: first gym quickly, then the full game.

- `packages/agent`: TypeScript agent on pi (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`). Talks to the local-inference-stack gateway (`http://inference.example/v1`) and to the game server.
- `env/`: Python environment.
  - `pokebench_env` is our code: ROM resolution, server launcher, vendor check, typed client.
  - `env/vendor/continual-harness` is the PokéAgent starter kit, a git submodule pinned and **unmodified**.
- `scripts/build-mgba.sh`: native arm64 mGBA 0.10.5 build plus its Python binding.

Read the active worklog first: `WORKLOG.md` (a gitignored pointer) → `docs/worklogs/active/<date>_<slug>.md`.

## Project overrides of the global rules

- **Coverage floor is 90%** for lines, branches and functions in TS and Python app code. This is an operator decision (2026-10-11). The floor is 90, not 95; never lower it further or widen excludes to pass.
- **Vendored env:** `env/vendor/continual-harness` is excluded from coverage only while it is the pinned SHA with a clean tree (`just verify-vendor`). Changing its behavior means writing pokebench-owned, covered code. A fork brings it into coverage.
- **Principles rubric:** the principles self-review scores `~/dev/local-inference-stack/docs/agent-principles.md` until the operator authors a PokeBench file. Agents never author principles.
- **Deploy:** none. This is a local research tool. Milestones stop for operator review where the worklog says so.

## Non-negotiables

- **The ROM never enters git.**
  - It is referenced only via `POKEBENCH_ROM`.
  - It is symlinked into the vendor ROM slot, never copied.
  - The pre-commit hook rejects staged `.gba/.gb/.gbc/.sav/.state` files.
- **Worklog update per commit** is enforced by `.githooks/pre-commit`. Run `just setup` once per clone. `--no-verify` is forbidden.
- **RED → GREEN → multi-model review** per milestone. The review contract is `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md`.
- **Concrete types:** no `any`. Validate JSON from the gateway and the game server into typed values.
- **No hardcoded model SKUs.** Model ids come from gateway discovery and config.
- **Argv lists only** for subprocesses. Paths are untrusted; the real ROM path contains spaces and parentheses.
- Servers bind `127.0.0.1`.

## Commands

```bash
just setup          # enable .githooks, install deps
just test           # vitest + pytest
just coverage       # both stacks, fail under 90
just lint           # tsc --noEmit, eslint, ruff, mypy
just build          # tsc build
just verify-rom     # SHA-1 check of $POKEBENCH_ROM
just verify-vendor  # submodule at pin, clean tree
just build-mgba     # native mGBA + Python binding into env/.venv
just smoke          # boots the real game server (needs ROM)
```

## Git

The commit author for this repo is `aorobator <orobator.andrew@gmail.com>`, set in the local git config.
