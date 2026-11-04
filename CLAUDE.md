# CLAUDE.md

Project rules for PokeBench. Inherits `~/.claude/CLAUDE.md` (global). Where they differ, this file wins.

## Project skills

PokeBench-specific skills live in this repository under `.claude/skills/`; `.agents/skills/` provides repository-relative discovery links for Codex. Create and update project skills here, including their scripts and references, rather than in a personal global skills folder.

## What this is

A benchmark harness that measures how far local vision-language models get in Pokémon Emerald when given a specialized harness: first gym quickly, then the full game.

- `packages/agent`: TypeScript agent on pi (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`). Talks to the local-inference-stack gateway (`http://inference.example/v1`) and to the game server.
- `env/`: Python environment.
  - `pokebench_env` is our code: ROM resolution, server launcher, vendor check, typed client.
  - `pokebench_gates` owns the per-metric Python coverage gate.
  - `env/vendor/continual-harness` is the PokéAgent starter kit, a git submodule pinned and **unmodified**.
- `scripts/build-mgba.sh`: native arm64 mGBA 0.10.5 build plus its Python binding into env/.venv (Homebrew: cmake, ffmpeg, libpng).

Read the active worklog first: `WORKLOG.md` (a gitignored pointer) → `docs/worklogs/active/<date>_<slug>.md`.

Before saying any change is done, fixed, merged, live, launched or ready to pick, prove it at the surface the operator will use with `.claude/skills/close-the-loop/SKILL.md`: tests for code, real-browser clicks and opened desktop and phone screenshots for viewer pages and mockups, a fake-data rehearsal for runners, schedules and launches, and the applicable post-merge check (live proof for served-viewer/runtime or run-build-compatibility changes).

When adding or changing agent diagnostics, loop guards, recovery feedback or completion evidence, use `.claude/skills/agent-observability/SKILL.md` to verify recorded events, model delivery where relevant, timeline, Activity History and replay.

Before designing or driving a fixed-run cohort, design it with `.claude/skills/pokebench-experiment-design/SKILL.md`. It sets the tier, a checkpoint start, a power-sized fixed N within the operator's GPU-hour budget, and writes an HTML overview at `docs/experiments/<id>.html`. To explain why recorded runs stalled or failed, use `.claude/skills/pokebench-trace-forensics/SKILL.md`, which is read-only. To analyze the top runs of a night or cohort and what helped or hurt, use `.claude/skills/run-analysis/SKILL.md`, which is read-only and writes an HTML report.

To launch, restart or stop a fixed-N experiment (`just fixed-run`), use `.claude/skills/fixed-run-launch/SKILL.md`. A launch is not done until its run cards show live and open the correct frames in the viewer. Any merge to main followed by a fixed-run launch from the newer pin needs `just viewer-main` before the launch check: a viewer built before the pin cannot read the new build's events, and a run it cannot read shows the problem "viewer build … is older than this run's build …: restart the viewer (just viewer-main)".

**Long-lived processes are never LLM-owned (operator 2026-11-01).** Gameplay (`live.js play`), fixed-run runners, the served viewer, and model proxies must outlive Cursor/Claude/Codex restarts. Use `.claude/skills/detached-long-lived-processes/SKILL.md`: `nohup` + logs + pid + `disown` with a launching shell that returns immediately. Forbidden: Cursor/agent background terminals (`block_until_ms: 0`, `run_in_background`, lingering `exec`) as the process owner — that pattern aborted a live DeepSeek control run on Cursor restart.

For viewer navigation, playback or polling interaction changes, use `.claude/skills/viewer-e2e/SKILL.md` and verify the real click through to the selected run and visible frame before claiming it works.

Browser verification must preserve the operator's desktop focus (operator decision 2026-10-22). Use an agent-owned headless browser or a documented background context. Do not activate apps/windows/tabs, use desktop mouse/keyboard input, or open screenshot files in desktop apps for routine verification. If the available tool cannot guarantee background operation, leave that check pending and report the limitation; do not take focus to satisfy a proof requirement. A request to test, land or verify is not permission to take focus. Explicit requests to show or interact with a foreground surface authorize only that operation. Follow `.claude/skills/viewer-e2e/SKILL.md` and pass this boundary to every subagent.

The viewer's timeline (the TIMELINE swimlanes) is closed to additions. Never add new marks, lanes, labels or colors for new kinds of events to it without the operator's explicit permission (operator decision 2026-10-16). New diagnostics go to Activity History and the raw-event inspector. Fixing how an existing mark is drawn is still fine.

## Project overrides of the global rules

- **Coverage floors are set where coverage landed after the no-I/O test cleanup** (operator decision 2026-11-04): vitest thresholds for agent (lines 63, branches 54, functions 57, statements 58) and viewer (lines 36, branches 39, functions 40, statements 35), and the `--min` of `pokebench_gates.coverage_gate` in `just test` for env (69) and the Claude gateway (22). Never lower a floor further or widen excludes to pass.
- **Vendored env:** `env/vendor/continual-harness` is excluded from coverage only while it is the pinned SHA with a clean tree (`just verify-vendor`). Changing its behavior means writing pokebench-owned, covered code. A fork brings it into coverage.
- **Principles rubric:** the principles self-review scores `docs/agent-principles.md` (PB1–PB13, operator-approved 2026-10-11). Agents may propose additions; only the operator approves them.
- **Deploy:** none. This is a local research tool. Milestones stop for operator review where the worklog says so.

## Non-negotiables

- **The ROM never enters git.**
  - It is referenced only via `POKEBENCH_ROM`.
  - It is symlinked into each run's server dir (`runs/<id>/server/Emerald-GBAdvance/rom.gba`), never copied.
  - The pre-commit hook rejects staged `.gba/.gb/.gbc/.sav/.ssN/.state` files.
- **No test does I/O** (operator decision 2026-11-04). The guards (`packages/agent/test-support/no-io.ts`, `pokebench_gates.no_io_guard`) fail any Vitest or pytest test that touches disk, a process, the network, DNS, fetch, sockets or a worker, or that creates more than one event loop. The only allowances: asyncio's self-pipe, and in pytest only, reads made by Python application modules while they are imported (Vitest has no such allowance). A test that fails the guard is deleted, never exempted; exceptions need the operator's approval first. `just no-io-proof` proves the guards still bite.
- **New code is built for dependency injection.** Disk, processes, network, clocks and sockets arrive as injected dependencies behind a thin entrypoint, so the logic is tested in memory with fakes. Do not write code that can only be tested by touching the real thing.
- **Worklog update per commit** is enforced by `.githooks/pre-commit`. Run `just setup` once per clone. `--no-verify` is forbidden.
- **RED → GREEN → multi-model review** per milestone. The review contract is `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md`.
- **Concrete types:** no `any`. Validate JSON from the gateway and the game server into typed values.
- **No hardcoded model SKUs.** Model ids come from gateway discovery and config.
- **Argv lists only** for subprocesses. Paths are untrusted; the real ROM path contains spaces and parentheses.
- Servers bind `127.0.0.1`. The vendor server hardcodes `0.0.0.0`; `pokebench_env.serve` pins the host without modifying vendor code.
- The viewer answers only loopback hosts plus the https origins in `POKEBENCH_VIEWER_ORIGINS` (gitignored `.env`). Tailscale Serve publishes it at `https://viewer.example.ts.net:8447/` for the local inference stack portal card; it never binds anything but `127.0.0.1`.
- **Every run is isolated (INV-7).** Each game server runs from its own `runs/<id>/server/` cwd with its own `RUN_DATA_ID` and `LOAD_CHECKPOINT_MODE=false`. Never point two runs at one server or one run dir.
- **Long-lived processes are detached (operator 2026-11-01).** Runs, fixed-run runners, lasting viewers, and proxies must not be owned by an LLM/agent terminal session. See `.claude/skills/detached-long-lived-processes/SKILL.md`.
- Never run formatters or linters over `env/vendor/`. ruff excludes it; `just verify-vendor` catches drift.
- The ROM lives at `~/.roms/pokemon-emerald.gba` (operator decision 2026-10-11), set as `POKEBENCH_ROM` in the gitignored `.env`. It is outside macOS TCC-protected folders, so background contexts can read it. Never point `POKEBENCH_ROM` back at `~/Downloads`.

## Commands

```bash
just setup          # enable .githooks, install deps
just test           # every vitest + pytest suite once, under the no-I/O guards, coverage-instrumented; fails under each suite's floor
just coverage       # the same single pass as just test (never run both)
just no-io-proof    # proof suites: only pure tests may pass, so a weakened guard fails
just trainer-card-check  # protected trainer-card design check; real browser and disk, so not part of just test
just lint           # tsc --noEmit, eslint, ruff, mypy
just build          # tsc build
just build-mgba     # native mGBA + Python binding into env/.venv (once per clone)
just verify-rom     # SHA-1 check of $POKEBENCH_ROM (set it in the gitignored .env)
just verify-vendor  # submodule at pin, clean tree
just serve          # isolated game server (runs/serve_<time>/) on 127.0.0.1:8000; watch at /stream
just smoke          # boots the real game server on the real ROM and exercises it
just exclude-run <run> <operator> <reason…>  # the only way a run leaves results; aborted runs count by default
just viewer-main    # authorized 8790 refresh for served-runtime/compatibility changes; before a fixed-run launch check from a newer pin
```

## Git

The commit author for this repo is `aorobator <orobator.andrew@gmail.com>`, set in the local git config.

The repo is local only (operator decision 2026-10-14). It has no remote. Never push, never open pull requests, never add a remote. Work on a branch in its own worktree; landing means a local merge into `main`.

Claude threads and Codex sessions both land on local `main`, so the landing board is the one queue for both (operator decision 2026-10-21). Run `just land-join` before merging, merge only while you are number 1, and run `just land-done` after the evidence commit. Claude talks to Codex with `just tell-codex`. Codex talks to Claude with `just tell-claude`, which a Mac Claude thread running `just claude-mailbox` receives and relays to the coordinator. Use `.claude/skills/talk-to-codex/SKILL.md`; Codex uses `.claude/skills/talk-to-claude/SKILL.md`. Messaging Codex sessions is always allowed, in any thread (operator standing approval 2026-10-21). A Codex coordinator thread (`.claude/skills/codex-coordinator/SKILL.md`) listens on `just codex-mailbox` and forwards Claude's letters into Codex threads mid-turn; `just tell-codex` uses it whenever it is listening.

An agent may merge its own branch into local `main` once cloud code review approves it (operator decision 2026-10-16). The full gate is in `.claude/skills/execute-worklog/SKILL.md` under "Landing on main":

- Gates pass, and the Claude, Grok and GPT/Codex lanes of the review loop (`~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md`) each return `VERDICT: LGTM` on the frozen feature packet plus any required integration-delta review, per `execute-worklog`.
- Review records an immutable base/head/diff. Land fast-forward only (`git merge --ff-only`); if `main` advances, apply the evidence-reuse and upstream-impact rules in `execute-worklog` rather than automatically restarting review.
- Local inference reviewers (`think_fast`, `think_swarm`, anything on `inference.example`) are never used in PokeBench reviews (operator decision 2026-10-16: they are the models under benchmark, and noisy as reviewers) and never count toward merge approval.
- A missing or blocked cloud lane means no self-merge; ask the operator.
- Report each merge SHA in the thread.

The rule never covers pushing, pull requests, approving or launching experiments, or merges the operator has said to hold.

## Bounded landing workflow (operator request 2026-10-28)

`.claude/skills/execute-worklog/SKILL.md` owns gate selection and moving-main evidence reuse; `feature-worklog` owns milestone sizing. These local rules override conflicting inherited workflow instructions.

- Do not hold `main` still for review. Preserve frozen review identity; classify upstream changes before deciding what to rerun. Unchanged feature changes and unaffected contracts retain their reviews and expensive evidence. A new main SHA alone is not a reason to restart readiness.
- Pass cheap checks for the changed scope before requesting a full-gate CPU window. Inspect recipe prerequisites; a command that implicitly builds belongs in the CPU request too. CPU START/RELEASE is coordinated through `just tell-claude`; focused single-file checks do not reserve the full-gate window.
- Plan source implementation, landing and activation as separate stages. The final rollout stage introduces no feature code; a discovered bug returns to a bounded source correction. Report committed, reviewed, landed and live separately.
- Documentation/skill prose-only changes use documentation validation and independent review, without application build/lint/coverage, emulator/browser proof or viewer refresh. Executable scripts, build/configuration changes, generated runtime inputs and runtime/program behavior changes do not qualify.

## Retired experiment queue

The experiment queue was removed on 2026-10-22. Do not create pending queue entries, register switches in `experiments/*.json`, use the deleted queue skill or commands, or require an EXPERIMENT dropdown. Older worklogs and explainers may describe that retired workflow; those passages are historical records, not current agent instructions. Record evaluation plans and readiness in the matching worklog, and use operator-approved fixed-run definitions under `experiments/fixed/` with `.claude/skills/fixed-run-launch/SKILL.md`. Recorded experiment metadata and read-only legacy ledgers remain valid historical provenance.

## Attached harness transcripts and thinking

Operator decision, 2026-10-25: when attaching Codex, Claude Code, Cursor or another agent harness to PokeBench, preserve its complete available native transcript and every exposed thinking/reasoning block. Follow the attachment preflight in `.claude/skills/pokebench-run-coordination/SKILL.md` even for CPU-only diagnostic play through a file-backed bridge. A short action explanation is not a thinking trace. Enable supported reasoning summaries before the first player turn, prove capture with a rehearsal, and record unavailable/private reasoning explicitly. Bind the archived source records to bridge requests and game turns so analysis and possible smaller-model training can recover what the player saw, decided and executed. This is a capture requirement for new attachments; it does not authorize interrupting an active run, changing its prompts or rewriting its historical recording.

## Feature switches

Every harness behavior change ships behind a registered switch whose OFF state is the previous behavior, so it can be A/B tested with fixed-run tooling. Use `.claude/skills/feature-switch/SKILL.md`.

Adding, renaming, removing or re-gating a model tool updates its system-prompt section in the same change (the operator 2026-10-21). Use `.claude/skills/tool-prompt-sync/SKILL.md`.

## Explainers

Every new feature or switch gets an explainer page with diagrams. Use `.claude/skills/feature-explainer/SKILL.md`. Explainers stay local: no claude.ai artifacts or hosted preview links.

Every HTML deliverable (explainer, UI mockup, report, review, gallery or index page) stays on this Mac and reaches the operator as a working local link. Operator decision 2026-10-16: cloud copies are external links, not local files.

- **Zero network requests.** Inline CSS, SVG and scripts. Fonts come from system stacks or `just pages-inline-fonts <file>`, never `http://127.0.0.1:8790/fonts/...`, a CDN or a path outside the served folder. Run `just pages-check <files>` before linking; it must print nothing.
- **Pokémon theme by default.** Every explainer, report, review and experiment overview wears the Emerald PokéNav theme (`docs/design/emerald-pages.css`): striped viewer-blue background, navy POKéBENCH bar, the page inside a red PokéNav frame, pixel-font headings and Emerald text-window cards. Write the page with plain semantic HTML (`main`, `h1`–`h4`, `.card`, `.kpi`, `table`, `details`) and run `just pages-theme <files>` after writing or regenerating it, before `just pages-check`. The theme pins one light palette, the same on desktop and phone; never add solid side-stripe accents. UI mockups of the viewer itself are exempt.
- **Serve it locally.** `just pages` serves `runs/mockups/` at `http://127.0.0.1:8791/` and exposes `runs/reports/`, `runs/reviews/`, `docs/explainers/` and `docs/experiments/` under it by the same names. Put mockups in `runs/mockups/<slug>/`. A page that exists only in a worktree is copied to `runs/mockups/<slug>/` before linking.
- **Link it.** Write `[Name](http://127.0.0.1:8791/<path>)` in the reply, one link per page, and check each returns 200 first. Add the `open ~/dev/pokebench/<path>.html` fallback after the links, never instead.
- **Never use `SendUserFile`, `/mnt/project-files` or `attached_outputs`** for HTML pages, and never claude.ai artifacts or other hosted previews. Markdown or data files may still go through `SendUserFile`.

## Protected trainer-card design

Operator decision 2026-10-24: the October 21 trainer cards are the approved design. Follow `docs/design/trainer-cards/README.md`. Changing their appearance or displayed identity, protected assertions, fixtures or visual baselines requires the operator's explicit approval for that change. Queue cleanup and reviewer suggestions do not grant it. Preserve the experiment tab, arm type badge, trial line, sprites, six slots, bars, tier and milestone state. Run `just trainer-card-check` on viewer presentation changes; do not update baselines to silence a failure. The pre-commit approval guard binds protected staged changes to a new recorded approval.

Trainer sprites: GPU-qualified identity hashes GPU + experiment + experiment arm, in that order. Resolve collisions across all current cards, including different experiments, while preserving the legacy no-GPU choices. Sprite changes and their protected baselines require the same explicit operator approval.
