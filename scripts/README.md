# scripts

Helper programs that sit outside the agent, viewer and environment packages; most are run through a `just` recipe in the [justfile](../justfile).

"ROM" below means the user's own Pokémon Emerald ROM, given by `POKEBENCH_ROM`; it is read, never copied into the repo. "Decomp" means a local checkout of the pret/pokeemerald disassembly.

## Build and setup

- [`build-mgba.sh`](build-mgba.sh): builds mGBA 0.10.5 from source and installs its Python binding into `env/.venv`; macOS arm64 or Linux x86_64. `just build-mgba`. Needs network (clones mGBA) and cmake, FFmpeg and libpng.

## Tests and guards

- [`no-io-proof.py`](no-io-proof.py) with [`no-io-proof/`](no-io-proof/): proves the no-I/O test guards still fail tests that touch disk, processes or the network; only the listed pure tests may pass. `just no-io-proof` (also the last step of `just test`).
- [`check-trainer-card-design.py`](check-trainer-card-design.py): refuses staged changes to the protected trainer-card design unless a matching approval receipt is staged. Run by `.githooks/pre-commit`.
- [`test_trainer_card_design_guard.py`](test_trainer_card_design_guard.py): tests that guard in throwaway git repos. `just trainer-card-check`.

## Code and data generation

- [`map-observation-schema.py`](map-observation-schema.py): generates the TypeScript and Python map-observation types from [`schemas/map-observation-v1.json`](../schemas/map-observation-v1.json); `--check` fails when they are stale. Run directly.
- [`curriculum/generate-guide.py`](curriculum/generate-guide.py): builds `packages/agent/src/rayquaza-guide-data.ts` from `docs/curriculum/rayquaza-guide-*.md`. Run directly.
- [`objective-graph-edges.mjs`](objective-graph-edges.mjs): regenerates the edge list in `docs/designs/objective-graph-v1.edges.json` from the shipped module. `node scripts/objective-graph-edges.mjs`.
- [`build-interaction-names.py`](build-interaction-names.py): rebuilds the sign-script name catalog from decomp map data; needs the verified ROM (output holds digests, not ROM bytes).
- [`build-instruction-memory-junk.py`](build-instruction-memory-junk.py): generates junk-filter labels and signal word lists for instruction memory from decomp text only.

## Viewer art (ROM and decomp)

Each checks every asset against the ROM and writes ROM-derived output under the gitignored `runs/` only.

- [`trainer-card/build_art.py`](trainer-card/build_art.py): run-card art. `just trainer-card-art`.
- [`trainer-card/build_page_art.py`](trainer-card/build_page_art.py): TRAINER CARD page art and gym table. `just trainer-page-art`.
- [`bag-art/build_bag_art.py`](bag-art/build_bag_art.py): BAG page item icons. `just bag-art`.
- [`party-art/build_party_art.py`](party-art/build_party_art.py): POKéMON PARTY page art and species/move tables. `just party-art`.

## Model gateway

- [`claude-gateway/`](claude-gateway/): an OpenAI-compatible endpoint that answers harness turns with headless Claude Code (`claude -p`). `claude_gateway.py` is the server (`just claude-gateway`), `replay.py` replays recorded requests with a spend cap (`just claude-gateway-replay`), `preflight.py` checks prompt delivery with no model calls (`just gateway-preflight`); `fake_claude.py`, `conftest.py` and `test_claude_gateway.py` are its tests. Needs the Claude Code CLI and network for real calls.

## Runs and the viewer

- [`run-claim.mjs`](run-claim.mjs): says whether a live run owns a pid or port before anything is killed or reused. `just run-claims`.
- [`run-control.mjs`](run-control.mjs): asks a live run to pause, resume, stop, cancel a stop or abort, through its control file. `just run-control <id> <action>`.
- [`viewer-main.sh`](viewer-main.sh): builds main and refreshes the long-lived viewer and the current-state projector. `just viewer-main`.
- [`viewer-restart.sh`](viewer-restart.sh): restarts the viewer on a loopback port without stopping runs; fails if a run died. Called by `viewer-main.sh`.
- [`current-main.sh`](current-main.sh): installs or stops the current-state projector service. `just current-main`, `just current-stop`.
- [`pages.sh`](pages.sh): serves local HTML pages on loopback, checks that pages make no network requests, inlines fonts and applies the page theme. `just pages`, `just pages-check`, `just pages-inline-fonts`, `just pages-theme`.
- [`recording-backup.sh`](recording-backup.sh): copies a run's finished recording files and new events to a backup folder at low priority. Started by the run launch tooling.

## Long-running loops (operator tooling)

- [`whole-map-loop.sh`](whole-map-loop.sh): detached loop that starts one trial at a time from the latest main; stop and pause files control new starts. Needs a model lane and the ROM.
- [`glm-loop.sh`](glm-loop.sh): wraps `whole-map-loop.sh` for serial four-hour bundle/control pairs of `glm53-flash-4h`.

## Offline audits and analysis (read recorded runs; no model or GPU)

- [`audit-milestone-memory.mjs`](audit-milestone-memory.mjs): replays recorded run prefixes through old and new instruction memory and compares them.
- [`objective-graph-rescore.mjs`](objective-graph-rescore.mjs): rescores every recorded run by objective-graph depth and writes `docs/findings/objective-graph-rescore.md`.
- [`audit-terrain.py`](audit-terrain.py): counts unusual terrain on every map; needs the ROM and decomp, never starts a game.
- [`whole_game_report.py`](whole_game_report.py): renders the whole-game section of the instruction-memory report from saved check receipts.
- [`profile-scene-capture.py`](profile-scene-capture.py): CPU-only timing profile of the scene recorder on saved checkpoints; needs the ROM and mGBA.

## Roxanne campaign (first-gym checkpoint study)

- [`run-roxanne-campaign.mjs`](run-roxanne-campaign.mjs): runs or checks an approved adaptive campaign from a frozen definition. `just roxanne-campaign check|run <definition>`. `run` needs model lanes and the ROM.
- [`audit-roxanne.py`](audit-roxanne.py), [`backfill-roxanne.mjs`](backfill-roxanne.mjs): inventory recorded runs for first Roxanne interactions and reduce that inventory, read-only.
- [`qualify-roxanne-checkpoint.py`](qualify-roxanne-checkpoint.py), [`verify-roxanne-restores.py`](verify-roxanne-restores.py): replay recorded inputs in mGBA on CPU and verify restored checkpoints; need the ROM.
- [`qualify-roxanne-history.mjs`](qualify-roxanne-history.mjs), [`qualify-roxanne-continuation.mjs`](qualify-roxanne-continuation.mjs), [`qualify-roxanne-heldout.mjs`](qualify-roxanne-heldout.mjs): check restored conversation history, continuation context and held-out eligibility on disk; no model calls (`heldout` needs the ROM).
- [`rehearse-roxanne-live.mjs`](rehearse-roxanne-live.mjs): rehearses a live continuation against a local stub model; needs the ROM.
