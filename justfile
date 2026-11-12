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

# Every suite runs once, coverage-instrumented, under the no-I/O guards, and each suite's floor is
# enforced in the same pass (see CLAUDE.md). trainer-card-check is its own command.
# Viewer tests import compiled agent registry/schema exports; rebuild them before coverage.
test:
    just build
    pnpm -r coverage
    cd env && uv run pytest -q --cov --cov-branch --cov-report=term-missing --cov-report=json:.coverage.json
    cd env && uv run python -m pokebench_gates.coverage_gate .coverage.json --min 69
    uv run --project env python -m pytest -q -p no:cacheprovider -p pokebench_gates.no_io_guard --rootdir scripts/claude-gateway scripts/claude-gateway --cov=claude_gateway --cov=replay --cov=preflight --cov-branch --cov-report=term-missing --cov-report=json:env/.claude-gateway-coverage.json
    uv run --project env python -m pokebench_gates.coverage_gate env/.claude-gateway-coverage.json --min 22
    just no-io-proof

# Fails if either guard stops catching I/O: runs a proof suite where only pure tests may pass.
no-io-proof:
    uv run --project env python scripts/no-io-proof.py

# The coverage gate is part of `just test`; `just coverage` is that same single pass under another name.
coverage: test

lint:
    pnpm -r lint
    just explainer-twins-check
    cd env && uv run ruff check . && uv run ruff format --check . && uv run mypy
    uv run --project env ruff check scripts/claude-gateway && uv run --project env ruff format --check scripts/claude-gateway
    uv run --project env mypy --strict scripts/claude-gateway/claude_gateway.py scripts/claude-gateway/replay.py scripts/claude-gateway/preflight.py

build:
    pnpm -r build

# Native arm64 mGBA 0.10.5 + Python binding into env/.venv (see scripts/build-mgba.sh).
build-mgba:
    bash scripts/build-mgba.sh

# Check a downloaded release folder with only your ROM (POKEBENCH_ROM): SHA256SUMS, the event log,
# the checkpoints and the final RAM snapshot. Read-only; -I keeps the release folder off sys.path.
[positional-arguments]
verify-release folder:
    cd "{{invocation_directory()}}" && uv run --project "{{justfile_directory()}}/env" python -I -m pokebench_env.verify_release "$1"

# Replay a downloaded release from power-on with its logged inputs and recorded clock, and compare
# the emulator's RAM with every recorded snapshot (default frames 0-150,000; --frames N; --all).
[positional-arguments]
replay-verify folder *args:
    cd "{{invocation_directory()}}" && uv run --project "{{justfile_directory()}}/env" python -I -m pokebench_env.replay_verify "$@"

# Open a downloaded release in the viewer: check it, unpack it into runs/releases/<run-id>/ (--raw-ram
# also rebuilds raw-ram/), then serve it on 127.0.0.1 on a free port (--port N; never 8790).
[positional-arguments]
view-release folder *args: build
    cd "{{invocation_directory()}}" && uv run --project "{{justfile_directory()}}/env" python -I -m pokebench_env.view_release "$@"

verify-rom:
    cd env && uv run python -c 'import os; from pokebench_env.rom import resolve_rom; print("ROM OK:", resolve_rom(os.environ))'

# Read-only setup preflight: PASS/FAIL/SKIP per check, with the fix for each miss. Tiers build up:
# core (enough for just test), game (adds just smoke: mGBA, ROM), model (adds the run's endpoint;
# SKIP when none is set). Exit 1 only when a check that ran fails. Changes nothing.
[positional-arguments]
doctor *tier:
    #!/usr/bin/env bash
    set -euo pipefail
    py=env/.venv/bin/python
    [[ -x "$py" ]] || py=$(command -v python3 || true)
    if [[ -z "$py" ]]; then
        echo "FAIL  core   python  no python3 found"
        echo "                     fix: macOS: brew install uv  |  Linux: https://docs.astral.sh/uv/; then uv python install 3.11 && just setup"
        exit 1
    fi
    PYTHONPATH="$PWD/env" "$py" -B -m pokebench_env.doctor "$@"

# Recover route103_rival for older runs from their raw-RAM archives into runs/<id>/derived/ (events.jsonl untouched).
backfill-route103 +runs:
    cd env && uv run python -m pokebench_env.backfill_route103 ../runs {{runs}}

# Recover all-gym story measurements from bounded immutable prefixes of retained raw RAM.
[positional-arguments]
backfill-story-progress +runs:
    uv run --project env python -m pokebench_env.backfill_story_progress runs "$@"

# Trainer-card art for the viewer (cards, trainer sprites, font, party icons) from ~/dev/pokeemerald
# ($POKEEMERALD), every asset verified against $POKEBENCH_ROM. ROM-derived: output stays under runs/.
[positional-arguments]
trainer-card-art out="runs/sprites/trainer-card-v1":
    uv run --project env python scripts/trainer-card/build_art.py "$1"

# PokéNav TRAINER CARD page art and gym table from ~/dev/pokeemerald, verified against $POKEBENCH_ROM.
# ROM-derived: output stays under runs/.
[positional-arguments]
trainer-page-art out="runs/sprites/trainer-page-v1":
    uv run --project env python scripts/trainer-card/build_page_art.py "$1"

# BAG page item icons for the viewer from ~/dev/pokeemerald, every asset
# verified against $POKEBENCH_ROM. ROM-derived: output stays under runs/.
[positional-arguments]
bag-art out="runs/sprites/bag-v1":
    uv run --project env python scripts/bag-art/build_bag_art.py "$1"

# POKéMON PARTY page art and tables from ~/dev/pokeemerald, every image and table
# verified against $POKEBENCH_ROM. ROM-derived: output stays under runs/.
[positional-arguments]
party-art out="runs/sprites/party-v1":
    uv run --project env python scripts/party-art/build_party_art.py "$1"

# Claude Code as a harness model endpoint (scripts/claude-gateway/claude_gateway.py --help).
# A detached process the harness reaches like any gateway; it never starts a run itself.
[positional-arguments]
claude-gateway *args:
    uv run --project env python scripts/claude-gateway/claude_gateway.py "$@"

# Replay recorded harness requests through the gateway: no run, no game, capped spend.
[positional-arguments]
claude-gateway-replay *args:
    uv run --project env python scripts/claude-gateway/replay.py "$@"

# Delivery preflight before any session-mode gateway run: replays recorded requests with a stub
# claude (no model calls) and fails unless every prompt carries the tool result, the full tool
# schemas and the union re-ask hint. Writes preflight-receipt.json for --preflight-receipt.
[positional-arguments]
gateway-preflight *args:
    uv run --project env python scripts/claude-gateway/preflight.py "$@"

verify-vendor:
    cd env && uv run python -c 'from pokebench_env.launcher import VENDOR_DIR; from pokebench_env.vendor import check_vendor; check_vendor(VENDOR_DIR); print("vendor OK:", VENDOR_DIR)'

# Game server in the foreground; /view adds local audio + window-fit /stream.
serve: build
    cd env && uv run python -m pokebench_env.launcher

# Boots the real game server on the real ROM (127.0.0.1), presses A, reads state/screenshot/milestones.
smoke:
    cd env && uv run python -m pokebench_env.smoke

# Live LLM smoke: pi agent loop on the configured model endpoint (docs/connect-a-model.md), screenshot
# tool on the game server it spawns. Needs POKEBENCH_MODEL and POKEBENCH_GATEWAY_URL or POKEBENCH_ENDPOINT_FILE.
smoke-llm: build
    node packages/agent/dist/live.js smoke

# Ordinary play, but never from the main checkout: the run gets a prepared checkout at HEAD, so a
# build, test run or post-landing gate on main can neither reach it nor make it record dirty.
run-agent *args: build
    node packages/viewer/dist/fixed-cli.js play {{args}}

# Who owns a pid or port. Exit 1 means a live run does: do not kill it, do not reuse its port.
run-claims:
    node scripts/run-claim.mjs --list

# Ask a live run to change course without a signal: pause, resume, stop, cancel_stop, abort.
run-control id action:
    node scripts/run-control.mjs {{quote(id)}} {{quote(action)}}

# Record a run's picture and sound to files, as a read-only client of its game server. Start before the run, detached.
record port out:
    PYTHONPATH="$PWD/env" env/.venv/bin/python -m pokebench_env.recorder --supervise --port {{port}} --out {{quote(out)}} --wait 3600

# Freeze a comparison manifest without starting gameplay; qualification is checked at execution.
prepare-comparison manifest: build
    node packages/agent/dist/serial-comparison-cli.js prepare {{quote(manifest)}}

# Execute an already frozen, qualified comparison serially; preserve every launched outcome.
run-comparison manifest: build
    node packages/agent/dist/serial-comparison-cli.js execute {{quote(manifest)}}

# Per-loop-type recovery of every loop-guard, stall, breaker and auto-talk intervention in recorded runs (read-only).
loop-recovery *run_ids: build
    node packages/agent/dist/loop-recovery-cli.js {{run_ids}}

# Regenerate schemas/events.v1.json from the TypeBox source (a test fails when it is stale).
schema: build
    node packages/agent/dist/schema.js > schemas/events.v1.json

# Regenerate the agent's readout-rules-in-prompt-v1 table from env/pokebench_env/map_rules.py (a test fails when it is stale).
map-rules:
    cd env && uv run python -m pokebench_env.map_rules ../packages/agent/src/map-rules.generated.ts

# Follow a run's events.jsonl live in the terminal.
tail-run run_id: build
    node packages/agent/dist/tail.js {{run_id}}

# Frame storage: usage against the 10 GB cap (runs refuse to start above 75%).
runs-disk: build
    node packages/agent/dist/runs-cli.js disk

# PB2 table for every run (or the named ones); fails when a run has no run_end.
runs-summary *run_ids: build
    node packages/agent/dist/runs-cli.js summary {{run_ids}}

# Decision-point probe: rebuild a recorded turn's exact context, flip switches (--switch <id>=on|off),
# and sample the next tool call K≤8 times per arm (--samples K, --context-only, --runs-root DIR, --model ID).
probe-decision run turn *flags: build
    node packages/agent/dist/probe-decision-cli.js {{quote(run)}} {{quote(turn)}} {{flags}}

# Delete the oldest frames until usage is at or below <percent> of the cap.
runs-prune percent: build
    node packages/agent/dist/runs-cli.js prune {{percent}}

# PokeBench viewer on 127.0.0.1 (port 8790 unless given, e.g. `just view "" 8799`): live runs follow events.jsonl, finished runs replay from frames/.
view run_id="" port="8790": build
    node packages/viewer/dist/cli.js --port {{quote(port)}} {{quote(run_id)}}

# Restart the long-lived viewer on 8790 from a clean worktree at main. Run after every merge, and
# always before a fixed-run launch check from a newer pin: a viewer built before the pin cannot read
# the new build's events (dist/build-stamp.json names the viewer's build).
viewer-main:
    scripts/viewer-main.sh

# Install the independent persisted-current projector at main (service-only restart).
current-main:
    scripts/current-main.sh install

# Rollback service lifecycle without deleting source recordings or derived caches.
current-stop:
    scripts/current-main.sh stop

# Opt-in Codex transcript/summary bridge. Build once first; never rebuild on each player decision.
[positional-arguments]
codex-capture *args:
    node packages/agent/dist/codex-capture-cli.js "$@"

# Serve local HTML deliverables (runs/mockups, plus reports, reviews, explainers) on 127.0.0.1:8791.
pages:
    scripts/pages.sh serve

# Fail if any given HTML page would make a network request when it loads.
pages-check +files:
    scripts/pages.sh check {{files}}

# Regenerate the Markdown twins of docs/explainers/*.html (docs/explainers/md/), the explainer
# index docs/explainers/README.md and the switch table docs/features.md. The HTML is the source.
explainer-twins:
    uv run --project env python -I -m pokebench_env.explainer_twins write

# Fail if any generated explainer twin, the index or docs/features.md differs from a fresh build.
explainer-twins-check:
    uv run --project env python -I -m pokebench_env.explainer_twins check

# Refresh the committed run-67d7 feature snapshot from that run's event log (docs/features.md column).
[positional-arguments]
explainer-twins-snapshot events:
    cd "{{invocation_directory()}}" && uv run --project "{{justfile_directory()}}/env" python -I -m pokebench_env.explainer_twins snapshot "$(realpath "$1")"

# Rebuild the README charts. `points` re-derives every plotted time and cost from the run logs
# (needs runs/) into docs/images/charts/chart-points.json; `html` redraws from that committed file
# alone. Either way the chart pages are rendered to docs/images/*.png. Inputs: chart-data.json, prices.json.
[positional-arguments]
readme-charts stage="points":
    case "$1" in points|html) ;; *) echo "error: unknown stage '$1'; usage: just readme-charts [points|html]" >&2; exit 2 ;; esac
    if [ "$1" = points ]; then uv run --project env python -I -m pokebench_env.readme_charts points; fi
    uv run --project env python -I -m pokebench_env.readme_charts html
    pnpm --filter @pokebench/viewer exec node scripts/readme-charts-png.mjs "{{justfile_directory()}}"

# Fail if chart-points.json no longer matches the run logs (needs runs/).
readme-charts-check:
    uv run --project env python -I -m pokebench_env.readme_charts check-points

# Replace viewer font URLs in the given pages with inline data: URIs.
pages-inline-fonts +files:
    scripts/pages.sh inline-fonts {{files}}

# Give the given pages the Emerald PokéNav theme (docs/design/emerald-pages.css), in place; re-run after regenerating.
pages-theme +files:
    scripts/pages.sh theme {{files}}

# Claude <-> Codex mail and the landing board (skills: talk-to-codex, talk-to-claude).
# State lives in the main checkout's runs/agent-mail/, shared by every worktree.
[positional-arguments]
tell-claude *args:
    uv run --project env python -m pokebench_env.agent_mail tell-claude "$@"

[positional-arguments]
claude-mailbox *args:
    uv run --project env python -m pokebench_env.agent_mail claude-mailbox "$@"

# The Codex coordinator thread listens here and forwards letters to Codex threads mid-turn.
[positional-arguments]
codex-mailbox *args:
    uv run --project env python -m pokebench_env.agent_mail claude-mailbox --for codex-coordinator --hold "$@"

# LLM-free: sleeps on the Codex coordinator's mailbox and queues one wake into that idle thread
# when letters arrive. Start it once, detached; it holds no model and does not poll.
[positional-arguments]
codex-wake-watch thread:
    uv run --project env python -m pokebench_env.agent_mail mailbox-watch --for codex-coordinator --wake-codex "$1"

# Archives (never deletes) mailboxes of branches no worktree has checked out: no one reads them.
# Moves runs/agent-mail/to/<box>/ to runs/agent-mail/archive/<UTC date>/<box>/. Try --dry-run first.
[positional-arguments]
mail-archive *args:
    uv run --project env python -m pokebench_env.agent_mail archive-boxes "$@"

[positional-arguments]
codex-mailbox-done *args:
    uv run --project env python -m pokebench_env.agent_mail mailbox-done --for codex-coordinator "$@"

[positional-arguments]
tell-codex *words:
    uv run --project env python -m pokebench_env.agent_mail tell-codex "$@"

[positional-arguments]
codex-sessions *args:
    uv run --project env python -m pokebench_env.agent_mail codex-sessions "$@"

land-board:
    uv run --project env python -m pokebench_env.agent_mail land-board

[positional-arguments]
land-join *args:
    uv run --project env python -m pokebench_env.agent_mail land-join "$@"

[positional-arguments]
land-done *args:
    uv run --project env python -m pokebench_env.agent_mail land-done "$@"

[positional-arguments]
land-move *args:
    uv run --project env python -m pokebench_env.agent_mail land-move "$@"

# LLM-free: moves number 1 to the back 30 minutes after it took the slot, if anyone waits; checks each minute.
land-keeper:
    uv run --project env python -m pokebench_env.agent_mail land-keeper

# Remove one run from results, with a required reason. Aborted and stopped runs count by default; this is
# the only exclusion. Writes runs/exclusions/<run-id>.json in the main checkout; the run log is untouched.
[positional-arguments]
exclude-run run operator +reason: build
    node packages/viewer/dist/run-exclusions.js "$@"

# List runs whose run_start names an experiment (evaluation.experiment) but that no internal
# provenance mapping holds. Read-only on the main checkout's runs/; prints nothing and exits 0 when complete.
experiments-audit: build
    node packages/viewer/dist/experiments-audit.js

# Fixed-N two-arm, two-lane experiments (experiments/fixed/<id>.json): plan, check, run,
# dry-run, rerun, status, analyze, analyze-receipt.
# After a merge to main, run `just viewer-main` before launching from the newer pin.
fixed-run *args: build
    node packages/viewer/dist/fixed-cli.js {{args}}

# Render a stretch of a run as video through the /broadcast page. --game-video names a recorder folder;
# its picture and sound go under the page, retimed onto the run's wall clock by the sync marks.
[positional-arguments]
broadcast-render *args: build
    nice -n 10 node packages/viewer/dist/broadcast-render-cli.js "$@"

# One spoken line per turn, voiced with Kokoro, into runs/broadcast/<run>/ (or --out); --follow tails a live run. Needs a local
# OpenAI-style --endpoint, or --writer claude --claude-model <id> for batches written by headless claude -p.
# --voice/--lang/--speed pick the Kokoro voice; --lines-only and --voice-only split writing from voicing.
# Kokoro's two model files come from $KOKORO_MODELS or ~/.cache/pokebench/kokoro.
[positional-arguments]
broadcast-commentary *args:
    PYTHONPATH="$PWD/env" nice -n 10 uv run --project env --with kokoro-onnx python -m pokebench_env.broadcast_commentary "$@"

# Manual validation probes are recorded like runs, excluded from benchmark results.
# stdin accepts {"action":"observe"}, {"action":"press","buttons":["A"]}, {"action":"end"}.
probe saved="": build
    node packages/agent/dist/live.js probe {{quote(saved)}}

# Fresh-ROM state gate, recorded in the viewer as a non-benchmark probe.
verify-state: build
    node packages/agent/dist/live.js verify-state

# Human play at 1x, recorded on an isolated server; open printed /play URL.
run-human: build
    node packages/agent/dist/live.js human

# Operator-approved adaptive Roxanne campaign; check is read-only, run requires frozen clearance.
roxanne-campaign *args: build
    node scripts/run-roxanne-campaign.mjs {{args}}

# Approved trainer-card visuals and protection checks (headless; art stays outside Git).
trainer-card-check:
    pnpm -r build
    python3 scripts/test_trainer_card_design_guard.py
    pnpm --filter @pokebench/viewer exec playwright test -c design-tests/playwright.config.mjs
