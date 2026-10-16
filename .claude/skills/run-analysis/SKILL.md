---
name: run-analysis
description: "Use when the operator asks to analyze the top PokeBench runs and the harnesses they came from, e.g. \"analyze the top runs\", \"what went well / wrong overnight\", \"run analysis\", \"most common and costliest mistakes\". Read-only. Ranks runs by the story frontier, traces each run's switches and pin, fans out per-run forensics, runs a PokeBench review of whether the harness changes help or hurt, and writes an HTML report plus a chat summary of wins, costliest mistakes and harness hypotheses. Not for one run's stall (pokebench-trace-forensics), designing an experiment (pokebench-experiment-design) or keep/discard decisions on a patch (pokebench-patch-evaluation)."
---

# PokeBench run analysis

Find what the best recent runs did right, where they lost time, and which harness changes helped or hurt. This skill is read-only: no runs launched, no viewer restarts, no source edits. It writes only its report under `runs/reports/run-analysis/`, its review packet under `runs/reviews/` and scratch files. Sibling skills own the deep work:

- `pokebench-trace-forensics` explains each stall. This skill fans it out and adds it up.
- `pokebench-experiment-design` turns a hypothesis into a sized test. `feature-switch` puts any fix behind a switch.
- `pokebench-patch-evaluation` decides keep or discard. This skill only nominates.
- `pokebench-review` judges this skill's findings. Every run analysis includes one (step 8).
- `pokebench-story-milestones` owns grading blind spots. `agent-observability` owns signals that were never recorded or never reached the model.

Never call `chat-thread` tools from this skill or its subagents. Quote every time in New York time.

## Procedure

1. **Pool and snapshot.** First fix the candidate pool, before anything is ranked: the named cohort id(s) when the operator names a cohort or experiment, otherwise an explicit New York start and end window for the night (by run start time). Record both, and the counts of runs included and excluded with reasons. Then fetch the workbench read-only:

   ```bash
   curl -s -m 200 http://127.0.0.1:8790/api/workbench -o <scratch>/wb.json
   ```

   - It can take minutes. Never restart 8790 to make it answer. If it is down, stop and tell the operator. Never rank from raw `events.jsonl` milestones: the workbench re-grades splits and drops invalid ones, so a raw scan can credit milestones the frontier does not, and the `frontier.mjs` cross-check in step 2 needs the viewer anyway.
   - Record the snapshot time in New York time.
   - Live runs count. Mark each LIVE with the snapshot time, and re-read its `events.jsonl` tail just before reporting, since it moves.

2. **Rank by the story frontier's order and tiebreak** from `packages/viewer/src/frontier.ts`, over a wider pool than the frontier itself.
   - **Order:** `FRONTIER_MILESTONES` parsed from that file in the viewer tree that serves 8790 (`POKEBENCH_VIEWER_WORKTREE`, default `/private/tmp/pokebench-viewer`), so the order matches the graded workbench; if it differs from your checkout's copy, say so. Never the workbench `milestones` list: it also holds optional milestones such as `FIRST_POKECENTER_HEAL` that would mis-rank.
   - **Eligible for the top N:** in the step 1 pool, `excluded` null, `problem` null, `measurement.controller` is `agent`, and no `measurement.features` matching `probe`, `synthetic` or `replay` (frontier.ts `recordedRun`). Any start kind and any status (ended, live, paused, unresponsive) qualifies, and each is labelled. This is deliberately wider than `frontierCandidate`, which only the agent-frontier bullet below uses.
   - **Rank:** the last index in that order of a split without `screenshotEvidence`.
   - **Start-kind groups**, from `config.start` and `config.resume`: *fresh* is `boot` or a `MAIN_MENU` save; *checkpoint* is a `CLOCK_SET` save; *other save* is any other `save_state` start, including `resume` null; *unknown start* is a run with `config` null. Label every row with its group.
   - **Tiebreak:** group first (fresh, then checkpoint, then other save, then unknown start), then that split's `elapsedMs` ascending within the group, then `id`. Boot and `MAIN_MENU` share a group because `frontier.ts` ranks them together, but say which each run is. Minutes are never compared across groups.
   - Take the top N (default 10). Never rank from `run_end.furthest_milestone` or the fixed ledger: they use `MILESTONE_ORDER`, which places optional milestones such as `FIRST_POKECENTER_HEAL` late and mis-ranks runs. Where they disagree with the frontier order, report it as a grading blind spot.
   - Cross-check against `node .claude/skills/pokebench-review/frontier.mjs`. The one required agreement: its "best valid fresh-boot run" must equal the agent frontier below. Its other lists are a sanity view, not the same rule: they omit `MAIN_MENU` runs, rank `CLOCK_SET` resumes only from after the resume point, and split runs by status, so rows can differ for those reasons. It needs a built viewer in `POKEBENCH_VIEWER_WORKTREE` (default `/private/tmp/pokebench-viewer`), and gives up on the workbench after 60 s, so run it after step 1 has warmed the viewer and retry once if it times out. If it times out again, stop and tell the operator. Explain any disagreement before going on.
   - The frontier chart only plots fresh starts. Checkpoint and other-save runs stay in the list but are flagged: their minutes count from the save, so they are not comparable with fresh-start minutes. Never say one beat another on time across groups.
   - Lead the report with the furthest milestones reached.
   - **Agent frontier.** Identify the current frontier run exactly as `frontierReferences` in `frontier.ts` picks `best` (boot or `MAIN_MENU` start, ended, live or paused). Say whether it moved since the previous run-analysis report (`runs/reports/run-analysis/`) or since the night began, which run it replaced, and when it moved, in New York time.

3. **Harness provenance per run.**
   - Read only the first line of `runs/<id>/events.jsonl` (`run_start`). Files run to ~150 MB: always stream (`head -n 1`, `tail`, `grep`), never load whole.
   - From it: `evaluation.features` (each switch on or off), `evaluation.experiment` (id, arm, trial), sampling, model and preset. The workbench `config.source` is the pinned commit.
   - `evaluation` and `evaluation.features` are optional; older runs lack them even with a preset. When `evaluation.features` is absent, take switch states from the workbench `config.features` (its `on` is true, false or null). Keep null as unknown and never infer OFF.
   - Describe each switch from `experiments/fixed/<id>.json` and its experiment file: try `experiments/<switch id>.json`, then the id without its `-vN` suffix, then the registry in `packages/agent/src/features.ts`.
   - Build a round-to-round switch diff for each arm, and the bundle-minus-control diff.
   - Run `git log --oneline A..B` between consecutive pins, so behavior changes outside switches are visible.

4. **Segment table per run.** Use the workbench splits, whose `elapsedMs` excludes operator pauses.
   - Keep only splits named in `FRONTIER_MILESTONES` and without `screenshotEvidence` (the ranking's splits). Compute the opening segment as the first kept split's `elapsedMs` (from 0, the run's or save's start), each later segment as the difference of consecutive kept `elapsedMs` values, and the final segment as the run's `elapsedMs` minus the last kept split. If the run's `elapsedMs` is null, leave the final segment unknown. A negative difference (possible next to a derived ≤ split) is shown as 0 and marked approximate. Never use `segmentMs`: it is measured from the previous split of any kind, including optional milestones, so it understates frontier segments.
   - Each split carries its own `turn` and `seq`: cite those.
   - Label provenance three ways: a native milestone (no `derived`); a `derived` split without `screenshotEvidence`, recovered from state events, with no `milestone` event at that seq, whose time is a first-observation upper bound (≤); and a reviewed-screenshot split (`screenshotEvidence` present), which is reported but never ranked or timed. The longest segments are the costliest stalls. Never time segments from raw `t` stamps: they include pauses.

5. **Fan out forensics in parallel.**
   - Write one shared brief at `<scratch>/brief.md`: the snapshot time, the run list, the segment tables and the exact output schema below.
   - Launch one subagent per 2 runs. Each follows `pokebench-trace-forensics` on exactly its assigned runs (this skill already chose them, so the forensics run-selection step is skipped) and their 3 longest segments, plus what went well (fast segments, good recoveries).
   - Launch one more subagent to reconstruct harness history (step 3).
   - Tell every subagent: read-only, stream events, never call `chat-thread` tools, cite run id and seq or turn for every claim.
   - Output schema per run: a markdown card (run id, arm, start kind, furthest milestone, end reason, segment table, forensics classes) and a JSON block with `wins`, `stalls` (segment, minutes, turns, primary class, evidence seqs), `mistakes` (label, occurrences, minutes lost, seqs), `loop_guard` (fires, hits that ended a loop, false fires), `false_messages`, and `hypotheses`.
   - Subagents run at the same time, so they cannot share labels. The brief gives a starting list of mistake labels; step 7 normalizes the labels across runs before counting.

6. **Compare arms.** Where the cohort has paired arms (e.g. bundle on gpu0 and control on gpu1, same round and pin), tabulate the furthest milestone per arm per round. N per round is usually 1 per arm: say so, and never call anything significant from it. Hand power questions to `pokebench-experiment-design`.
   - Before reading anything into the top-N arm composition, count the pools: how many eligible runs each arm had at the same start kind and cap. A top-N that is mostly one arm can just mean that arm had more long runs.
   - Check confounds and state each one: arm against GPU lane or port (did each lane run both arms?), pin drift between rounds (only pairs on one pin compare one harness), and switches added between rounds in response to earlier rounds' failures (tuning on the same start).
   - Count milestones that fired inside harness-driven input (for example dialogue auto-advance) per arm, so credited progress is attributed honestly.

7. **Synthesize.**
   - **(a) What went well**, and the switch or behavior behind it.
   - **(b) What went wrong.**
   - **(c) Mistakes.** Normalize the subagents' mistake labels into one set first. Most common: runs affected and total occurrences. Costliest: summed minutes lost across runs. Show both rankings; they often differ.
   - **(d) Hypotheses:** harness changes that would fix the mistakes, switches that seem to help, switches that seem to hurt.
   - Every claim cites run id plus turn or seq.
   - Label each hypothesis **HYPOTHESIS**, with its evidence and its cheapest test:
     - a decision probe (`just probe-decision <run> <turn> --switch <id>=on|off`), for switches that change what the model reads;
     - a correctness fix and test, for false messages and wrong observations;
     - an experiment designed with `pokebench-experiment-design`, behind a switch per `feature-switch`.
   - Mark what the evidence cannot show (confounded pins, N of 1, CLOCK_SET minutes, live runs not finished).
   - Report grading blind spots to `pokebench-story-milestones`, and harness bugs as **harness bug** with trigger and evidence.

8. **PokeBench review.** Every run analysis gets one. Follow `.claude/skills/pokebench-review/SKILL.md`: four personas as parallel subagents on one shared evidence packet.
   - Use that skill's steps 1–4 and 6. Its step 5 page is replaced by the report section below. The packet holds what that skill's step 2 requires (verbatim `frontier.mjs` output, `/api/experiments` state, readiness) plus, from this analysis: the ranking with start kinds, the arm table, the switch and pin diffs, the stall cards and the hypotheses. Put it where that skill says (`runs/reviews/<YYYY-MM-DD>-run-analysis-<slug>/evidence.md`). The review's write-up is the report's PokeBench review section, not a separate `runs/reviews/*.html` page, so the operator gets one link.
   - The review must answer two questions explicitly:
     1. **Are our harness changes helping or hurting?** Per arm, and per switch where the data allows.
     2. **How much confidence does the top-N arm composition give?** For example, 9 of the top 10 from one arm. Weigh selection effects (top-N picks winners from unequal pools), paired rounds, N per arm, start kinds and pin drift between rounds.
   - Keep each persona's verdict as written. The helping or hurting verdict is the one the personas agree on. If they split, report the split with each side's evidence; never average it away.
   - A missing persona is reported missing, never written by the coordinator.

9. **Promotion recommendation.** Every report recommends whether to fold the tested changes into the control arm and make that the new incumbent: promote all, promote some (name the switches), or hold. Base it on the arm table, the per-switch evidence and the PokeBench review's helping-or-hurting verdict. Name switches that look harmful or unproven and should stay out. Say what evidence would change the call. This is a recommendation only: `pokebench-patch-evaluation` owns incumbent promotion, and changing `experiments/fixed/*.json` or presets is the operator's decision.

10. **Outputs.**
   - **HTML report** at `runs/reports/run-analysis/<YYYY-MM-DD>_<slug>/index.html` in the main checkout (`~/dev/pokebench/runs/reports/...`). `just pages` serves the main checkout's `runs/reports/` under `/reports/`, so a worktree copy is not served.
     - Follow the CLAUDE.md "Explainers" rules: zero network requests, inline CSS and SVG, system fonts.
     - Diagrams, all inline SVG: a milestone-vs-minutes frontier chart of the top runs (CLOCK_SET runs drawn distinct and labelled), a stall bar chart of the longest segments, and a switch timeline across rounds per arm.
     - Sections: snapshot and run table, frontier, **agent frontier** (its own section: which run it is and whether it moved; its full configuration: model, pin, arm, preset, sampling and every switch that is on; its segment table; what went well and what did not, with turn evidence), wins, what went wrong, mistakes (common and costly), arm comparison, hypotheses, promotion recommendation (promote all, some or hold, and why), PokeBench review (each persona's verdict, the agreed helping or hurting verdict, the top-N confidence answer, disagreements), what the evidence cannot show.
     - `just pages-check <file>` must print nothing. Run `just pages`, then check `http://127.0.0.1:8791/reports/run-analysis/<YYYY-MM-DD>_<slug>/index.html` returns 200 before linking.
     - Never `SendUserFile`, `/mnt/project-files`, `attached_outputs` or claude.ai artifacts for the HTML.
   - **Chat summary**, in this order:
     1. Furthest milestones reached and which runs reached them (start kind, LIVE if so), and the agent frontier: which run, whether it moved, and its configuration in one line.
     2. Top 3 wins.
     3. Top 3 costliest mistakes, with minutes.
     4. The hypotheses, each with its cheapest test.
     5. The promotion recommendation in one line: promote all, some (which) or hold.
     6. The PokeBench review verdict in one line: helping, hurting, or split, and how much the top-N composition says.
     7. The one link, then the `open ~/dev/pokebench/runs/reports/run-analysis/<...>/index.html` fallback.

## Operator feedback

Operator feedback on a run-analysis report is folded back into this skill. When the operator corrects what a report should contain or how it should judge, change the procedure or self-check here, not only that one report.

## Self-check

- Workbench fetched read-only; 8790 never restarted; snapshot time in New York time.
- Agent frontier named, its movement stated, and its own report section covers configuration, wins and misses.
- Pool fixed first (cohort id or New York window), with included and excluded counts.
- Ranking used `FRONTIER_MILESTONES` from the viewer's `frontier.ts`: furthest milestone first, then the start-kind group, then `elapsedMs`, then `id`, with `recordedRun` eligibility and an agent controller, from the workbench only.
- Segment tables include the opening segment from 0.
- Segments recomputed from kept frontier splits, not `segmentMs`; split provenance labelled native, derived (≤) or screenshot.
- Every run's start kind stated; CLOCK_SET runs flagged and never compared on minutes with boot runs.
- LIVE runs marked and their tails re-read before reporting.
- Every run's switches, experiment arm and pinned commit recorded; pin-to-pin `git log` read.
- events.jsonl always streamed, never loaded whole.
- Every claim cites run id plus turn or seq; every hypothesis labelled with evidence and a cheapest test.
- Mistakes ranked by both frequency and summed minutes.
- N per arm per round stated; nothing called significant.
- Promotion recommendation given (all, some or hold), with the switches named and what would change it; nothing promoted.
- PokeBench review ran with four parallel personas on one packet, and answered helping or hurting and top-N confidence.
- Report passes `just pages-check`, returns 200 from 8791, and is linked once.
- No runs launched, nothing edited outside the report, the review packet and scratch, no `chat-thread` calls.
