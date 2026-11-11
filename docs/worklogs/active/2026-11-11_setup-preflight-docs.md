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
- [ ] README charts (badges over time, badges per dollar): mockups built, waiting for the operator's OK before committing
- [ ] Codex review requested

Follow-ups from the Linux trial, out of scope here: an isMain() helper for import.meta.main; .npmrc engine-strict and .node-version; a Linux branch in build-mgba.sh; mypy ignore codes that depend on the mGBA build; smoke.py hiding server stderr; the verify_release hint naming a nonexistent `just replay-verify`; a port parameter for `just view`; build-stamp not writing dist/build-stamp.json.

