# Linux mGBA build (2026-11-11)

Branch `claude/linux-mgba-build`, based on `claude/setup-preflight-docs` (39b9b2d24). Asked by the operator in the project thread ("we need to apply these repo fixes and update the docs", 2026-11-11) after the GPU host Linux trial. Not to be pushed; landing needs the operator's own OK and a Codex review.

## Problem

`scripts/build-mgba.sh` is macOS-only (brew, install_name_tool, codesign, sysctl). On Ubuntu 24.04 the trial proved a working recipe and found one trap: the venv's PyPI `pkgconf` (the `mgba-build` uv group) does not search Debian's multiarch `/usr/lib/x86_64-linux-gnu/pkgconfig`, so cmake silently disables FFmpeg and the binding then fails to import (`undefined symbol: EReaderScanLoadImageA`).

## M1: Linux branch in build-mgba.sh and README Linux notes

- [x] `scripts/build-mgba.sh`: `case "$(uname -s)"`; Darwin branch unchanged; Linux branch = the proven trial recipe (system pkg-config for cmake, FFmpeg/libpng/zlib preflight with the apt line, venv Python include dir, `$ORIGIN` rpath, `nproc`, "GIF/Video recording: ON" check, `libmgba.so.0.10` beside the binding, readelf RUNPATH check, import check); other OSes exit with a message
- COMMIT: `feat(build-mgba): Linux branch, proven on Ubuntu 24.04 x86_64` (6e7918302)
- [x] README Setup: Linux row says tested (Ubuntu 24.04 x86_64, 2026-11-11), apt line with `sudo apt-get update` first
- [x] Cheap checks: `bash -n` OK; shellcheck clean (one intentional SC2016 disabled for the literal `$ORIGIN`)
- [x] Proof on GPU host: fresh bundle clone of this branch in `~/pokebench-linux-trial`, `just build-mgba` (by hand if `just` is missing), import check, smoke on the ROM
- [x] Proof on the Mac: `just build-mgba` in this worktree's own venv (never the main checkout's)
- [x] `just test` / `just lint` on the branch (recipe steps by hand on GPU host, Node 26.13.1; the Mac stays free)
- COMMIT: `fix(build-mgba): resolve pkg-config outside env/.venv even when it is activated` (df5bb6036)
- [x] Codex review via `just tell-codex`: CHANGES round 1 (fixed), LGTM round 2. Ready to land; not landed (needs the operator's own OK)

Non-goals: Windows, other distros, doctor changes (owned by setup-preflight-docs).

## Session log

- GPU host, fresh bundle clone of 6e7918302 in `~/pokebench-linux-trial/linux-mgba`: `uv sync`, `bash scripts/build-mgba.sh` exit 0 in 58 s ("GIF/Video recording: ON", "mgba binding OK"); smoke OK (TITLE_SEQUENCE, 1658-byte screenshot, GAME_RUNNING); mypy clean; `just doctor` equivalent 13 passed, 1 failed (`just` not installed on the box), 3 skipped (no model endpoint).
- GPU host gates on that clone: build 0; vitest agent 3038/3038, viewer 1276/1276; env pytest 3233 passed, gate 82.17/76.36/76.57 (floor 69); gateway 39 passed, 46.25/42.86/23.60 (floor 22); no-I/O guards OK; pnpm lint, ruff, ruff format, mypy, gateway mypy --strict all 0.
- Mac (CPU window granted 18:57Z, no live game run): `just build-mgba` in this worktree's own env/.venv, 45 s, "GIF/Video recording: ON", "mgba binding OK", binding rpath `@loader_path`. The Darwin branch is the previous script body moved into `build_darwin`.

## Surprises

- The venv's PyPI `pkgconf` (uv group `mgba-build`) searches only `/usr/local/lib64/pkgconfig:/usr/local/share/pkgconfig`, not Debian's multiarch `/usr/lib/x86_64-linux-gnu/pkgconfig`. Handed to cmake, it makes FFmpeg look missing, and cmake silently builds without it.
- Ubuntu 24.04's stale apt lists asked for `libpng-dev 1.6.43-5ubuntu0.6`, already replaced on the mirror (404), and apt installed nothing; `apt-get update` first fixed it.
- `pokebench_env/doctor.py` (base branch) still reports Linux as "untested"; left to the setup-preflight-docs owner.

## Multi-model review log

- Round 1, Codex (JOB review-claude-linux-mgba-build-11408e61c; base 39b9b2d24, head 11408e61c, packet sha256 3dbc6edf…87e5): VERDICT: CHANGES. [P2] with env/.venv activated, `command -v pkg-config` is the venv's PyPI pkgconf, so preflight and cmake both use it and the build fails on Ubuntu. Accepted: `system_pkg_config` takes the first pkg-config on PATH outside env/.venv (physical-path compare) for both preflight and cmake. Darwin extraction confirmed equivalent.
- Round 2, Codex (JOB review-claude-linux-mgba-build-df5bb6036; base 39b9b2d24, head df5bb6036, packet sha256 b579fd3a…92ea5): VERDICT: LGTM, no blocking findings. Re-proved on GPU host: activated venv and plain PATH both build with PKG_CONFIG_EXECUTABLE=/usr/bin/pkg-config, FFmpeg ON, binding OK; smoke OK.
