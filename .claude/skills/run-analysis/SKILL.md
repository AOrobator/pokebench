---
name: run-analysis
description: "Analyze PokeBench runs, population milestone success rates, and harness trends: top runs, overnight results, recurring mistakes, or whether reliability is improving. Read-only. Ranks story progress, measures full-population milestone reliability, traces harness provenance, reviews failures and changes, and writes an HTML report plus chat summary. Not for one run's stall (pokebench-trace-forensics), experiment design (pokebench-experiment-design), or patch keep/discard decisions (pokebench-patch-evaluation)."
---

# PokeBench run analysis

Find what the best recent runs did right, where they lost time, and which harness changes helped or hurt. This skill is read-only: no runs launched, no viewer restarts, no source edits. It writes only its report under `runs/reports/run-analysis/`, its review packet under `runs/reviews/` and scratch files. Sibling skills own the deep work:

- `pokebench-trace-forensics` explains each stall. This skill fans it out and adds it up.
- `pokebench-experiment-design` turns a hypothesis into a sized test. `feature-switch` puts any fix behind a switch.
- `pokebench-patch-evaluation` decides keep or discard. This skill only nominates.
- `pokebench-review` judges this skill's findings. Every run analysis includes one (step 8).
- `pokebench-story-milestones` owns grading blind spots. `agent-observability` owns signals that were never recorded or never reached the model.

Never call `chat-thread` tools from this skill or its subagents. Quote every time in New York time.

Never put backticks or `$(...)` inside an unquoted heredoc or a double-quoted shell string when writing a brief or report: the shell runs them. On 2026-10-17 a brief containing the text `just viewer-main` restarted the 8790 viewer mid-analysis. Write briefs with a quoted heredoc (`<<'EOF'`) or from a script file.

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
   - **Start-kind groups**, from `config.start` and `config.resume`: *new game* is `boot` (power-on) or the shared fast-text `MAIN_MENU` save; *checkpoint* is a `CLOCK_SET` save; *other save* is any other `save_state` start, including `resume` null; *unknown start* is a run with `config` null. Label every row with its group.
   - **Tiebreak:** group first (new game, then checkpoint, then other save, then unknown start), then that split's `elapsedMs` ascending within the group, then `id`. Boot and `MAIN_MENU` share a group because `frontier.ts` ranks them together, but say which each run is. Never call a `MAIN_MENU` start a fresh boot or a boot start: it loads a save with text speed FAST. The ranking order follows `frontier.ts` even though it sorts the two kinds together by `elapsedMs`, but the report never says a run was faster than another across boot and `MAIN_MENU`, nor against the human boot reference. Minutes are never compared across groups.
   - Take the top N: the operator's number when given (they have asked for 10, 30 and 50), otherwise 10. Scale the fan-out in step 5 to N. Never rank from `run_end.furthest_milestone` or the fixed ledger: they use `MILESTONE_ORDER`, which places optional milestones such as `FIRST_POKECENTER_HEAL` late and mis-ranks runs. Where they disagree with the frontier order, report it as a grading blind spot.
   - Cross-check against `node .claude/skills/pokebench-review/frontier.mjs`. The one required agreement: its "best valid new-game run" must equal the agent frontier below. Its other lists are a sanity view, not the same rule: they omit `MAIN_MENU` runs, rank `CLOCK_SET` resumes only from after the resume point, and split runs by status, so rows can differ for those reasons. It needs a built viewer in `POKEBENCH_VIEWER_WORKTREE` (default `/private/tmp/pokebench-viewer`), and gives up on the workbench after 60 s, so run it after step 1 has warmed the viewer and retry once if it times out. If it times out again, stop and tell the operator. Explain any disagreement before going on.
   - Charting follows the viewer's frontier chart (`shownAgent` in `frontier.ts`): new-game starts as solid lines, and `CLOCK_SET` resumes drawn dashed from Clock set onward and labelled "not from zero". Other-save and unknown-start runs are listed but not charted. Checkpoint and other-save minutes count from the save, so they are not comparable with new-game minutes. Never say one beat another on time across groups.
   - Lead the report with the furthest milestones reached.
   - **Agent frontier.** Identify the current frontier run exactly as `frontierReferences` in `frontier.ts` picks `best` (boot or `MAIN_MENU` start, ended, live or paused). Say whether it moved since the previous run-analysis report (`runs/reports/run-analysis/`) or since the night began, which run it replaced, and when it moved, in New York time.

3. **Harness provenance per run.**
   - Read only the first line of `runs/<id>/events.jsonl` (`run_start`). Files run to ~150 MB: always stream (`head -n 1`, `tail`, `grep`), never load whole.
   - From it: `evaluation.features` (each switch on or off), `evaluation.experiment` (id, arm, trial), sampling, model and preset. The workbench `config.source` is the pinned commit.
   - `evaluation` and `evaluation.features` are optional; older runs lack them even with a preset. When `evaluation.features` is absent, take switch states from the workbench `config.features` (its `on` is true, false or null). Keep null as unknown and never infer OFF.
   - Describe each switch from the matching fixed-run definition under `experiments/fixed/`, the registry in `packages/agent/src/features.ts`, and its linked explainer. Read the compared source pin when describing historical behavior; deleted queue-definition files are not required inputs.
   - Build a round-to-round switch diff for each arm, and the bundle-minus-control diff.
   - Run `git log --oneline A..B` between consecutive pins, so behavior changes outside switches are visible.

4. **Segment table per run.** Use the workbench splits, whose `elapsedMs` excludes operator pauses.
   - Keep only splits named in `FRONTIER_MILESTONES` and without `screenshotEvidence` (the ranking's splits). Compute the opening segment as the first kept split's `elapsedMs` (from 0, the run's or save's start), each later segment as the difference of consecutive kept `elapsedMs` values, and the final segment as the run's `elapsedMs` minus the last kept split. If the run's `elapsedMs` is null, leave the final segment unknown. A negative difference (possible next to a derived ≤ split) is shown as 0 and marked approximate. Never use `segmentMs`: it is measured from the previous split of any kind, including optional milestones, so it understates frontier segments.
   - Each split carries its own `turn` and `seq`: cite those.
   - Label provenance three ways: a native milestone (no `derived`); a `derived` split without `screenshotEvidence`, recovered from state events, with no `milestone` event at that seq, whose time is a first-observation upper bound (≤); and a reviewed-screenshot split (`screenshotEvidence` present), which is reported but never ranked or timed. The longest segments are the costliest stalls. Never time segments from raw `t` stamps: they include pauses.

5. **Fan out forensics in parallel.**
   - Write one shared brief at `<scratch>/brief.md`: the snapshot time, the run list, the segment tables and the exact output schema below.
   - Depth depends on rank. Ranks 1 through 20: one subagent per 2 runs, each run's 3 longest segments and 2–4 thinking examples. Ranks 21 and lower: up to 5 runs per subagent, each run's 2 longest segments and 2 thinking examples. An earlier packet's card may be reused only when the run had already ended (`run_end` recorded) before that card was written and its kept frontier splits are unchanged in this snapshot; convert it to the schema and add any missing section. Every other run gets a new card. Mind the concurrent-subagent limit (about 20); queue the rest. Each follows `pokebench-trace-forensics` on exactly its assigned runs (this skill already chose them, so the forensics run-selection step is skipped) at that depth, plus what went well (fast segments, good recoveries).
   - Launch one more subagent to reconstruct harness history (step 3).
   - Tell every subagent: read-only, stream events, never call `chat-thread` tools, cite run id and seq or turn for every claim.
   - **Thinking traces** (operator ask, 2026-10-17): every card says where the model's reasoning (`thinking` in `assistant` events) went well and where it went badly. Give 2–4 examples with seqs: reasoning that used delivered evidence and led to progress, and reasoning that went wrong (an invented fact or place, a delivered fact ignored, the same plan repeated, coordinates misread, a long looping think). Quote no more than about 20 words. Note thinking length and repeated plan sentences inside stall windows. Reasoning is the model's stated belief, never proof of cause.
   - Output schema per run: a markdown card (run id, arm, start kind, furthest milestone, end reason, segment table, forensics classes, thinking-trace findings) and a JSON block with `wins`, `stalls` (segment, minutes, turns, primary class, evidence seqs), `mistakes` (label, occurrences, minutes lost, seqs), `loop_guard` (fires, hits that ended a loop, false fires), `false_messages`, `thinking` (`good` and `bad` lists of seq, quote and why, plus `repetition_notes`) and `hypotheses`.
   - Alongside the cards, measure repetition for every run in one streaming pass over its `assistant` events, with these exact definitions so runs compare:
     - tokens: the `thinking` text lowercased, then every match of the regex `[a-z0-9']+` taken in order as one token (Python `re.findall`, JavaScript `match(/[a-z0-9']+/g)`), so "Go north, now!" gives go, north, now; a turn's gram set is its set of consecutive 4-token tuples; a turn with no thinking or fewer than 4 tokens has an empty set;
     - *length*: mean characters of `thinking` over all `assistant` events, empty ones included;
     - *Jaccard*: mean over consecutive pairs of non-empty sets of |A∩B| / |A∪B|, where B is the previous non-empty set;
     - *same-plan share*: assistant events whose non-empty set shares at least half of its own grams with any of the previous 5 non-empty sets, divided by all assistant events.
     A run with no `assistant` events, or with fewer than two non-empty sets, reports the affected metric as n/a with its denominator; a pair where either twin is n/a on a metric is not compared on it. Report the denominators (assistant events, non-empty sets) next to each value. Compare each pair of twins on all three.
   - Subagents run at the same time, so they cannot share labels. The brief gives a starting list of mistake labels; step 7 normalizes the labels across runs before counting.

6. **Compare arms.** Where the cohort has paired arms (e.g. bundle on gpu0 and control on gpu1, same round and pin), tabulate the furthest milestone per arm per round. N per round is usually 1 per arm: say so, and never call anything significant from it. Hand power questions to `pokebench-experiment-design`.
   - Before reading anything into the top-N arm composition, count the pools: how many eligible runs each arm had at the same start kind and cap. A top-N that is mostly one arm can just mean that arm had more long runs.
   - Check confounds and state each one: arm against GPU lane or port (did each lane run both arms?), pin drift between rounds (only pairs on one pin compare one harness), and switches added between rounds in response to earlier rounds' failures (tuning on the same start).
   - Count milestones that fired inside harness-driven input (for example dialogue auto-advance) per arm, so credited progress is attributed honestly.
   - Split the arm table into eras whenever the control arm's switch set changes (for example the control promotion at 986cb496 on 2026-10-16): bundle against an old control and bundle against a promoted control are different comparisons. Report each era's counts separately: rounds, bundle wins, control wins, ties and provisional rounds, with each early-ended twin's end reason, so failed runs stay visible; and separately the win count over the longest stretch of rounds that shared one frozen pin.
   - **Who won a round.** A round has a winner only when both twins have ended (`run_end` recorded) and share a start-kind group and wall cap; while either has not ended (live, paused, unresponsive), report only the provisional leader and keep the round out of win counts. Compare the twins on their kept frontier splits (steps 2 and 4: `FRONTIER_MILESTONES`, no `screenshotEvidence`). The arm whose furthest kept split has the higher index wins. At equal index the arm whose kept split there has the lower `elapsedMs` wins, unless the difference is under 1 minute, which is a tie. Neither twin having a kept split is a tie. How a twin ended never voids the round (the operator 2026-10-27). A twin that ended with an `infrastructure`-class failure (model error, crash, gateway outage), `stuck` or `stalled` is decided on kept splits like any other, its unreached milestones count as not reached, and the round is labelled with that end reason. Only an operator stop or abort censors: if the operator-ended twin stopped before reaching the other twin's furthest split, report the round as provisional rather than a win for either arm, labelled with the stop. For a time-only win, the divergence point is the first kept split after which the winner stays ahead in `elapsedMs`.
   - **Every round the control arm won** (operator ask, 2026-10-17) gets its own explanation. Send each pair to a subagent: line up the splits, find the first milestone where they diverge, then the first turn where behavior diverged at the same decision point. Classify the cause as a bundle-only switch (cite the message only the bundle saw, and its frames), run-to-run luck (same harness behavior, a different model choice), or something else (lane, infrastructure, a harness bug). State confidence with N of 1.

   **Population milestone success rates (required, operator 2026-10-19).** Best-run progress and population reliability answer different questions. Every report must show whether milestone success is improving over time, not estimate reliability from the selected top N.
   - Use the full step-1 snapshot population before ranking. How a run ended never excludes it (the operator 2026-10-27): crashes, model errors, launcher errors, operator aborts and stops stay in the ranking with their label (workbench `flag` or "ended by operator abort/stop") and their earned progress (`docs/benchmarking/grading-protocol.md`, "Run inclusion"); only `runs/exclusions/<run-id>.json` removes a run; separate human/probe/synthetic/replay records using recorded metadata. A trial excluded from ranking is not automatically invalid milestone evidence. Preserve accepted pre-interruption splits; actual grading problems cannot supply credited successes. Disclose no-event launch attempts separately when no validated run exists. Reconcile included/excluded counts and unique run IDs.
   - Compare within matching recorded model/artifact, start kind and save hash, assigned budget and fixed elapsed-time horizon. Boot, FAST-text MAIN_MENU, CLOCK_SET and Petalburg starts stay separate. Model aliases do not prove artifact/serving equivalence. Keep short-task targets, unknown origins and unknown budgets out of incompatible full-progression denominators while retaining their census rows. Use validated active elapsed time; label runtime/exposure changes rather than attributing them to policy.
   - For **every required story milestone**, count success only from a validated native or state-derived split by the chosen horizon, never a screenshot-only split, narration or an inferred missing intermediate milestone. Derived times remain first-observation upper bounds. Milestones already true at checkpoint load are N/A, not earned successes.
   - Show **S successes, F operational misses, U unknown/censored outcomes and N=S+F+U**. Primary delivered-success share is **S/N**, with possible-completion bounds **S/N to (S+U)/N**; unknown does not mean failure. A terminal crash/model error counts against system delivery, not as evidence of poor game decisions. Early operator stops and live/unresponsive runs are censored for horizons not observed; retain successes or full-horizon observations already recorded. Explain terminal/budget/target handling, including any grading uncertainty. Never silently drop failed launches or score an unfinished run as a future failure.
   - Separately show **S/(S+F)** for observed/terminal outcomes, with counts and an uncertainty interval (for example 95% Wilson). State that informative censoring, adaptive tuning and correlated trials limit inference; unknown-outcome bounds are not confidence intervals. If an interval or denominator is unsupported, show N/A, not zero.
   - Plot success shares over New York launch dates with N and unknowns visible, and tabulate source pin, clean/dirty/unknown status, recorded feature signature and arm. Preserve OFF versus unknown; a dirty source SHA is not an exact executed-diff identity. Make each grouping traceable to run IDs, validated split seqs and snapshot log receipts. Split runtime/control eras and disclose sampling, serving and co-arriving-change confounds. Do not turn a date trend or small stratum into a causal patch-benefit claim.
   - Include the full-population milestone table, matched time trend and harness breakdown in the report and review packet; state improving, declining or inconclusive with the actual reached/total counts. Check denominator sums, cohort membership, pre-load suppression, pre-interruption successes and censoring boundaries before delivery. Keep the ranked leaderboard alongside this view, not as its substitute.

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
   - **RAM audit** (operator ask, 2026-10-17). Runs store raw RAM snapshots in `runs/<id>/raw-ram/<n>.json.gz`, read only through `pokebench_env.raw_ram.load_raw_ram`. Send one subagent, following `pokebench-game-state`'s archive re-parse path only (skip its probe and live-verification sections: no probe runs or new emulator sessions), to check every suspected harness bug the cards raised against RAM at the cited seqs (for example readouts that blanked, whiteouts the briefings missed, reachability claims, readouts during warps), plus a sample of readout position, map and HP against RAM in a few top runs. Each gets a verdict (bug confirmed, not a bug, can't tell), its RAM evidence, the code location and the cheapest fix and test. Confirmed ones are reported as **harness bug**.
   - **Per-switch attribution** (operator ask, 2026-10-17). List every switch that changed in either arm across the analyzed runs (the step 3 diffs), and for each one decide from the traces **and the screenshots** whether it can be tied to better or worse play. Give the work to parallel subagents grouped by era (for example the bundle's additions before a control promotion, the promotion itself, and the bundle-only switches after it). Per switch: its mechanism; whether it reached the model (seqs of its text or event); whether the model's actions and the game state at the stall it targets changed against earlier runs and the same-round twin; the frames at 2–3 key moments (`runs/<id>/frames/<seq padded to 6>_<i>.png`, the images the model received). Thinking that quotes the switch's information may be cited as the model's stated belief, never as the proof of effect: a label rests on delivery, actions, state and frames. Label each switch HELPED, HURT, NO VISIBLE EFFECT or CONFOUNDED / CAN'T TELL, with confidence and the number of paired runs per arm behind it. PB3 applies: a HELPED or HURT label resting on fewer than 3 runs per arm from the same start is a hypothesis about that switch, is written as such, and cannot by itself support promoting or dropping it. Group switches that arrived together and cannot be separated, and name the prompt-wide ones (for example a system-prompt change) as confounds for everything else on that pin. The report gets a switch table with these labels.
   - **Existing switches to add, and bundle switches that hurt** (operator ask, 2026-10-17). Go through the registry in `packages/agent/src/features.ts` for every switch that is off in the arm under test, and match each normalized mistake from (c) to the existing switches whose mechanism targets it (for example story instructions the model ignores against an instruction or dialogue ledger, counter traps against counter talk). List each match with the mistake's minutes, the switch, why its mechanism fits, its readiness, and the suggestion to put it in the next bundle. Separately list every switch currently in the bundle (or in both arms) whose attribution label is HURT or that produced a false message, with its evidence, and suggest dropping or fixing it. Both lists are hypotheses with a cheapest test, not decisions: adding or dropping a switch is the operator's call.
   - **The costliest recurring failure gets a mitigation history** (operator ask, 2026-10-17). For the top mistake by summed minutes (to date, the model ignoring story instructions), list every switch ever built against it, from the registry, fixed definitions and feature worklogs: what each was meant to do, whether it reached the model, whether its information is cited before progress, and the measured effect where one exists. Then say what has worked, what has not and why (for example delivered but buried, delivered once and gone, or overridden by game priors), and propose the next mitigations as hypotheses with their cheapest test, such as a decision probe at recorded forks.
   - **Mechanism check.** For each switch the analysis calls helpful, harmful or unproven, state the effect it was supposed to have and measure that effect in the recorded data before judging outcomes. For example, presence penalty should reduce repetition, which shows in the `thinking` text of `assistant` events; a guard should end loops, which shows in what followed its `loop_guard` events. Compare each arm with its same-round twin before and after the switch arrived, and name the other switches that arrived on the same pin.
   - Mark what the evidence cannot show (confounded pins, N of 1, CLOCK_SET minutes, live runs not finished).
   - Report grading blind spots to `pokebench-story-milestones`, and harness bugs as **harness bug** with trigger and evidence.

8. **PokeBench review.** Every run analysis gets one. Follow `.claude/skills/pokebench-review/SKILL.md`: four personas as parallel subagents on one shared evidence packet.
   - Use that skill's steps 1–4 and 6. Its step 5 page is replaced by the report section below. The packet holds what that skill's step 2 requires (verbatim `frontier.mjs` output, fixed-run definitions/ledgers/status and worklog readiness evidence) plus, from this analysis: the ranking with start kinds, the arm table, the switch and pin diffs, the stall cards and the hypotheses. Put it where that skill says (`runs/reviews/<YYYY-MM-DD>-run-analysis-<slug>/evidence.md`). The review's write-up is the report's PokeBench review section, not a separate `runs/reviews/*.html` page, so the operator gets one link.
   - The review must answer two questions explicitly:
     1. **Are our harness changes helping or hurting?** Per arm, and per switch where the data allows.
     2. **How much confidence does the top-N arm composition give?** For example, 9 of the top 10 from one arm. Weigh selection effects (top-N picks winners from unequal pools), paired rounds, N per arm, start kinds and pin drift between rounds.
   - Keep each persona's verdict as written. The helping or hurting verdict is the one the personas agree on. If they split, report the split with each side's evidence; never average it away.
   - A missing persona is reported missing, never written by the coordinator.
   - Reviewers are cloud models only: Claude, Grok and GPT/Codex. Spread the personas across those families when their CLIs work (Claude subagents, `cursor-agent --mode ask --model <discovered Grok id>`, `codex exec` read-only), and record which model wrote each section. A read-only CLI lane cannot write its section file: the coordinator saves that lane's stdout verbatim as the section, which is not writing it. Never local inference models (`think_fast`, `think_swarm`, anything on `inference.example`): they are the models under benchmark.

9. **Promotion recommendation.** Every report recommends whether to fold the tested changes into the control arm and make that the new incumbent: promote all, promote some (name the switches), or hold. Base it on the arm table, the per-switch evidence and the PokeBench review's helping-or-hurting verdict. Name switches that look harmful or unproven and should stay out. Say what evidence would change the call. This is a recommendation only: `pokebench-patch-evaluation` owns incumbent promotion, and changing `experiments/fixed/*.json` or presets is the operator's decision.

10. **Outputs.**
   - **HTML report** at `runs/reports/run-analysis/<YYYY-MM-DD>_<slug>/index.html` in the main checkout (`~/dev/pokebench/runs/reports/...`). `just pages` serves the main checkout's `runs/reports/` under `/reports/`, so a worktree copy is not served.
     - Follow the CLAUDE.md "Explainers" rules: zero network requests, inline CSS and SVG, system fonts in the page's own CSS.
     - Pokémon themed: run `just pages-theme <file>` after every write of the page (generators included), so it wears the Emerald PokéNav theme (`docs/design/emerald-pages.css`). Use `main`, `h1`–`h4`, `.card`, `.kpi`, `table` and `details`; no solid side-stripe accents.
     - Diagrams, all inline SVG: a milestone-vs-minutes frontier chart of the top runs (new-game starts solid; every top-N `CLOCK_SET` resume dashed from Clock set and labelled, as in step 2), a stall bar chart of the longest segments, and a switch timeline across rounds per arm.
     - **Population reliability:** a prominent milestone-success section with the full-population census, every required milestone's S/F/U/N and rates, a matched success-rate-over-time chart, harness-version breakdown and reproducible denominator receipts (step 6). Clearly separate the frozen snapshot from later live updates.
     - Sections: snapshot and run table, frontier, **agent frontier** (its own section: which run it is and whether it moved; its full configuration: model, pin, arm, preset, sampling and every switch that is on; its segment table; what went well and what did not, with turn evidence), wins, what went wrong, harness bugs confirmed in RAM, thinking traces (well and badly, with examples), mistakes (common and costly, the costliest by summed minutes first), arm comparison by era, why control won (each such round), switch changes and per-switch attribution, hypotheses, existing switches to add and bundle switches that hurt, mitigation history of the costliest recurring failure, promotion recommendation (promote all, some or hold, and why), PokeBench review (each persona's verdict, the agreed helping or hurting verdict, the top-N confidence answer, disagreements), what the evidence cannot show.
     - `just pages-check <file>` must print nothing. Run `just pages`, then check `http://127.0.0.1:8791/reports/run-analysis/<YYYY-MM-DD>_<slug>/index.html` returns 200 before linking.
       - Then follow `.claude/skills/close-the-loop/SKILL.md` for reports: screenshot the page at 1280×900, 1440×900 and 375×812, with `<details>` closed and again opened, open every image, and check for clipped labels, overflowing tables or charts, squeezed columns and horizontal page scroll. Fix and re-check before linking.
     - Never `SendUserFile`, `/mnt/project-files`, `attached_outputs` or claude.ai artifacts for the HTML.
   - **Chat summary**, in this order. When the operator is away from the computer, the link will not work for them: the chat summary carries the whole result, split into several replies of 15 lines or fewer, and the link is an extra for later.
     1. Furthest milestones reached and which runs reached them (start kind, LIVE if so), and the agent frontier: which run, whether it moved, and its configuration in one line.
     1a. Population milestone success: reached/total, failures and unknowns for the key frontier milestones; whether matched reliability is improving over time, and the main confounds. Never substitute the top-N success fraction.
     2. Top 3 wins.
     3. Top 3 costliest mistakes, with summed minutes lost.
     4. Thinking traces: what went well and badly, in two or three lines.
     5. Why control won the rounds it won.
     6. Switch attribution: each judged switch's label (HELPED, HURT, NO VISIBLE EFFECT or CONFOUNDED) and how strong the call is.
     6a. The arm comparison by era (win counts per era and on the longest frozen-pin stretch) and the harness bugs confirmed in RAM, one line each.
     6b. What the evidence cannot show, in one or two lines.
     6c. Existing switches suggested for the next bundle (with the mistake each targets) and bundle switches that look harmful.
     6d. For the costliest recurring failure: what has been tried, what worked, what did not, and the next mitigations to test.
     7. The hypotheses, each with its cheapest test.
     8. The promotion recommendation in one line: promote all, some (which) or hold.
     9. The PokeBench review verdict in one line: helping, hurting, or split, and how much the top-N composition says.
     10. The one link, then the `open ~/dev/pokebench/runs/reports/run-analysis/<...>/index.html` fallback.

## Operator feedback

Operator feedback on a run-analysis report is folded back into this skill. When the operator corrects what a report should contain or how it should judge, change the procedure or self-check here, not only that one report.

Folded in so far:
- 2026-10-17 (top-50 analysis): analyze any top N the operator names; explain where thinking traces went well and badly; explain every round the control arm won; check suspected harness bugs against raw RAM; match existing switches to observed mistakes and list bundle switches that hurt; attribute each changed switch to better or worse play from traces and screenshots; lead the mistakes with the costliest by time lost; when the operator is away, put the whole summary in chat.
- 2026-10-19 (population reliability): require milestone success rates across the full population, matched trends over time and harness versions, explicit launch denominators and failure/censoring handling; top-run records alone do not show whether harness changes improve reliability.

## Self-check

- Workbench fetched read-only; 8790 never restarted; snapshot time in New York time.
- Agent frontier named, its movement stated, and its own report section covers configuration, wins and misses.
- Pool fixed first (cohort id or New York window), with included and excluded counts.
- Full-population milestone rates and matched date/harness trends accompany the top N; all required milestones have S/F/U/N, delivered and observed/terminal rates, uncertainty and run-level receipts. Failed trials remain visible, administrative exclusions preserve validated earlier evidence, checkpoint load facts are N/A, and unfinished horizons are censored. Denominator/edge-case checks pass; runtime and provenance confounds are explicit.
- Ranking used `FRONTIER_MILESTONES` from the viewer's `frontier.ts`: furthest milestone first, then the start-kind group, then `elapsedMs`, then `id`, with `recordedRun` eligibility and an agent controller, from the workbench only.
- Segment tables include the opening segment from 0.
- Every top-N `CLOCK_SET` resume appears dashed on the frontier chart; other-save runs are listed, not charted.
- Segments recomputed from kept frontier splits, not `segmentMs`; split provenance labelled native, derived (≤) or screenshot.
- Every run's start kind stated; CLOCK_SET runs flagged and never compared on minutes with boot runs; MAIN_MENU runs never called fresh-boot or boot starts.
- No milestone credited to a longer time cap when the run reached it before the earlier cap would have ended it.
- LIVE runs marked and their tails re-read before reporting.
- Every run's switches, experiment arm and pinned commit recorded; pin-to-pin `git log` read.
- events.jsonl always streamed, never loaded whole.
- Every claim cites run id plus turn or seq; every hypothesis labelled with evidence and a cheapest test.
- Mistakes ranked by both frequency and summed minutes.
- Every card has thinking-trace examples with seqs, and twins were compared on repetition.
- Every round the control arm won has a divergence explanation.
- Suspected harness bugs were checked against raw RAM, each with a verdict.
- Every costly mistake was matched against the existing off switches, and every bundle switch labelled HURT or caught in a false message is listed for dropping or fixing.
- Every switch that changed has an attribution label from traces and frames, with co-arriving switches grouped.
- The arm table is split by control era, and round winners were assigned only between ended twins on kept splits.
- When the operator is away, the full summary was posted in chat in replies of 15 lines or fewer.
- Each judged switch had its predicted mechanism measured in recorded data, with co-arriving switches named.
- N per arm per round stated; nothing called significant.
- Promotion recommendation given (all, some or hold), with the switches named and what would change it; nothing promoted.
- PokeBench review ran with four parallel personas on one packet, and answered helping or hurting and top-N confidence.
- Report has the Emerald theme (`just pages-theme`), passes `just pages-check`, returns 200 from 8791, was screenshotted and inspected at 1280, 1440 and 375 with details closed and open, and is linked once.
- No runs launched, nothing edited outside the report, the review packet and scratch, no `chat-thread` calls from this skill or its subagents, no backticks or `$(...)` inside unquoted heredocs or double-quoted strings in any shell-written brief or report.

## Loop guard effectiveness

Do not judge a loop intervention by "a story milestone or a new map within 30 turns". Run `just loop-recovery <run_id> ...` (`packages/agent/src/loop-recovery.ts`). For every loop-guard episode start, stall briefing (sent, held by the stall gate, or retired and recorded as a diagnostic), fixed-point breaker note and auto-talk attempt, it classifies the loop by the state at the fire and applies that type's recovery test within 30 turns:

- navigation: the player stands on a tile the fixed point did not use in the 20 turns before, or a story milestone;
- dialogue: the dialogue closes with field controls free;
- battle menu: a battle turn executes or the battle ends;
- interface: the menu or naming editor closes;
- story character (the readout names a story character on this map): the character speaks to the player, or a story milestone.

Every intervention also gets the shared safety check (no whiteout and no stuck, model-error or crash end within the window) and a relapse flag (the same intervention again within the window). Each rate is printed beside the run's own base rate: the same test from every turn of that loop type. Report recovered vs base, safe and relapsed per loop type and intervention.
