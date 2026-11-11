# Setup preflight and project docs (2026-11-11)

Branch `claude/setup-preflight-docs`. Approved by the operator: setup/verify/explainers proposal items 4, 6-9, 11, 12. Not to be pushed; landing needs the operator's own OK.

## M1: everything in one commit

- [x] `.env.example`: every env var the code reads, placeholders only; `.gitignore` un-ignores it
- [x] `just doctor [core|game|model]`: `env/pokebench_env/doctor.py`, probes injected; `rom.resolve_rom` takes injected disk callables
- [x] `env/tests/env/test_doctor.py`: no I/O; doctor.py and rom.py at 100% lines and branches
- [x] README: supported platforms, three check tiers, cost and hardware, results table, agent files line
- [x] `docs/results.md`: five runs, facts from each run's events.jsonl
- [x] `CONTRIBUTING.md`, `SECURITY.md`
- [x] Linux-trial additions (coordinator relay): doctor checks `just`, corepack-pinned pnpm, cmake, a C toolchain, FFmpeg/libpng headers (pkg-config on Linux, never brew), fixes name brew and apt packages; README Setup section with prerequisites, `--recurse-submodules`, ordered steps
- [x] gates on the final tree: `just lint` exit 0; `just test` exit 0 (agent 3038, viewer 1276, env 3233, gateway 39; floors held); doctor.py and rom.py 100% lines and branches
- [x] `just doctor` on this Mac: 16 passed, 0 failed, 2 skipped (model endpoint unset), exit 0
- [x] privacy scan over the diff: clean (only the operator handle, as elsewhere in docs)
- [ ] README charts: v2 redone in the article's chart style with every model's best run (power-on or main-menu starts, Opus chain stitched at checkpoints); waiting for the operator's OK before committing
- [x] docs/results.md: added the 13 best runs behind the charts (5f0f, 429f, 9f4c, 3300, the Opus chain 6302/1121/69d8/d718, 3bb0, d41e, 6056, 7da5, 6bbd)
- [x] COMMIT: `feat(setup): just doctor preflight, .env.example and project docs` (39b9b2d24)
- [x] COMMIT: `docs(results): add every model's best run behind the README charts` (e4147afdb)
- [x] pnpm setup on Node 25+: corepack is no longer bundled, so README and `just doctor`'s fix say `npm install -g corepack`, then `corepack enable pnpm`; test_doctor 32 passed, ruff and mypy clean on the touched files
- [x] COMMIT: `fix(setup): install corepack before enabling pnpm on Node 25+` (07574e8f0)
- [x] Codex review review-setup-preflight-docs-39b9b2d24 round 1: CHANGES, 4 findings. (1) corepack not bundled: fixed in 07574e8f0. (2) malformed endpoint URLs crashed urlparse: doctor now FAILs them. (3) .env.example gained POKEBENCH_RUNS and PREPARE_LOCK. (4) `just doctor` runs python -B, so it writes no bytecode. test_doctor 33 passed; ruff, ruff format and mypy clean on touched files
- [ ] Codex round 2 on 39b9b2d24..HEAD

Follow-ups from the Linux trial, out of scope here: an isMain() helper for import.meta.main; .npmrc engine-strict and .node-version; a Linux branch in build-mgba.sh; mypy ignore codes that depend on the mGBA build; smoke.py hiding server stderr; the verify_release hint naming a nonexistent `just replay-verify`; a port parameter for `just view`; build-stamp not writing dist/build-stamp.json.

