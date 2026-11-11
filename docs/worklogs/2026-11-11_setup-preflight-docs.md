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
- [x] README charts: v5 approved by the operator 2026-11-11 ("ok v5"): badges over time through the Elite Four, Champion and Hall of Fame, and badges for the money (one point per model, furthest milestone vs cost). Every point audited against raw events; Opus chain stitched at checkpoints (Rain 13:04:50, Glacia 16:21:51); local prices as in the article, marked estimated
- [x] docs/results.md: added the 13 best runs behind the charts (5f0f, 429f, 9f4c, 3300, the Opus chain 6302/1121/69d8/d718, 3bb0, d41e, 6056, 7da5, 6bbd)
- [x] COMMIT: `feat(setup): just doctor preflight, .env.example and project docs` (39b9b2d24)
- [x] COMMIT: `docs(results): add every model's best run behind the README charts` (e4147afdb)
- [x] pnpm setup on Node 25+: corepack is no longer bundled, so README and `just doctor`'s fix say `npm install -g corepack`, then `corepack enable pnpm`; test_doctor 32 passed, ruff and mypy clean on the touched files
- [x] COMMIT: `fix(setup): install corepack before enabling pnpm on Node 25+` (07574e8f0)
- [x] Codex review review-setup-preflight-docs-39b9b2d24 round 1: CHANGES, 4 findings. (1) corepack not bundled: fixed in 07574e8f0. (2) malformed endpoint URLs crashed urlparse: doctor now FAILs them. (3) .env.example gained POKEBENCH_RUNS and PREPARE_LOCK. (4) `just doctor` runs python -B, so it writes no bytecode. test_doctor 33 passed; ruff, ruff format and mypy clean on touched files
- [x] COMMIT: `fix(doctor): fail malformed endpoint URLs, write no bytecode, list two env vars` (e997617be)
- [x] Codex round 2 (review-setup-preflight-docs-e997617be): CHANGES. Round-1 findings all resolved; two ledger findings: d718 started in Cave of Origin B1F after the Wallace discussion, not at Sky Pillar; Budget cells now list every recorded operator extension (429f, 1121, d718, and d41e by the same check), and 429f's unrecorded turn-limit raise is marked as such
- [x] COMMIT: `docs(results): correct the d718 start and list every recorded budget extension` (5dc310e25)
- [x] Codex round 3 (review-setup-preflight-docs-5dc310e25): VERDICT: LGTM, no findings

Follow-ups from the Linux trial, out of scope here: an isMain() helper for import.meta.main; .npmrc engine-strict and .node-version; a Linux branch in build-mgba.sh; mypy ignore codes that depend on the mGBA build; smoke.py hiding server stderr; the verify_release hint naming a nonexistent `just replay-verify`; a port parameter for `just view`; build-stamp not writing dist/build-stamp.json.

- [x] COMMIT: `docs(readme): add the badges-over-time and badges-for-the-money charts` (2b6f36339)
- [x] Chart generator committed (docs/images/charts/build_charts.py, audit_runs.py); regenerating gives byte-identical PNGs; ruff check and format clean; privacy grep over the diff clean
- [x] COMMIT: `docs(charts): add the README chart generator and its run audit` (rebased; was d90a9d033)
- [x] Rebased onto main 640ba5c74 (linux-mgba-build and node-version-guards landed); none of this branch was on main; no conflicts
- [x] Linux tested: doctor PASSes Linux x86_64 (Ubuntu 24.04, 2026-11-11), SKIPs other Linux arches, drops "untested platform" and "macOS-only" wording; README takes the deferred README edits from claude/linux-mgba-build-on-setup-docs and claude/node-version-guards-on-setup-docs (corepack row kept); test_doctor 34 passed (4 RED first)
- [x] Full gates on 9a310051c (Mac): just lint clean; just test green: agent 3042, viewer 1276, env 3292 (lines 83.15% vs floor 69), claude-gateway 39 (lines 46.25% vs floor 22)
- [x] COMMIT: `feat(doctor): Linux x86_64 is tested on Ubuntu 24.04` (9a310051c)
- [x] Codex review-setup-preflight-docs-9a310051c: CHANGES. (1) build_charts.py used 3.12-only f-string quote nesting: fixed, ast-parses on env/.venv Python 3.11, regenerated PNGs byte-identical. (2) audit_runs.py missed League and checkpoint milestones: rewritten to print first-observed badges, Elite Four, Wallace and game clear, and to stitch chains (6302+1121+69d8+d718) at the checkpoint each next leg loaded; output matches every plotted point (67d7 Sidney/Drake differ by 1 s: audit rounds, chart truncates). No unit tests: both scripts sit outside the test roots and read runs/ directly
- [x] COMMIT: `fix(charts): parse on Python 3.11 and audit the League and chain stitching` (56e639c12)
- [x] Codex review-setup-preflight-docs-56e639c12: VERDICT: LGTM (PNGs pixel-identical on 3.11, audit reproduces every plotted point; 1 s rounding note only)
- [x] docs/images/charts/COSTS.md: provenance of every plotted dollar figure; local-model figures marked as copied from the article and not reproducible from disk
- [x] Claude lane (claude -p, ~/.claude-review, plan mode) on 640ba5c74..5df0de1ca, packet sha256 4ddffbee…6045043: CHANGES. (1) Linux pkg-config probe used env/.venv/bin/pkg-config (PyPI pkgconf) when the venv is on PATH, false-FAILing ffmpeg/libpng: doctor now picks the first pkg-config on PATH outside env/.venv, as build-mgba.sh does (2 RED tests first). (2) justfile no-python3 fallback suggested brew on Linux: now names both platforms. test_doctor 35 passed; ruff, format, mypy clean. Grok lane unavailable until 11/17 (recorded, the operator said land it)
- [x] Claude lane round 2 on 5df0de1ca..99b2bf8ce: LGTM
- [x] COSTS.md local section corrected (coordinator, from the operator 11/9 choice): basis is the cheapest OpenRouter provider per model; Qwen3.6 fp8 host $0.011/$0.101 per M recomputes d41e to $3.01 (article $2.94); GLM and Qwen3.8 rates not recorded, figures are the article's; re-priced column removed
- [x] Claude lane round 3 on 99b2bf8ce..39af55d4f: CHANGES, one finding (operator handle in COSTS.md); now "operator"
- [x] Claude lane round 4 on 39af55d4f..8814ca0ab: LGTM. Ready to land: Codex (GPT) LGTM through 56e639c12, Claude LGTM through 8814ca0ab, Grok unavailable until 11/17; The operator: "land it"
- [x] LANDED on local main by fast-forward 640ba5c74 -> 2c75148a1 (the operator: "land it"). Post-main just test green: agent 3042, viewer 1276, env 3293 (lines 83.16% vs floor 69), claude-gateway 39 (lines 46.25% vs floor 22). Worklog left in active (archive awaits the operator).
- [x] Archived 2026-11-11 on the operator's "yes"
