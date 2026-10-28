# Extraction workflow

Resolve the PokéBench repository explicitly (the skill can be installed outside it). Save the running viewer’s workbench response once, without restarting it. The `--frontier-source` must be the source alongside the built viewer used for that snapshot, resolved from the actual 8790 listener using `pokebench_env.current_runtime.serving_viewer_tree` (see `docs/current-run-snapshots-operations.md`), never assumed from a temporary directory or current main. Its sibling `dist/frontier.js` supplies grading-support checks. The recovery extractor requires an existing compatible `<repo>/packages/agent/dist/loop-recovery.js`; do not rebuild an active measured checkout merely to analyze it.

Create a manifest before ranking:

```json
{
  "runIds": ["<full-run-id>", "<another-full-run-id>"],
  "groups": {"Model A": ["<full-run-id>"], "Model B": ["<another-full-run-id>"]},
  "roles": {"<full-run-id>": "primary_census", "<another-full-run-id>": "primary_census"},
  "description": "Named cohorts or declared New York launch window and selection rule",
  "excluded": [{"id": "<excluded-id>", "reason": "administrative / live / rehearsal; never silently deleted"}],
  "cutoff": "2026-10-21T11:50:37-04:00",
  "humanReferenceId": "<recorded-human-id-if-available>",
  "priorBaseline": {"available": false, "reason": "No matched historical baseline"}
}
```

Replace example IDs and cutoff with the actual declared pool. Every included run belongs to exactly one model group; roles are `primary_census` or separately labelled `qualitative_context`. The current extractor accepts only boot and verified unstarted MAIN_MENU starts, with no present-at-start milestone facts. Checkpoint/other-save recordings are refused before earned-reach aggregation. It requires ended, hash-matching logs at or before the cutoff; inventory live runs as excluded from immutable ended-run metrics with their observed status, not as failures. It does not manufacture a historical live-prefix hash.

Run with argv paths:

```
python3 <skill>/scripts/extract.py --repo <repo> --workbench <snapshot.json> --manifest <manifest.json> --frontier-source <served-source/frontier.ts> --output <report-dir>
node <skill>/scripts/recovery.mjs --repo <repo> --output <report-dir>
```

Outputs: `metrics.json`, `grading-support.json`, `recovery.json`. Extraction refuses duplicate/ambiguous groups, missing runs, logs changed since the workbench snapshot and non-ended runs. The metrics retain exact run provenance, kept splits, cumulative token/time costs, negative-feedback/repeat proxies, required-frontier droughts, common-budget S/F/U/N with Wilson intervals and source hashes. Recovery retains type-specific production outcomes, complete/truncated/diagnostic follow-up, own-run base rates and source hash.

Author reviewed trace episodes from raw observations/actions/state and paired frames/RAM. Transform the extracted facts into the normalized renderer payload below, adding metric definitions, denominators, confounds and an explicit unavailable row for every requested metric not measured. This authoring step is deliberate: the renderer never invents an interpretation or intelligence score from raw proxy counts.

# Report renderer inputs

The renderer consumes a normalized report payload; keep the source metrics and this adapter output separately so a future reader can reproduce it. It never calculates gameplay grades. `--metrics` is the normalized payload, `--evidence` supplies reviewed episodes and optional supporting fields. Unknown measurements are explicit rows, not omitted fields.

Required top-level payload fields:

- `title`, `snapshot`, `verdict`, `scope`: text.
- `kpis`: list of `{label,value,note}` strings.
- `caveats`: list of text.
- `charts`: `{milestones:[{id,label}],series:[{name,color,values:[{milestone,turns,activeMinutes,n,total}]}]}`. Values can be null; line gaps stay gaps. Optional `turnLow`,`turnHigh`,`minuteLow`,`minuteHigh` are survivor ranges, not confidence intervals. Each point records its completion denominator. Chart series should be a model×arm/start/pin stratum or an identified actual reference, never an unlabeled pool.
- `sections`: list of `{id,title,intro,tables?,paragraphs?,items?,details?}`. `tables` are `{title,columns:[string],rows:[[scalar]],note}`. Null cells render N/A; every dynamic text cell is HTML-escaped. `details` are `{title,text}`. Put formulas, denominator handling, availability and interpretive limits in these sections.
- `runs`: list of `{id,model,arm,start,pin,stop,frontier,turns,minutes,note}` for the frozen manifest. Additional provenance belongs in a section or evidence appendix.
- `references`: list of `{label,status,note}`.
- `reproducibility`: list of text commands/file hashes/cutoff details, not instructions executed by the renderer.

Evidence payload requires `episodes`, a list of `{model,run,title,classification,window,observed,interpretation,receipts,limitation}`. Every field is text except `receipts` (list of text). Additional evidence keys are retained in an escaped appendix.

Example invocation:

```
python3 <skill>/scripts/render_report.py --metrics <report-input.json> --evidence <evidence-input.json> --output <report>/index.html
just pages-theme <report>/index.html
just pages-check <report>/index.html
```

The inline SVG/JavaScript chart switches between cumulative decision turns and elapsed active minutes. The companion table is the accessible precise source. This toggle makes no network request. A point's `n/total` is earned reach, not a failure denominator at an earlier budget. Detailed S/F/U/N common-budget tables belong in `sections`.

## Boundary regression checks

Run the bundled tests on an explicit, unchanged MAIN_MENU fixture run (not an arbitrary global first row):

```
python3 <skill>/scripts/test_analysis.py --repo <repo> --workbench <snapshot.json> --frontier-source <served-source/frontier.ts> --fixture-run <owned-MAIN_MENU-run-id>
```

They exercise actual aggregation, renderer and CLI paths, using isolated temporary roots for changed-log and checkpoint/inherited-fact cases. The recovery wrapper re-hashes each replay input and refuses a changed log before publishing combined outcomes.
