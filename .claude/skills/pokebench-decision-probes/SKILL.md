---
name: pokebench-decision-probes
description: Design, power-size, grade and publish valid PokeBench decision probes. Use for frozen switch comparisons, historical-context ablations, prompt studies and probe visibility repairs; pair with pokebench-probe-autoresearch for research-driven prompt optimization, not gameplay-cohort launches.
---

# PokeBench decision probes

A sampling process or a report link is not launch proof. Every decision-probe study must appear in the canonical viewer's `/api/probes` list, `/api/probes/<id>` detail, and `/probes#<id>/<case>` page. Apply this to custom runners and single-turn probes as well as cohorts. Read the repository's `CLAUDE.md` and experiment-design skill for general experiment policy. This skill owns probe validity, sizing, grading and publication; it is not launch authorization. For research/tuning requests, also use [probe-autoresearch](../pokebench-probe-autoresearch/SKILL.md), which owns candidate discovery, revision and durable resumption. A request for a single frozen comparison need not become an optimization search.

## Plan and preserve evidence

Before scheduling or starting inference, apply [pokebench-run-coordination](../pokebench-run-coordination/SKILL.md). Coordinate the compute window with all affected owners; an idle endpoint or released lease is not clearance. Do not start a waiting worker before coordination.

- Freeze case identities, source context hashes, feature differences, sampling, fixed N and scoring before each batch. Adapt between exploratory batches, never inside a running frozen batch. Keep development cases and untouched confirmation families separate.
- Use per-endpoint gameplay leases. Inspect actual processes and lease owners; an idle scheduler can reserve a free GPU. Stop it only when authorized and no gameplay remains. Do not infer free hardware from an old status.
- Keep the runner, model-facing inputs, raw samples and provenance immutable during a measured batch. Visibility repairs must not restart or resample it.
- Rehearse custom runners on fake data before inference. Keep fake lanes out of the real registry.

## Default for prompt design: explore, diagnose and revise, confirm

Operator standing instruction, October 22, 2026: never begin prompt development with large frozen arms. Start with small directional comparisons and trace inspection; reserve large fixed comparisons for promising candidates. More GPU-time permission does not waive the pilot. If an operator later explicitly overrides this standing instruction, explain the tradeoff before using that override; a request to try variants or increase repetitions alone is not a reason to skip exploration.

Operator instruction, October 29, 2026: **power-size confirmation and cap the entire research question at one aggregate GPU hour**, unless the operator explicitly changes that cap. Do not routinely ask for GPU hours. Include all calibration, exploratory/revision/final calls, failures, GPU grading and time holding the study's GPU lease. Two physical GPUs held for 30 minutes consume the hour. State cases × arms × draws per arm per case, total draws per arm, conservative cost and the protected confirmation reserve. Flag a design that cannot meet its evidence standard within the cap **after design and before inference**; never silently shrink N, relax evidence or exceed the cap.

### Development counts and final sizing

- **8 per arm per case:** broad development comparisons across distinct failures and adverse controls. Inspect complete finished batches before revising. Nonsignificance is not evidence of no effect.
- **16 per arm per case:** refine or replicate promising development candidates against a freshly sampled parent/incumbent. A new mechanism can return to 8 with a stated reason.
- **Confirmation:** choose one fixed N from baseline, smallest useful effect, source-family variation and the actual acceptance rule. It is not an automatic 32/64/128/256 ladder, and draws per case are not total draws per arm.

Read [power sizing](references/power-sizing.md) before designing confirmation or spending its reserve. Probe-research defaults are **90% target power and two-sided alpha .01 for the final comparison family per question**, with family-aware analysis and declared regression limits. Independent-draw Fisher sizing is a reference, not transfer power for repeated historical contexts. These are probe-specific defaults; general gameplay-cohort defaults remain with experiment-design. A valid result can be supported improvement, rejection or inconclusive evidence. A report must not promise a winner.

1. **Explore.** Compare the incumbent and a few meaningfully different prompt hypotheses on the same development contexts with modest, balanced repetitions. Include contrast cases where the tempting intervention is inappropriate. Freeze each batch and its directional scoring. Record what each candidate changes and what observation would support revising, dropping or advancing it. Complete that batch before inspecting outcomes; report directional evidence rather than a confirmed winner.
2. **Diagnose and revise.** Inspect full successful and failed responses, including reasoning, delivered observations and the first proposed tool call. Separate mistaken facts, self-imposed constraints, repeated tactics, uncertain decisions and blocked actions. Use those findings to make a focused revision; record the trace evidence, exact wording change and proposed mechanism. Compare the revision with its parent or incumbent on development data before committing most of the budget. Reuse of inspected cases is development evidence, even when the new draws have fresh random seeds. Prefer a bounded number of informative revisions; stop when the next batch is unlikely to change the decision or the exploration budget is spent.
3. **Confirm.** Advance one finalist by default. Freeze wording, placement, eligibility, persistence, rubric, primary outcome, comparison, sample size, regression limits and analysis before opening untouched confirmation outcomes. If multiple final candidates or final looks are designed, preserve the question's combined error budget. Test on held-out source-run families, including neutral and adverse contrast cases; keep related histories together to prevent leakage. Size this fixed comparison for the effect and precision that matter within the remaining budget. Report repeated-draw reliability separately from transfer across contexts. If confirmation cases are inspected to revise wording, they become development cases and a further confirmation claim needs a fresh reserve.

Keep a compact experiment ledger: stage, prompt versions and lineage, cases/families exposed, frozen N, predicted and actual GPU cost, findings and the next decision. Report the whole search history rather than only the best candidate. Exploratory selection does not justify confirmatory significance claims; account for shared controls, family clustering and multiple comparisons in the frozen confirmation analysis. Trace explanations generate hypotheses, not proof that a particular sentence caused the gain.

This process permits planned adaptation between bounded batches inside an authorized search contract; it does not authorize unplanned extra runs, favorable early stopping of a fixed batch, or new gameplay checkpoints. Coordinate each new compute window. If a large batch is already authorized and running, preserve it unless the operator changes that instruction; apply this process to the next design.

## What has moved the model so far (evidence to 2026-10-28)

These are priors for choosing candidates, not rules. Each one comes from a small number of studies, mostly on Qwen 3.6. Recheck them when the model, the harness or the decision type changes. Paths are under `<repo>/`.

1. **The text must sit near the decision; in the scene study no system-prompt placement worked. Once the text is near, the wording matters most.**
   - Scene follow-up (9e33 t1385): every system-prompt placement scored 0/16, including the wording that scored 16/16 as the last message.
   - Once the text was near the decision, concrete wording scored 13–16/16 in every channel. The original line scored 0–7/16.
   - Type gap: control 13/64; the block on the result 40/64; the result plus a last-message copy 55/64. These score stated catch/find plans, not native captures. The shipped-path replication was 16/32 vs 29/32 on the same exposed four cases, not another fresh transfer confirmation.
   - Text appended inside a long tool result is fragile: pooled held-out 0.35, against 0.44 as a SUPERVISOR message.
   - Sources: `runs/reports/run-analysis/2026-10-27_scene-followup-prompt-research/`, `runs/reports/run-analysis/2026-10-28_type-gap-probes/`.
2. **Facts steer when they fill a gap the model cannot fill and come with the controls to act. They lose to strong priors.**
   - Type gap is the success case: type chart, wild Pokémon met, balls and controls moved the plan from 13/64 to 40/64.
   - a702 Dewford warns against treating an ineffective implementation as a failed idea. Some header/JIT arms preserved the recorded exits line despite a switch flip and were effectively controls (see setup item 7). Their outcomes do not estimate the intended exit-line treatment. Audit the actual rendered contrast before interpreting earlier reports.
   - A readout that changes the stated goal is not a result. Score the action.
   - Facts can also steer wrongly: a "Ways off" line drove 4/8 walk-aways at f28d T451.
3. **In the scenes tested, an imperative tied to what was just observed worked best. Beliefs, explanations, plan corrections and abstract strategy did little; questions moved some samples but less than the imperative.**
   - Scene note "walk to the nearest person who took part… press A": DEV 90/96 vs off 2/96; fresh held-out 141/160 vs 5/160.
   - Heal-first (97a0 t157): fact plus rule plus game quote plus exit moved walking to MAY from 13/16 to 4/16.
   - Abstract prompts failed: Roxanne used 10 mechanisms and scored at best 1/3. In the scene study the belief wordings scored 0–3/16 and the question forms 7–10/16, against 15/16 for the concrete imperative and 0/16 off.
   - Quoting a failed call can reinforce it: the positive supervisor's naming of it made T3259 repeat it, 9 → 21–27/32. Treat that as a tested failure mode, not a universal ban on evidentiary action summaries.
4. **Name what the game showed.** In the scene note, quoting the participants by name (C_said_who) beat the generic note: fresh held-out 111/160 → 141/160. It also cut the forced-misfire cost from 25/32 to 2/32. Quotes alone were worse than the generic note: C_said 71% vs 82%. The names do the work.
5. **Removing stale or misleading text often beats adding text, but not always.**
   - Double Kick: with the model's own "skip new moves" thinking removed, the baseline was already 8/8.
   - f28d T451: removing the note took walk-aways from 4/8 to 0/8.
   - no-story-foreknowledge: TEAM AQUA in the reasoning went 12/16 → 0/16.
   - Removing a stale goal did nothing at f28d T455: 6–7/8 still walked south.
6. **The trigger must be strict and deterministic, and misfires must be measured.**
   - The guarded scene trigger fired 74 times across 494 runs, all on real story scenes.
   - Without its movement and return-to-field conditions it fired 191 times, mostly on nurse lines, menus and battle text.
   - Forced misfires measure the cost of a wrong firing: the generic note cost 25/32 on a no-scene turn; the names version cost 2/32.
7. **Development winners often lose on held-out cases.**
   - Scene variant A scored 16/16 on DEV but was the weakest on held-out: 0.35 vs 0.42 and 0.44.
   - Double Kick improved blanket refusals (10 → 4/116) but worsened false claims (23 → 44) and illegal requests (0 → 3) on held-out.
   - Do not promote against held-out regressions. Switches promoted without probe support, or against held-out results (Double Kick, the Dewford readouts, positive supervisor variant A), are open questions, not evidence.

**Effects are endpoint-specific, not a universal prior.** Selected large results include scene-participant approach 5/160 → 141/160 (+85 points), native Double Kick acquisition 4/32 → 30/32 (+81 points) in one known context with a custom executor, and type-gap catch/find plans 13/64 → 55/64 (+66 points). Refinements were smaller: named scene note 111/160 → 141/160 (+19 points), final type-gap copy 40/64 → 55/64 (+23 points). Nulls and regressions also occurred; the move-matchup revision improved factual accuracy 38/64 → 51/64 while supported decisions stayed 51/64 in both arms. These selected, clustered studies neither estimate a typical future lift nor prove gameplay benefit. Historical 32-per-case studies are precedents, not a confirmation rule; use the power-sizing contract above. N=1–3 screens with invalid fidelity cannot support a decision.

**The missing step.** The historical audit through 2026-10-28 did not establish a fixed-run confirmation of a probe-driven switch; check current cohort evidence before repeating that historical status as current. A probe win is a candidate for a cohort, not a measured benchmark gain.

## Choose decision points and outcomes

- **Pick real choice points.** Probe turn N replays the decision made from result N−1, so check the state the model saw then. Turns spent pressing through a menu, dialogue or the PokéNav are not choice points: a702 T663 was all `press B` in every arm. Pick the turn where the recorded run chose the outcome you want to change. a702 T664 is where it took Rustboro's EAST edge.
- **Confirm the treatment reaches the context.** Before using the GPU, run `--context-only` and check "flipped context differs in: …". If the change is a readout, confirm offline (the replay or the unit fixture) that the exact text sits where you expect at that turn.
- **Score where the model goes, not keywords.** Classify the tool call by direction of travel or target: the map-table edge, the warp, or coordinates against the exits. Words in the reasoning are confounded by readout text. Route 116's own line "SOUTH edge -> VERDANTURF TOWN" made every sample say "south". Report stated intent separately.
- **Know what drives the recorded arm.** At a702 T681, the recorded arm's 8/24 westward moves followed Dad's stale "Head for RUSTBORO CITY" line, not Briney's.
- **Freeze a held-out split before looking.** Include a negative control: contexts where the intervention should not fire or should not change the action.
- **Test the note at the decision it must change, not where the trigger first fires.** heard-line-route-note (2026-10-28):
  - The model ignored Briney's note 0/8 right after a step out of Rustboro onto Route 116 (a702 T665).
  - The same content, delivered at the Rustboro exit choice itself, moved strict SOUTH-exit counts from 2/96 to 30/96. The reported pooled p ≈ 2e-8 is descriptive: the audit found reused source families and scoring revisions, so this is not an untouched-family confirmatory claim.
  - Compute where a trigger fires in recorded runs, offline, before any GPU. Then check that it is armed at the real choice point; a persistent trigger may be needed.
- **Check the channel before a wording sweep.** Send a harmless instruction ("reply with only the word PINEAPPLE") in each candidate placement, 4 samples each. In a702's request shape:
  - final user message: 4/4
  - a message right after the last tool result, ahead of the trailing memory block: 2/4
  - last line of the tool result: 1/4
  - merged into the trailing memory block: 0/4
  - This is a small salience diagnostic, not a guarantee of task compliance or a definitive failure from four draws; preserve the actual delivery proof separately.
- **Score blind and strictly.** Score per arm under random codes before opening the key. Count only actions valid in the current state: an exit issued with another map's id is not a move. Report lenient counts separately.

## Qualify the actual intervention before sampling

- Freeze each candidate as text/template, placement, deterministic eligibility and persistence/consumption. Check the real choice point and negative controls; a large lexical diff at an irrelevant turn is not a useful experiment.
- Bind system prompt, messages/roles/parts, images, tool definitions, sampling (including penalties and reasoning limits), model/quant/template, runtime pins and scorer to the measured request. Preserve the actual final provider request or hashes where capture permits. Matching counts, approximate tokens, or two reconstructions using the same transform do not prove exact delivery.
- Classify the baseline as recorded-exact, validated reconstruction, or approximate diagnostic. Historical missing wire bodies must be disclosed; resolve unexplained differences before sampling and limit the claim to what the reconstruction supports. Do not disable unrelated historical switches or strip context simply to make replay pass.
- Exercise the production transform order, multipart text and stateful trackers over the full relevant prefix, including history later dropped from the model window. Verify the changed text and tools in every arm, prompt-plus-output fit, and final note ordering after all wrappers. An unsupported switch flip fails closed rather than silently becoming control.
- Qualify the scorer against the pinned production validator/tool path and task endpoint. A copied phrase, changed call, good explanation or gate-conditional synthetic example is not automatically task recovery. Version and preserve grading corrections; evaluate transfer with genuine contrast cases and inspect full responses only on development data or after the final lock.

## Setup checklist for `just probe-decision` in a worktree

The 2026-10-28 GPU windows lost runs to each of these. Check them with a `--context-only` dry run before taking the GPU lock:

1. **`.env` must be present.** Linked worktrees do not get the main checkout's gitignored `.env`, so `POKEBENCH_ROM` is unset and the re-render step fails at once. Call through `just` so `.env` loads. The operator links it (`ln -s ~/dev/pokebench/.env <worktree>/.env`).
2. **The vendored submodule must be checked out.** Run `git submodule update --init env/vendor/continual-harness` in the worktree. Without it, map tables such as `env/vendor/continual-harness/pokemon_env/porymap/data/maps/map_groups.json` are missing.
3. **Rebuild `dist` after a merge.** Tests and the CLI read `@pokebench/agent` from `dist`. After merging new switches, run `pnpm -r build`, or new switch ids show up as "unknown feature".
4. **Record the probe's exit status.** In a batch script, write `just probe-decision … ; rc=$?` and log `$rc`. `echo "… $(date …) rc $?"` logs the status of `date`, so failed runs showed rc 0.
5. **Check the context budget and fidelity.** `--recorded-trim` matches the recorded message and image counts at the recorder boundary, not the exact provider request. Also validate content/ordering, tools, images and derivation scope above, and token fit separately (item 6). Use `--recorded-trim` when the run trimmed context. Use `--trust-header` when the change is to harness-trust's Story goal line.
6. **Fit the context to the lane's window.** A context larger than the serving lane's window comes back as a model error, and `sample()` records it as a decision. Every 88ea sample (80,848 tokens against GPU1's 65,536) was an error. Before scoring, grep the samples for "model error", and make sure the rebuilt prompt plus the output allowance fits the serving lane's window.
7. **`--trust-header` keeps the recorded exits line word for word.** An arm that flips a switch which changes the exits line (jit-exit-dialogue-v1) shows nothing new unless that line is re-derived too. The 2026-10-28 jit arms at a702 T681 and T664 were effectively control arms. Confirm the arm's text with `--context-only` or a dry dump of the last result.
8. **Replay-runner gaps.**
   - Runs with gym-heal-warning-v1 need the Replay recorder's `gymHealWarning` hook. A no-op keeps the text.
   - Events files over about 2 GB need `node --max-old-space-size=12288`.
   - Another model's run (Astra 429f) may not host the arm's switch set ("switch set is inconsistent").
9. **Size the batch to the lock.** Comparable calls took 1.3–3.3 minutes per arm of 8 at ~20–35k tokens. Reserve the complete frozen batch and teardown before starting. Order exploratory batches by information value between batches; a deadline-truncated batch remains incomplete, with all partial calls retained, rather than an analyzed favorable subset.

## Ground the correction in the traces

For prompt tuning, distinguish general wording from a correction aimed at a specific error. Inspect the recorded trace for the mistaken assumption or self-imposed constraint before choosing a candidate. A reminder can leave the action open while precisely correcting that assumption; broad wording alone does not make it an untargeted intervention.

- Quote the source reasoning and identify which part of the candidate addresses it. Treat the proposed mechanism as a hypothesis until an ablation distinguishes it from a generic reminder or other explanation.
- Consider correcting the evidenced assumption while restating the actual task and preserving the model's choice. Keep game facts, the operator's instructions and the model's own plan distinct. A candidate need not name the desired move or action to be useful.
- Check factual applicability. A sentence such as “your earlier reasoning about skipping new moves was your own plan, not a rule” belongs only in histories supporting that premise. Include neutral histories and cases where declining is appropriate when testing transfer; do not manufacture a past mistake to reuse a successful correction.
- When useful within the stage's budget, compare the incumbent, a generic task reminder and the targeted correction, keeping other context and sampling fixed. Prior successful wording is a candidate or reference, not a guaranteed winner on the new task. Test whether a focused correction helps beyond merely quoting the earlier thought or asking the model to reconsider.
- Grade the actual task outcome separately from stated intent. Check for regressions and indiscriminate action bias, rather than treating a higher rate of the desired action as success in every case. If production delivery adds an eligibility gate, verify that gate separately from the wording's measured effect.

Example, October 22, 2026: the Double Kick reminder did not tell the model to choose Double Kick; it corrected the model's earlier “I don't need new moves” plan and asked it to evaluate the displayed comparison. In 100 fresh repetitions of the original context, native moveset checks found 86 acquisitions and 14 declines, with no errors (exact 95% interval 77.6–92.1%). Evidence: `<repo>/runs/reports/double-kick-100-20261022/analysis.json`. This supports the candidate in that context; it does not isolate the causal sentence or establish transfer to other Pokémon, later game states or neutral histories. Consult the separate held-out report before making a broader claim.

## Publish before sampling

Create a study directory under the canonical `runs/` with:

- `manifest.json`: `id`, `cases[{id, run, turn, split, category}]`, the changed feature and arms; expected lanes when known.
- Each real lane: `status.json` with state, completed/planned, worker startup, and actual sampling start; `samples.jsonl` with `{case, arm, sample, at, elapsedMs, decision:{key, thinking}}`; `provenance.json` identifying the actual model.

The standard CLI's standalone `runs/decision-probes/*.json` output is not automatically discovered by the viewer. Use an adapter to expose its real results in the study/lane shape; do not claim the study is registered merely because the CLI wrote a file. Do not invent samples, statuses or provenance.

The viewer reads only `runs/probes/<id>/` or a pointer `runs/probes/<id>.json` containing `{version:1, dir:"relative/path/under/runs", title:"..."}`. A launch-receipts folder alone is invisible. Directory symlinks are not registry entries.

For an existing compatible runner, use the bundled publisher:

```sh
python3 <skill-dir>/scripts/publish_probe.py \
  --runs-root <canonical-repo>/runs \
  --source <canonical-repo>/runs/<actual-study-dir> \
  --id <study-id> --title "Human-readable study title" --watch
```

Detach the bounded publisher with its own log when it must outlive the turn. Reuse an existing registry id for the same study; do not create duplicate cards. The publisher does not launch or stop model calls.

It creates a display projection under `runs/probe-ledgers/<id>/`, points the registry there, and links samples/provenance to the live source. Display status is refreshed atomically. Originals are not changed. It preserves worker startup as `queuedAt` and uses the first real sample's `at` as displayed `started`: a long resource wait must not make a newly running probe sort below older completed probes or corrupt its ETA.

The viewer accepts `development` and `heldout` splits. The helper maps `new_evaluation` to the display's `heldout` category while preserving `sourceSplit`; the untouched reserve is not an active sampled case. Unknown split names fail rather than being silently relabelled. `waiting_for_compute` is displayed as unknown/pending, never falsely as running; `incomplete` maps to stopped, never complete. A pending page may require reload once sampling starts because current viewer polling follows running lanes.

## Verify the operator's surface

Before claiming **launched**, verify all of:

1. The registry API lists the exact id once, with every real lane and the correct planned denominator. An unknown/pending entry is registered, not yet sampling.
2. Detail API returns every frozen case, the expected source runs/turns and live sample counts, with no unexplained problems. Check counters and schema only during a blinded study; do not inspect arm outcomes early.
3. Open `/probes` in the actual browser, choose the study through the visible selector, and confirm its model, lane counts and frame. Verify a second refresh advances counts while sampling; if it finishes during verification, show terminal counts instead.
4. Show the current study first when appropriate: compare actual sampling start, not process/queue startup. Give an explicit `/probes#<id>/<case>` link so an older selected hash cannot hide the new study. Do not clear user selections or restart the viewer to force visibility.
5. After completion, source status, viewer status, sample totals and published report agree. Keep registration available after completion.

Use the repository's viewer-e2e skill for a broken control or polling behavior. An API 200 alone does not prove a visible click-through. Do not restart the viewer or edit gameplay for a data-registration repair. Do not add probe marks to the closed TIMELINE.

## Respect grading boundaries

The viewer's automatic “departs from recorded call” color is a proxy, not successful recovery. Its generic Fisher display does not replace a preregistered paired/clustered analysis. Repeated draws from one historical context are not independent gameplay runs. Preserve model groups; never pool Mac Qwen 3.8 and GPU Qwen 3.6. During operational visibility checks for a blinded batch, hide outcome bars and response details. Give graders the response reasoning and state evidence needed for scoring while withholding treatment labels and aggregate outcomes until scores are locked; visibility verification must not become interim outcome analysis. Deliberate trace inspection belongs after a completed exploratory batch and must not contaminate untouched confirmation.

Report the exact viewer link, verified progress, resource-wait state, and any missing proof. A publication failure leaves launch incomplete even when sampling continues; repair the display without losing or rerunning recorded calls.

## Operator report

Report the research question, executive answer, measured endpoint, per-family effect/uncertainty, regression checks, total resource use and whether the evidence is supported, rejected, inconclusive or invalid. Follow active operator report preferences through a global reporting skill when available; personal presentation/delivery configuration does not belong in project skills. Keep detailed raw evidence linked separately from the operator summary.
