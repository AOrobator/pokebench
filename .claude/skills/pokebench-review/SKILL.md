---
name: pokebench-review
description: Run a "PokeBench review", where four personas (harness engineer, data scientist, machine learning engineer, evaluation integrity) critique whatever the operator points at, such as a patch, experiment design, result, report, worklog or idea. Each persona runs as its own parallel subagent on one shared evidence packet, so they disagree for real. Trigger on "PokeBench review", "pokebench review" or "review this as the personas". Not the multi-model code review gate, not a launch or approval of runs.
---

# PokeBench review: four independent personas, one evidence base

The operator asks for a "PokeBench review" of something: a diff or branch, a switch, an experiment entry, a results report, a worklog, a plan or a loose idea. Answer with four personas who each critique it from their discipline, each written by a separate subagent that never sees the others' work. Every claim stands on recorded evidence, not on narration or memory.

This skill reviews; it does not act. It never launches, approves, queues or discards experiments, edits harness code or merges. Recommendations that need those steps are written as next steps for the operator.

## 1. Pin down the subject

Name the subject in one line: what it is, its commit or file path, and the switch id or experiment id when there is one. If the operator's ask is ambiguous, pick the most recent matching thing (latest branch, newest report, newest `experiments/*.json` touched) and say which you picked.

## 2. Gather the evidence base once

All four personas share this base. The coordinator (you) collects it once, before launching any persona, and writes it to `runs/reviews/<YYYY-MM-DD>-<slug>/evidence.md` in the main checkout: the subject line, the frontier output verbatim, the experiment state, readiness, the subject's paths and commit, and the run ids it touches. Personas may read further evidence themselves, but every persona starts from the same packet.

1. **Frontier from validated runs.** Use the viewer's workbench data, not raw `events.jsonl` scans. The workbench re-grades splits and drops invalid ones: the raw log of `2026-10-13T17-07-50_think-fast_805e` still shows `PETALBURG_CITY`, while the workbench stops that run at `PLAYER_BEDROOM`. Run:

   ```bash
   node .claude/skills/pokebench-review/frontier.mjs
   ```

   It reads `http://127.0.0.1:8790/api/workbench`, validates it with the viewer's `parseWorkbench`, and ranks runs by the viewer's `FRONTIER_MILESTONES` (required story checkpoints, not optional catches or trainers). Screenshot-only splits never count, and excluded, invalid, probe, synthetic and replay runs are dropped. Each row gives milestone, minutes, model, preset, start, status and run id. It prints:
   - **Best valid fresh-boot run**: exactly what the viewer's `frontierReferences` picks.
   - **Fresh-boot frontier**: the top ended boot runs, in active minutes since New game. Only these count for readiness and records.
   - **Checkpoint frontier**: ended runs resumed at `CLOCK_SET`, the only checkpoint series the viewer plots. Ranking starts after the resume point, as on the viewer chart. Times are minutes since the save loaded, so never compare them with fresh-boot times or call a checkpoint run faster.
   - **In progress** (live or paused) and **stalled** (unresponsive): shown so a run passing the frontier right now is not missed, but never counted.
   - **Human reference**: what `frontierReferences` picks, or "unavailable".

   The helper reflects the viewer build in `POKEBENCH_VIEWER_WORKTREE` (default `/private/tmp/pokebench-viewer`, kept at `main`). If the subject changes the milestone axis or grading, also read `packages/viewer/src/frontier.ts` on the subject's commit and say where it differs.

   If the helper reports the viewer unavailable, stop and tell the operator. Do not run `just viewer-main` during a review: it kills whatever holds port 8790, and that process also hosts the experiment run queue, so a restart can interrupt a measured cohort.
2. **Experiment state.** Read `http://127.0.0.1:8790/api/experiments` from the running viewer (not `just experiments`, which rebuilds) for the queue, pending and closed lists and the queue's readiness verdicts. Also read `docs/experiments/readiness.md` for recorded verdicts, and `experiments/<id>.json` plus `runs/<id>/` or `runs/reports/` for any result the subject touches. The previous persona review is the newest top-level `runs/reviews/*.html` (subdirectories there hold code-review scratch); compare its frontier to find what is new.
3. **Rules.** `docs/agent-principles.md` (PB1 to PB13). Each persona file names the skills it applies; the coordinator does not pre-digest them.
4. **The subject itself.** Read the diff, file or report in full. For runs, cite run ids and event `seq` numbers, not summaries.

Run data lives in the main checkout's `runs/` (first row of `git worktree list`), even when you work in another worktree.

## 3. Launch the personas in parallel

The personas live in `personas/`, one file each:

| Persona | File | Owns |
|---|---|---|
| Harness engineer | `personas/harness-engineer.md` | What the model sees and can do, and whether the harness tells the truth |
| Data scientist | `personas/data-scientist.md` | Whether the numbers support the claim, and what sample would settle it |
| Machine learning engineer | `personas/ml-engineer.md` | Why the model behaves as it does, and information per GPU-hour |
| Evaluation integrity | `personas/eval-integrity.md` | Whether the measurement could have moved without the play moving |

Launch all four at once, one subagent each: Claude Code's `Task` tool, Hermes `delegate_task` with four tasks, or the harness's equivalent. Give every subagent the same brief, changing only the persona file:

> You are the <persona> in a PokeBench review. Read `<repo>/.claude/skills/pokebench-review/personas/<file>.md` and follow it. The subject: <one line>. The shared evidence packet: `<packet path>`. Read the subject in full and any further evidence you need. You are read-only except for your own section file: no runs, no viewer restarts, no `just viewer-main`, no source edits, no queue or approval actions. Write your section to `<packet dir>/<persona>.md` in the format the persona file gives, and return it.

Independence rules:
- No persona sees another's output. Do not paste one persona's findings into another's brief, and do not run them in sequence.
- When more than one model is available, giving personas different models adds real independence. Record which model wrote which section.
- If a persona subagent fails or times out, report that persona as missing. Never write its section yourself.

## 4. Synthesize without blending

Read the four sections. Keep each persona's verdict and concerns as written; you may shorten wording, never change a verdict or drop a concern. Then write:
- **Disagreements:** where personas reached different verdicts or recommendations on the same point, side by side, each with its evidence. A disagreement is a finding; do not resolve it by averaging.
- **Agreements:** points two or more personas reached independently. Say how many.
- **Ranked next steps**, each tagged with the persona(s) behind it, marking which need the operator (approve a run, merge, change a principle).

## 5. Write the review

Lead with the frontier, before any persona: the furthest native milestone on fresh boot (run id, model, elapsed time) and on checkpoint starts (run id, resume point, minutes since the save loaded), then how far the subject is from mattering at that frontier (its activation milestone and readiness). New frontiers reached since the last review come first.

Then the four persona sections, then the synthesis from step 4.

### Where it goes

- A short review (about fifteen lines or less) can go straight in chat.
- Anything longer is a self-contained local HTML file at `runs/reviews/<YYYY-MM-DD>-<slug>.html` in the main checkout, which is `$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/runs/reviews/` from any worktree. `runs/` is gitignored, so nothing untracked lands in tracked directories. Use this layout: frontier tiles, a verdict box with all four verdicts, one block per persona, the disagreements, then the synthesis, with light and dark themes and no external assets. `runs/reviews/2026-10-13-perspectives.html` is an example if it exists locally.
- Link it as a clickable markdown link. In a project thread, send it with `SendUserFile`, link the exact path that tool reports and list it in `attached_outputs`; a local `open` command may follow as a fallback, never alone. Never publish it as a claude.ai artifact.

## 6. Check yourself before sending

- The frontier came from `frontier.mjs`, fresh-boot, checkpoint and in-progress runs are kept separate, and no checkpoint time is compared with a boot time.
- Every concern has evidence or is marked as inference.
- No persona recommends launching or approving runs as if it were already decided; those are the operator's calls.
- Readiness was checked fresh, not copied from an old row.
- All four personas ran as separate parallel subagents from the same packet; any missing persona is reported as missing.
- Disagreements are shown, not blended away.
