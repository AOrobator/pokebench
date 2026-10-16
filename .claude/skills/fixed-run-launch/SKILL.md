---
name: fixed-run-launch
description: Launch, restart or stop a PokeBench fixed-N experiment (`just fixed-run`, e.g. bundle-v-control) on the GPU lanes, and prove it is live and visible in the viewer's EXPERIMENT dropdown before calling it launched. Use only after the operator has said to start the runs; not for designing experiments or for experiment-queue (`experiments/*.json`) runs.
---

# Fixed-run launch

A launch is not done until every check below passes. A check that fails means stop the runner, report it with evidence, and fix it before relaunching. Never leave a broken launch running.

## 1. Preconditions (read live state, never memory)

- `git status --short` in `~/dev/pokebench` is empty and `main` contains every merge the experiment's worklog lists under "Launch dependencies".
- No other gameplay holds a GPU: `runs/experiments/runner.json` is absent, `ps` shows no `live.js play`, `fixed-cli.js run` or `pokebench_env.serve`, and the lane game ports from the definition are free (`lsof -nP -iTCP:<port> -sTCP:LISTEN`).
- Each lane's `modelUrl` answers `/health` 200 and `/props` reports the definition's `serving` model, build, n_ctx and slots. `ssh gpu-host nvidia-smi` shows only the experiment's llama-servers.
- `just fixed-run check <id>` passes (start save sha1, control base sha256, plan).
- The :8790 viewer runs main: `just viewer-main`, then confirm it prints main's short SHA.

## 2. Launch

- Approval is the operator's. `just fixed-run approve <id>` needs a TTY; type the id only when the operator has said, in this conversation, to start the runs.
- Launch only through `just`, which loads `.env` (POKEBENCH_ROM and friends). Never run `node packages/viewer/dist/fixed-cli.js run` directly. Detach so the runner outlives the session:

  ```bash
  nohup just fixed-run run <id> >> runs/experiments/<id>/runner.log 2>&1 < /dev/null & disown
  ```

- The CLI refuses to start without a readable POKEBENCH_ROM; if it does, fix the environment, never the check.
- Trials never run the main checkout's build. Before the first trial the runner prepares a detached experiment checkout at the pinned commit, `/private/tmp/pokebench-fixed-<commit12>` (pnpm and uv installs, the native mGBA binding copied from main's venv, agent built, stamped), and launches every trial's `live.js` from it into the main `runs/`. Merges, `just build` and viewer restarts on main cannot reach a running trial. Never edit, rebuild or check out anything inside that directory while the experiment runs.

## 3. Prove it is live (all required)

- `runs/experiments/runner.json` names the runner pid and a trial; `just fixed-run status <id>` shows every lane `running` and `0 invalid`.
- Each first trial's `runs/<run>/events.jsonl` has a `run_start` whose `evaluation.experiment.id` is the experiment, `evaluation.features` matches its arm, `budgets.max_wall_ms` is the phase cap, `harness.dirty` is false, `harness.commit` is main, and `start_state.sha1` is the definition's start sha1. Milestones up to the checkpoint arrive as `present_at_start`.
- `runs/experiments/<id>/logs/<run>.err` has no `FAILED`.
- The runner log says `preparing the experiment checkout for <commit7>`, and each run_start's `harness.commit` equals the ledger's pinned launch commit.
- **EXPERIMENT dropdown (hard requirement):** `GET http://127.0.0.1:8790/api/workbench` lists each launched run with `cohort: "experiment:<id>"` and `problems` mentions no `Experiment <id>` line. Then open `http://127.0.0.1:8790/comparisons` in the browser, wait for the dropdown to fill (the workbench can take minutes), and confirm the experiment is an option and selecting it shows the live runs. If either fails, the launch is not done.

## 4. If a launch went wrong

An operator-caused or launch-procedure fault (wrong environment, wrong command, wrong viewer) taints the cohort. It is not an infrastructure invalid trial to be replaced from the reserve.

- `kill -TERM` the runner, then every `live.js play` child and its `pokebench_env` server; confirm the ports are free and `runner.json` is gone.
- Move `runs/experiments/<id>/` and every run dir it launched to `runs/aborted/<id>-<UTC timestamp>/` (outside `runs/experiments/` and the run list). Never delete them.
- Record what happened and the operator's decision in the experiment worklog, fix the cause with RED/GREEN, then relaunch from step 1 with a fresh approval.

## 5. Report

Lead with the furthest milestone each live trial has reached, then the run ids per lane and arm, the runner pid, and the dropdown evidence.
