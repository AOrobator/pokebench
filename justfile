# .env (gitignored) holds POKEBENCH_ROM; see CLAUDE.md.
set dotenv-load := true

default:
    @just --list

# One-time per clone: enable tracked hooks and install both stacks.
setup:
    git config core.hooksPath .githooks
    pnpm install
    cd env && uv sync
    @echo "✓ hooks enabled, deps installed"

test:
    pnpm -r test
    cd env && uv run pytest -q

# Coverage floor is 90% (project override of the global 95%; see CLAUDE.md).
coverage:
    pnpm -r coverage
    cd env && uv run pytest -q --cov --cov-branch --cov-report=term-missing --cov-report=json:.coverage.json
    cd env && uv run python -m pokebench_gates.coverage_gate .coverage.json --min 90

lint:
    pnpm -r lint
    cd env && uv run ruff check . && uv run ruff format --check . && uv run mypy

build:
    pnpm -r build

# Native arm64 mGBA 0.10.5 + Python binding into env/.venv (see scripts/build-mgba.sh).
build-mgba:
    bash scripts/build-mgba.sh

verify-rom:
    cd env && uv run python -c 'import os; from pokebench_env.rom import resolve_rom; print("ROM OK:", resolve_rom(os.environ))'

verify-vendor:
    cd env && uv run python -c 'from pokebench_env.launcher import VENDOR_DIR; from pokebench_env.vendor import check_vendor; check_vendor(VENDOR_DIR); print("vendor OK:", VENDOR_DIR)'

# Game server in the foreground; watch it at http://127.0.0.1:8000/stream.
serve:
    cd env && uv run python -m pokebench_env.launcher

# Boots the real game server on the real ROM (127.0.0.1), presses A, reads state/screenshot/milestones.
smoke:
    cd env && uv run python -m pokebench_env.smoke
