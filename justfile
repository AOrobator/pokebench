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

# Game server in the foreground; /view adds local audio + window-fit /stream.
serve: build
    cd env && uv run python -m pokebench_env.launcher

# Boots the real game server on the real ROM (127.0.0.1), presses A, reads state/screenshot/milestones.
smoke:
    cd env && uv run python -m pokebench_env.smoke

# Live LLM smoke: pi agent loop on the gateway, screenshot tool on the game server it spawns.
smoke-llm: build
    node packages/agent/dist/live.js smoke

# M5 baseline agent: one isolated, recorded run from a fresh boot (300 turns / 60 min).
run-agent: build
    node packages/agent/dist/live.js play

# Regenerate schemas/events.v1.json from the TypeBox source (a test fails when it is stale).
schema: build
    node packages/agent/dist/schema.js > schemas/events.v1.json

# Follow a run's events.jsonl live in the terminal.
tail-run run_id: build
    node packages/agent/dist/tail.js {{run_id}}

# Frame storage: usage against the 500 MB cap (runs refuse to start above 75%).
runs-disk: build
    node packages/agent/dist/runs-cli.js disk

# PB2 table for every run (or the named ones); fails when a run has no run_end.
runs-summary *run_ids: build
    node packages/agent/dist/runs-cli.js summary {{run_ids}}

# Delete the oldest frames until usage is at or below <percent> of the cap.
runs-prune percent: build
    node packages/agent/dist/runs-cli.js prune {{percent}}

# PokeBench viewer on 127.0.0.1:8790: live runs follow events.jsonl, finished runs replay from frames/.
view run_id="": build
    node packages/viewer/dist/cli.js {{quote(run_id)}}

# Manual validation probes are recorded like runs, excluded from benchmark results.
# stdin accepts {"action":"observe"}, {"action":"press","buttons":["A"]}, {"action":"end"}.
probe saved="": build
    node packages/agent/dist/live.js probe {{quote(saved)}}

# Fresh-ROM state gate, recorded in the viewer as a non-benchmark probe.
verify-state: build
    node packages/agent/dist/live.js verify-state
