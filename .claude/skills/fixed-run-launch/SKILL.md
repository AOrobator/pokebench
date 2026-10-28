---
name: fixed-run-launch
description: Launch, restart or stop a PokeBench fixed-N experiment (`just fixed-run`, e.g. bundle-v-control) on the GPU lanes, and prove its runs are live and visible in the viewer before calling it launched. Use only after the operator has said to start the runs; not for designing comparisons.
---

# Fixed-run launch

A launch is not done until every check below passes. A check that fails means stop the runner, report it with evidence, and fix it before relaunching. Never leave a broken launch running.

## 1. Preconditions (read live state, never memory)

- `git status --short` in `~/dev/pokebench` is empty and `main` contains every merge the experiment's worklog lists under "Launch dependencies".
- No other gameplay holds a GPU: `runs/experiments/runner.json` is absent, `ps` shows no `live.js play`, `fixed-cli.js run` or `pokebench_env.serve`, and the lane game ports from the definition are free (`lsof -nP -iTCP:<port> -sTCP:LISTEN`).
- Each lane's `modelUrl` answers `/health` 200 and `/props` reports the definition's `serving` model, build, n_ctx and slots. `ssh gpu-host nvidia-smi` shows only the experiment's llama-servers.
- `just fixed-run check <id>` passes (start save sha1, control base sha256, plan).
- The :8790 viewer runs main: `just viewer-main`, then confirm it prints main's short SHA. This is required after **any** merge to main when the launch pins a newer commit than the viewer was built at: a trial's events carry whatever fields its pinned harness writes, and a viewer built before them cannot read those events. Restart before the launch check, never after. Resolve the actual 8790 listener tree using `pokebench_env.current_runtime.serving_viewer_tree` (see `docs/current-run-snapshots-operations.md`) and read its `packages/viewer/dist/build-stamp.json`; its `commit` must be the pinned launch commit or a descendant of it (`git merge-base --is-ancestor <pin> <viewer commit>`).

## 2. Launch

- Launch only when the operator has said, in this conversation, to start the runs. There is no approval file or approve command (removed 2026-10-28, the operator); `run` uses the definition and feature recipe as they are on main at launch, and the ledger records their hash.
- Launch only through `just`, which loads `.env` (POKEBENCH_ROM and friends). Never run `node packages/viewer/dist/fixed-cli.js run` directly. Detach so the runner outlives the session:

  ```bash
  nohup just fixed-run run <id> >> runs/experiments/<id>/runner.log 2>&1 < /dev/null & disown
  ```

- The CLI refuses to start without a readable POKEBENCH_ROM; if it does, fix the environment, never the check.
- Trials never run the main checkout's build. Before the first trial the runner prepares a detached experiment checkout at the pinned commit, `/private/tmp/pokebench-fixed-<commit12>` (pnpm and uv installs, the native mGBA binding copied from main's venv, agent built, stamped), and launches every trial's `live.js` from it into the main `runs/`. Merges, `just build` and viewer restarts on main cannot reach a running trial. Never edit, rebuild or check out anything inside that directory while the experiment runs.

## 3. Prove it is live (all required)

- `runs/experiments/runner.json` names the runner pid and a trial; `just fixed-run status <id>` shows every lane `running` and `0 invalid`.
- Each first trial's `runs/<run>/events.jsonl` has a `run_start` whose `evaluation.experiment.id` is the experiment, `evaluation.features` matches its arm, `budgets.max_wall_ms` is the phase cap, `harness.dirty` is false, `harness.commit` is the ledger's pinned launch commit, and `start_state.sha1` is the definition's start sha1. Milestones up to the checkpoint arrive as `present_at_start`.
- `runs/experiments/<id>/logs/<run>.err` has no `FAILED`.
- The runner log says `preparing the experiment checkout for <commit7>`, and each run_start's `harness.commit` equals the ledger's pinned launch commit.
- **Run visibility:** `/api/workbench` lists every launched run by its exact run ID, without a recording problem. Open Stats in a background browser, locate each run card and follow WATCH RUN to its actual frame. `just experiments-audit` must print nothing and exit 0; it checks internal result provenance rather than a UI selector.
- **No version skew:** no run in `/api/workbench` has a `problem` (and `problems` has no `Run <id>:` line) saying `viewer build … is older than this run's build …: restart the viewer (just viewer-main)`. That message means the viewer cannot read some of the pinned build's events; the run stays listed with its last valid status, but its splits may be incomplete. Run `just viewer-main` and recheck. Do not wait for a battle to find out: a viewer built before the pin passes this check until the first event with a new field arrives, so the build-stamp precondition in step 1 is what actually prevents it.

### Recorded provenance

`evaluation.experiment` and `harness.commit` remain in each run_start for fixed-run analysis. Ledgers retain validity and exclusion evidence. Keep run directories in `runs/` (or `runs/human/`); moving them to `runs/aborted/` removes them from the viewer. Stats and PokéNav have no experiment controls or badges.

## 4. If a launch went wrong

An operator-caused or launch-procedure fault (wrong environment, wrong command, wrong viewer) taints the cohort. It is not an invalid trial to be replaced from the reserve. Stopping trials with SIGTERM records them as `operator_abort`, which counts as a valid outcome and is not replaced (the operator 2026-10-27).

- `kill -TERM` the runner (it stops starting trials), then `kill -TERM` each `live.js play` child. A play process ends its run as `operator_abort` on SIGTERM or SIGINT and stops its own game server. Never kill the `pokebench_env` server or use SIGKILL first: a killed server is recorded as a crash. Confirm the ports are free and `runner.json` is gone.
- Move `runs/experiments/<id>/` and every run dir it launched to `runs/aborted/<id>-<UTC timestamp>/` (outside `runs/experiments/` and the run list). Never delete them.
- Record what happened and the operator's decision in the experiment worklog, fix the cause with RED/GREEN, then relaunch from step 1 once the operator says to.

## 5. Report

Lead with the furthest milestone each live trial has reached, then the run ids per lane and arm, the runner pid, and the run-card and playback evidence.
