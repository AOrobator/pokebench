---
name: pokebench-decision-probes
description: Design iterative PokeBench prompt probes, then launch, register, and verify each batch in the live viewer. Use for probe-decision calls, historical-context ablations, prompt tuning, held-out confirmation, and probe visibility repairs; not gameplay cohorts or passive run analysis.
---

# PokeBench decision probes

A sampling process or a report link is not launch proof. Every decision-probe study must appear in the canonical viewer's `/api/probes` list, `/api/probes/<id>` detail, and `/probes#<id>/<case>` page. Apply this to custom runners and single-turn probes as well as cohorts. Read the repository's `CLAUDE.md` and experiment-design skill for experiment policy; this skill adds registration and visibility requirements, not launch authorization.

## Plan and preserve evidence

Before scheduling or starting inference, apply [pokebench-run-coordination](../pokebench-run-coordination/SKILL.md). Coordinate the compute window with all affected owners; an idle endpoint or released lease is not clearance. Do not start a waiting worker before coordination.

- Freeze case identities, source context hashes, feature differences, sampling, fixed N and scoring before each batch. Adapt between exploratory batches, never inside a running frozen batch. Keep development cases and untouched confirmation families separate.
- Use per-endpoint gameplay leases. Inspect actual processes and lease owners; an idle scheduler can reserve a free GPU. Stop it only when authorized and no gameplay remains. Do not infer free hardware from an old status.
- Keep the runner, model-facing inputs, raw samples and provenance immutable during a measured batch. Visibility repairs must not restart or resample it.
- Rehearse custom runners on fake data before inference. Keep fake lanes out of the real registry.

## Default for prompt design: explore, diagnose and revise, confirm

Operator preference, October 22, 2026: maximize useful information per GPU hour. Start with directional evidence and trace inspection; reserve large fixed comparisons for promising candidates. Do not default to hundreds of repetitions per candidate simply because decision probes are cheaper than gameplay. An explicit operator request for a particular fixed comparison still governs that study.

Before launching, state the decision the next batch should inform, the total authorized GPU budget, the cost estimate from comparable calls, and the allocation across exploration, revision and confirmation. Reserve compute and untouched cases for confirmation before spending on exploration. Choose small initial batches that cover distinct cases and failure modes, rather than mainly repeating one context. There is no universal N or mandatory budget percentage: explain the tradeoff, including call latency, token use and uncertainty. Extra GPU-time authorization is not a reason to skip the exploratory stages.

1. **Explore.** Compare the incumbent and a few meaningfully different prompt hypotheses on the same development contexts with modest, balanced repetitions. Include contrast cases where the tempting intervention is inappropriate. Freeze each batch and its directional scoring. Record what each candidate changes and what observation would support revising, dropping or advancing it. Complete that batch before inspecting outcomes; report directional evidence rather than a confirmed winner.
2. **Diagnose and revise.** Inspect full successful and failed responses, including reasoning, delivered observations and the first proposed tool call. Separate mistaken facts, self-imposed constraints, repeated tactics, uncertain decisions and blocked actions. Use those findings to make a focused revision; record the trace evidence, exact wording change and proposed mechanism. Compare the revision with its parent or incumbent on development data before committing most of the budget. Reuse of inspected cases is development evidence, even when the new draws have fresh random seeds. Prefer a bounded number of informative revisions; stop when the next batch is unlikely to change the decision or the exploration budget is spent.
3. **Confirm.** Advance only a small number of promising candidates. Freeze wording, eligibility, rubric, primary outcome, comparison, sample size and analysis before opening untouched confirmation outcomes. Test on held-out source-run families, including neutral and adverse contrast cases; keep related histories together to prevent leakage. Size this fixed comparison for the effect and precision that matter within the remaining budget. Report repeated-draw reliability separately from transfer across contexts. If confirmation cases are inspected to revise wording, they become development cases and a further confirmation claim needs a fresh reserve.

Keep a compact experiment ledger: stage, prompt versions and lineage, cases/families exposed, frozen N, predicted and actual GPU cost, findings and the next decision. Report the whole search history rather than only the best candidate. Exploratory selection does not justify confirmatory significance claims; account for shared controls, family clustering and multiple comparisons in the frozen confirmation analysis. Trace explanations generate hypotheses, not proof that a particular sentence caused the gain.

This process permits planned adaptation between bounded batches; it does not authorize extra runs, favorable early stopping of a fixed batch, or new gameplay checkpoints. Coordinate each new compute window. If a large batch is already authorized and running, preserve it unless the operator changes that instruction; apply this process to the next design.

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
