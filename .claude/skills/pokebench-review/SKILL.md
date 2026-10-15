---
name: pokebench-review
description: Run a "PokeBench review", where three personas (harness engineer, data scientist, machine learning engineer) critique whatever the operator points at, such as a patch, experiment plan, result, report, worklog or idea. Each persona is grounded in recorded run evidence, the experiment queue, docs/agent-principles.md and the patch-evaluation skill. Trigger on "PokeBench review", "pokebench review" or "review this as the three personas". Not the multi-model code review gate, not a launch or approval of runs.
---

# PokeBench review: three personas, one evidence base

The operator asks for a "PokeBench review" of something: a diff or branch, a switch, an experiment entry, a results report, a worklog, a plan or a loose idea. Answer with three personas who each critique it from their discipline. Every claim stands on recorded evidence, not on narration or memory.

This skill reviews; it does not act. It never launches, approves, queues or discards experiments, edits harness code or merges. Recommendations that need those steps are written as next steps for the operator.

## 1. Pin down the subject

Name the subject in one line: what it is, its commit or file path, and the switch id or experiment id when there is one. If the operator's ask is ambiguous, pick the most recent matching thing (latest branch, newest report, newest `experiments/*.json` touched) and say which you picked.

## 2. Gather the evidence base once

All three personas share this base. Collect it before writing any persona section.

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
3. **Rules.** `docs/agent-principles.md` (PB1 to PB13) and `.claude/skills/pokebench-patch-evaluation/SKILL.md` (readiness, eight runs per arm, one difference per comparison, references, reporting). Pull in `pokebench-story-milestones`, `feature-switch` or `agent-observability` only when the subject touches their area.
4. **The subject itself.** Read the diff, file or report in full. For runs, cite run ids and event `seq` numbers, not summaries.

Run data lives in the main checkout's `runs/` (first row of `git worktree list`), even when you work in another worktree.

## 3. The three personas

Each persona writes: a one-line verdict, what holds up, what concerns them (most serious first), and one concrete next step. Every concern cites evidence (run id and seq, file:line, readiness row, PB id) or is marked as inference. Personas disagree when the evidence supports disagreement; do not blend them into consensus.

### Harness engineer

Owns what the model sees and can do, and whether the harness tells the truth.

- Does the change sit behind a registered switch whose OFF state reproduces previous behavior? Is the explainer written?
- Does the model actually receive the new information or affordance? Check the recorded tool results or prompts in a real run, not the code path alone (agent-observability).
- Is any advantage undeclared (PB4)? Does it write game memory, touch `env/vendor/`, or depend on a mutable default?
- Harness bugs: wrong observations, wrong grading, loops the harness caused. Call them **harness bug** and separate them from model failure.
- Robustness over long runs (PB6, PB8): bounded retries, loud failures, terminal records.

### Data scientist

Owns whether a claim is supported by the numbers.

- Readiness first, using the full patch-evaluation rule: at least 3 of the last 4 qualifying incumbent runs reach the activation milestone, where qualifying means recorded, non-probe, non-human, not aborted, same model lane, a build compatible with the incumbent, the planned common start and the planned budget. Checkpoint starts never count. Quote reached/total and run ids, and cross-check against the queue's verdict; say so when that verdict used the recent-basis fallback (the lane's latest runs in any configuration, because too few match the incumbent), since it is then weaker than it looks.
- Design: one effective difference per comparison, eight trials per arm per model, counterbalanced order, predeclared target and budgets, same build.
- Reporting: completion counts beside times, DNFs and censored runs kept (PB2), missing splits not treated as zero, human, prior baseline and best valid run shown as references.
- Overclaiming: survivor medians, a single best run, checkpoint progress presented as fresh-boot progress, a cohort compared against stale or incompatible controls.
- What sample would actually settle the question, and whether it fits the queue.

### Machine learning engineer

Owns the model and serving side, and why the model behaves the way it does.

- Model lane and artifact: ids from gateway discovery, sampling settings, context window, thinking level, serving contention. Flag any hardcoded SKU.
- Failure modes in the transcripts: misread observations, tool-call errors, repeated actions, context loss after long runs, ignored instructions. Cite turns.
- Prompt and context cost: tokens per turn, how much of the window the change consumes, whether information arrives where the model can use it.
- Whether the bottleneck is perception, planning, memory or action, and whether the subject attacks the actual bottleneck at the current frontier.
- Model-side alternatives worth testing as their own switch.

## 4. Write the review

Lead with the frontier, before any persona: the furthest native milestone on fresh boot (run id, model, elapsed time) and on checkpoint starts (run id, resume point, minutes since the save loaded), then how far the subject is from mattering at that frontier (its activation milestone and readiness). New frontiers reached since the last review come first.

Then the three persona sections, then a short synthesis: where they agree, where they disagree, and the ranked next steps. Mark which next steps need the operator (approve a run, merge, change a principle).

### Where it goes

- A short review (about fifteen lines or less) can go straight in chat.
- Anything longer is a self-contained local HTML file at `runs/reviews/<YYYY-MM-DD>-<slug>.html` in the main checkout, which is `$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/runs/reviews/` from any worktree. `runs/` is gitignored, so nothing untracked lands in tracked directories. Use this layout: frontier tiles, a verdict box, one block per persona, then the synthesis, with light and dark themes and no external assets. `runs/reviews/2026-10-13-perspectives.html` is an example if it exists locally.
- Link it as a clickable markdown link. In a project thread, send it with `SendUserFile`, link the exact path that tool reports and list it in `attached_outputs`; a local `open` command may follow as a fallback, never alone. Never publish it as a claude.ai artifact.

## 5. Check yourself before sending

- The frontier came from `frontier.mjs`, fresh-boot, checkpoint and in-progress runs are kept separate, and no checkpoint time is compared with a boot time.
- Every concern has evidence or is marked as inference.
- No persona recommends launching or approving runs as if it were already decided; those are the operator's calls.
- Readiness was checked fresh, not copied from an old row.
