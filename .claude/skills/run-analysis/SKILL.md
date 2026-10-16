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

1. **Snapshot.** Fetch the workbench read-only:

   ```bash
   curl -s -m 200 http://127.0.0.1:8790/api/workbench -o <scratch>/wb.json
   ```

   - It can take minutes. Never restart 8790 to make it answer. If it is down, say so and fall back to `runs/*/events.jsonl` (first line for `run_start`, `milestone` lines for splits).
   - Record the snapshot time in New York time.
   - Live runs count. Mark each LIVE with the snapshot time, and re-read its `events.jsonl` tail just before reporting, since it moves.

2. **Rank by the story frontier**, exactly as `packages/viewer/src/frontier.ts` does.
   - **Order:** `FRONTIER_MILESTONES` parsed from that file. Never the workbench `milestones` list: it also holds optional milestones such as `FIRST_POKECENTER_HEAL` that would mis-rank.
   - **Eligible:** `excluded` null, `problem` null, `measurement.controller` is `agent`, and no `measurement.features` matching `probe`, `synthetic` or `replay`.
   - **Rank:** the last index in that order of a split without `screenshotEvidence`.
   - **Tiebreak:** that split's `elapsedMs` ascending, then `id`.
   - Take the top N (default 10).
   - Cross-check against `node .claude/skills/pokebench-review/frontier.mjs`, which applies the same rule. Explain any difference before going on.
   - State each run's start kind: boot, `MAIN_MENU` save or `CLOCK_SET` save (`config.start`, `config.resume`). The frontier chart only plots boot and `MAIN_MENU` starts. `CLOCK_SET` resumes stay in the list but are flagged: their minutes count from the save, so they are not comparable with boot minutes. Never say one beat another on time across start kinds.
   - Lead the report with the furthest milestones reached.
   - **Agent frontier.** Identify the current frontier run exactly as `frontierReferences` in `frontier.ts` picks `best` (boot or `MAIN_MENU` start, ended, live or paused). Say whether it moved since the previous run-analysis report (`runs/reports/run-analysis/`) or since the night began, which run it replaced, and when it moved, in New York time.

3. **Harness provenance per run.**
   - Read only the first line of `runs/<id>/events.jsonl` (`run_start`). Files run to ~150 MB: always stream (`head -n 1`, `tail`, `grep`), never load whole.
   - From it: `evaluation.features` (each switch on or off), `evaluation.experiment` (id, arm, trial), sampling, model and preset. The workbench `config.source` is the pinned commit.
   - Describe each switch from `experiments/fixed/<id>.json` and `experiments/<switch>.json`.
   - Build a round-to-round switch diff for each arm, and the bundle-minus-control diff.
   - Run `git log --oneline A..B` between consecutive pins, so behavior changes outside switches are visible.

4. **Segment table per run.** From `milestone` events (name, seq, turn, `t`), list minutes and turns between consecutive frontier milestones, plus the final segment to `run_end` (or to the snapshot for a LIVE run). The longest segments are the costliest stalls. Skip `present_at_start` milestones as segment ends.

5. **Fan out forensics in parallel.**
   - Write one shared brief at `<scratch>/brief.md`: the snapshot time, the run list, the segment tables and the exact output schema below.
   - Launch one subagent per 2 runs. Each follows `pokebench-trace-forensics` on its runs' 3 longest segments, plus what went well (fast segments, good recoveries).
   - Launch one more subagent to reconstruct harness history (step 3).
   - Tell every subagent: read-only, stream events, never call `chat-thread` tools, cite run id and seq or turn for every claim.
   - Output schema per run: a markdown card (run id, arm, start kind, furthest milestone, end reason, segment table, forensics classes) and a JSON block with `wins`, `stalls` (segment, minutes, turns, primary class, evidence seqs), `mistakes` (label, occurrences, minutes lost, seqs), `loop_guard` (fires, hits that ended a loop, false fires), `false_messages`, and `hypotheses`.
   - Reuse mistake labels across runs, so step 7 can count them. The brief lists the labels seen so far.

6. **Compare arms.** Where the cohort has paired arms (e.g. bundle on gpu0 and control on gpu1, same round and pin), tabulate the furthest milestone per arm per round. N per round is usually 1 per arm: say so, and never call anything significant from it. Hand power questions to `pokebench-experiment-design`.

7. **Synthesize.**
   - **(a) What went well**, and the switch or behavior behind it.
   - **(b) What went wrong.**
   - **(c) Mistakes.** Most common: runs affected and total occurrences. Costliest: summed minutes lost across runs. Show both rankings; they often differ.
   - **(d) Hypotheses:** harness changes that would fix the mistakes, switches that seem to help, switches that seem to hurt.
   - Every claim cites run id plus turn or seq.
   - Label each hypothesis **HYPOTHESIS**, with its evidence and its cheapest test:
     - a decision probe (`just probe-decision <run> <turn> <flags>`), for switches that change what the model reads;
     - a correctness fix and test, for false messages and wrong observations;
     - an experiment designed with `pokebench-experiment-design`, behind a switch per `feature-switch`.
   - Mark what the evidence cannot show (confounded pins, N of 1, CLOCK_SET minutes, live runs not finished).
   - Report grading blind spots to `pokebench-story-milestones`, and harness bugs as **harness bug** with trigger and evidence.

8. **PokeBench review.** Every run analysis gets one. Follow `.claude/skills/pokebench-review/SKILL.md`: four personas as parallel subagents on one shared evidence packet.
   - Build the packet from this analysis: the ranking with start kinds, the arm table, the switch and pin diffs, the stall cards and the hypotheses. Put it where that skill says (`runs/reviews/<YYYY-MM-DD>-run-analysis-<slug>/evidence.md`).
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
- Ranking used `FRONTIER_MILESTONES` from `frontier.ts`, its eligibility rule and its tiebreak.
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
