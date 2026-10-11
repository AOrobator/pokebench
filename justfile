set dotenv-load := false

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
