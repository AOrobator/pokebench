---
name: experiment-queue
description: Create PokeBench feature-switch experiments, register them as pending when a switch merges, move them into the experiment queue only when readiness passes, and read their results. Use when adding, queueing, repinning, discarding or reporting on an experiments/*.json entry; not for approving or launching measured runs, which only the operator does.
---

# Create experiments and queue them at the right time

Operator rules (2026-10-14):
- "each feature needs to be tested and experimented on."
- "we need a list of pending experiments that aren't in the queue."
- "it doesn't make sense to run this experiment until the models can reliably reach this milestone."

The queue is the only way feature-switch experiments run. Measured runs need the operator's approval, and you never give it.

## The lifecycle

Each experiment is one tracked file, `experiments/<id>.json`, validated by `ExperimentSchema` in `packages/agent/src/experiments.ts`. Its state is always derived from its records, never stored.

1. **Pending**: merged behind a switch, but not in the queue (no `queuePosition`). Its reason says whether readiness passes.
2. **Queued**: has a `queuePosition`. It is `not-ready` if readiness fails, `draft` until the operator approves it, then `approved`.
3. **Running / held**: the runner is on it, or it stopped partway. Running the queue again resumes it.
4. **Closed**: `done` (all trials finished, `result.json` written) or `discarded` (`"discarded": "<reason>"` set). A closed entry is on neither list.

An entry is never on both lists. It leaves pending when it is queued, finished or discarded.

## When a switch merges: register it as pending (same merge)

The feature-switch skill requires this. Add `experiments/<id>.json` with no `queuePosition`, containing:
- `changedFeature`: the switch id.
- `hypothesis`: one sentence on what should improve and how you would see it.
- `activationMilestone`: the earliest native milestone at which the switch can change what the model sees or does. Ground it in the game (see pokebench-patch-evaluation, "Check readiness first"). Examples: `counter-talk-v1` acts at `OLDALE_TOWN`, `ledge-hops-v1` and grass cost at `ROUTE_101`, `one-way-tiles-v1` at `PLAYER_BEDROOM`, whole-map navigation at `PLAYER_NAME_CONFIRMED` (the truck).
- `primaryMilestone`: the frontier you grade on, currently `RIVAL_HOUSE_ENTERED`.
- `incumbent`: a full v2 preset with every switch explicit. Copy it from an existing entry so experiments share one incumbent unless there is a reason not to. The candidate is always that incumbent with only `changedFeature` flipped; the schema refuses anything else.
- `source`: `{"checkout":"main","commit":"<merge SHA>"}`.
- The trial count (`trialsPerArm`: 8, the operator's default since 2026-10-14; the schema allows 4–8 and grading uses the declared count), `modelLane` (the gateway model id, for example `think-fast`), `budget`, `criteria` and `readiness` (`window` 4, `minReached` 3). Copy these from an existing entry.

Then run `just experiments-check` and record the readiness verdict in `docs/experiments/readiness.md`.

## Moving pending → queue: only when readiness passes

- Run `just experiments`. A pending entry whose reason starts `ready to queue:` may get a `queuePosition`. One that says `not ready:` stays pending, and you report its reason.
- Readiness is computed from recorded runs of the experiment's model lane: at least 3 of the last 4 qualifying runs reach `activationMilestone`. Runs that match the incumbent's turn and wall limits and every other switch are used first. If too few exist, the latest runs of that lane in any registry configuration stand in, and the reason says so. Human runs, probes and aborted runs never count.
- Choose the position by what the frontier needs most. Queue positions must be unique, and changing a position does not invalidate an approval.
- Re-check pending entries whenever the frontier advances, and before proposing any experiment.

## Approval, pinning and running (operator)

- `just experiment-approve <id>` is interactive: it needs a terminal and the typed id. Never run it, simulate it or write `approval.json` yourself. It applies only to queued entries in `draft` or `stale`.
- Approval covers the whole definition except `queuePosition` and `notes`, including the build. Any other edit makes it `stale`.
- `just experiment-pin <id>` moves an unstarted entry to main's HEAD. Its approval then goes stale and needs a new one. Pin when main has moved past the entry's commit.
- `just experiment-run [--dry-run] [--once]` runs approved entries in queue order. You may run `--dry-run` to show the plan. Starting real trials needs the operator's explicit go-ahead in chat for that run.
- The runner refuses when main is not at the pinned commit, the tree is dirty, the build is stale, a run is live or the gameplay lease is held. It holds (resumably) on a launcher failure, the budget, or main moving mid-experiment.

## Reading results

`runs/experiments/<id>/result.json` holds the `comparePatchResults` report: reach, median time among completers, target turns, verdict and recommendation. The views and `just experiments` also show median turns and primary-milestone reach per 1,000 turns per arm, because the operator wants run efficiency judged as well as milestones.

A recommendation is never a promotion. Changing a default or the incumbent is a separate, reviewed change. Discard an experiment by setting `discarded` with the reason, in a commit.
