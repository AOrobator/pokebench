# Node version guards and setup error surfaces (2026-11-11)

Branch `claude/node-version-guards`, based on `claude/setup-preflight-docs` (39b9b2d24). Asked by the operator in the project thread ("we need to apply these repo fixes and update the docs", 2026-11-11) after the GPU host Linux trial. Not to be pushed; landing needs the operator's own OK and a Codex review.

## Problem

The Linux trial on Node 20 found setup failures that pass silently or hide their cause:

- pnpm only warns about `engines.node >=26`.
- Nine entrypoints guard on `if (import.meta.main)`. Before Node 24.2 that is `undefined`, so `just view`, the build stamp and seven other CLIs exit 0 without doing anything.
- mypy fails until mGBA is built: the inline `type: ignore[import-untyped]` on the `mgba._pylib` imports does not cover `import-not-found`.
- `just smoke` reports "game server exited with code 1" as its last line. The server inherits smoke's stdout/stderr, so its own error (the mGBA ImportError on the trial) is printed above it, not hidden; the trial's `tail -3` cut it off. The message should point there.
- `just view` has no port parameter.

## M1: all five, one milestone

- COMMIT: `test(setup): isMain refuses Node without import.meta.main; smoke points at server output` (8cfbcd763)
- [x] RED: `packages/agent/src/is-main.test.ts`; `test_smoke_fails_fast_if_server_process_exits` asserts the pointer to the server output
- [x] `.npmrc` `engine-strict=true`; `.node-version` `26`
- [x] `isMain(meta)` in `packages/agent/src/is-main.ts` (exported as `@pokebench/agent/is-main`), at all 9 `import.meta.main` sites
- [x] mypy: `mgba`/`mgba.*` in the `ignore_missing_imports` override; inline ignores removed; proven with and without the binding installed
- [x] smoke: SmokeError says the server's own error is in its output above
- [x] `just view` takes `port="8790"`, passed as `--port`
- [x] README: Node row no longer says "exits 0"
- COMMIT: `feat(setup): refuse old Node loudly; mypy without mGBA; smoke and view usability` (4c8bbbb84)
- [x] Gates: `just test` exit 0 (agent 3042, viewer 1276, env 3233 at 82.17/76.36/76.57 vs floor 69, gateway 39 at 46.25/42.86/23.60 vs floor 22, no-I/O guards OK); `just lint` exit 0. Mac CPU window granted 18:57Z, released after
- [x] Proof on Node 20 (GPU host trial dir, system node): viewer and build-stamp fail loudly; pnpm install refuses
- [x] Codex review via `just tell-codex`: LGTM round 1. Ready to land; not landed (needs the operator's own OK)

Non-goals: the verify-release hint (`just replay-verify` now exists on main, 80d6bed12), Linux mGBA (branch `claude/linux-mgba-build`).

## Session log

- Cheap checks: agent and viewer `tsc --noEmit` 0; focused vitest (is-main, schema, tail; viewer entrypoint tests) green; `test_smoke.py` 2 passed; mypy clean without the binding and with it (`--python-executable` at the linux-mgba-build worktree's venv, which has the binding); ruff clean. Every Node on the Mac is 26.x (PATH, Homebrew, Hermes), so `engine-strict` breaks nothing local.

## Surprises

- Under vitest on Node 26, `import.meta.main` is `false` (boolean) in test modules, so a throwing guard is safe when tests import an entrypoint module.

- GPU host, bundle clone of 4c8bbbb84 in `~/pokebench-linux-trial/node-guards`: Node 20.20.2 `pnpm install` fails with ERR_PNPM_UNSUPPORTED_ENGINE (exit 1); after a Node 26.13.1 install and build (build stamp 4c8bbbb written), Node 20 `cli.js --port 18799` and `build-stamp.js` both throw "Node 20.20.2 cannot tell which module it started (import.meta.main arrived in Node 24.2). PokeBench needs Node 26 or newer." (exit 1); Node 26 viewer serves / with 200, stopped after.

## Multi-model review log

- Round 1, Codex: JOB review-claude-node-version-guards-4c8bbbb84 sent (packet sha256 803550624ea14da1af0cbcf62eb1fb41048355bd9cf063db8f055ae132d245a7); VERDICT: LGTM, no findings (all nine sites replaced; mypy override, smoke stdio, view port forwarding checked; 24 focused tests rerun on Node 26.7.0).

## Rebase onto main (2026-11-11)

The operator chose "Code now, README later" (decision card, 19:16Z): land the code before `claude/setup-preflight-docs`.

- Reviewed history saved as `claude/node-version-guards-on-setup-docs` (3c12266f5). Rebuilt from `git diff 39b9b2d24 3c12266f5 -- . ':!README.md'` applied onto main d895675f6 (clean), then rebased onto main 1018a95f7 after linux-mgba-build landed (no overlap). README edits moved to `claude/linux-setup-readme` (127f33ce8).
- Codex review of the rebased diff (JOB review-claude-node-version-guards-rebased-1c1cc0c90, packet sha256 227a2125…a890): LGTM, code identical to the approved version apart from README; all nine sites covered.
- Gates on the rebased tree (Mac, CPU window 19:17Z): `just test` exit 0 (agent 3042, viewer 1276, env 3258 at 82.88/77.18/77.77 vs floor 69, gateway 39 at 46.25/42.86/23.60 vs floor 22, no-I/O guards OK). `just lint` FAILED: `pokebench_env/replay_verify.py` (new on main, replay-verify) imports mgba with four inline `type: ignore[import-untyped]` that the new mgba override makes unused. Fix: drop those four ignores. After it: mypy clean with and without the binding (148 files), ruff clean, `just lint` exit 0.
- COMMIT: `fix(mypy): drop replay_verify's mgba ignores now that the override covers mgba` (dd8549a95)
- [x] Codex delta review of the replay_verify fix: LGTM (JOB review-claude-node-version-guards-delta-dd8549a95), no findings
- [x] Landed: `git merge --ff-only` main -> 1aea69430 on the operator's "land linux-mgba-build and node-version-guards" (19:15Z); post-main `just test` exit 0 on main 1aea69430 (agent 3042, viewer 1276, env 3258 at 82.88/77.18/77.77 vs floor 69, gateway 39 at 46.25/42.86/23.60 vs floor 22, no-I/O guards OK)
