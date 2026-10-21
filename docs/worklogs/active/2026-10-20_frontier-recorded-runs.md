# Story Frontier recorded-run visibility

Operator asks to fix all experiment graphs showing only agent/human references and backfill if necessary.

Single milestone: audit all real cohorts, retain trustworthy stopped/failed recording progress as excluded dotted overlays, explain every selected recording without plottable progress, prove recovery in real browser, gates, review and authorized local landing. Preserve original event logs; no inferred milestones, no experiment launches or gameplay changes.

Evidence: existing Chrome 1657055914 on 8790 comparisons, selected whole-map pair v5. Server PID 11377. Cold partial snapshot loading 445 recordings. V5 has both traces after load. Older snapshot exposes 13 operator-aborted, 2 launcher-outcome and 4 infrastructure-outcome cohort recordings suppressed despite valid native measurements. Story checkpoint classification already recognizes all frontier milestones. Fixed-run failures already plot correctly.

- [ ] RED/GREEN: stopped/failed overlays and explicit per-selection accounting, no probe/provenance weakening, gold unchanged.
- [ ] Real all-cohort before/after audit; determine whether backfill is needed.
- [ ] Tests, coverage, lint/build, browser desktop/phone and polling.
- [ ] Frozen review and landing/live proof when all mandatory cloud lanes approve.

## Implementation and evidence

- RED committed 8df4d944. Three stopped/legacy-failed overlay tests and coverage accounting failed. Cold snapshot tests also reproduced disappearing records.
- GREEN: trusted stopped/failed overlays remain excluded and dotted; references remain independently eligible. Selected traces draw above references at higher opacity. Expandable recording accounting links to replays, reports furthest recorded checkpoint/reason, and distinguishes loading, unavailable and time-outlier-hidden recordings. Expansion/focus survive polling.
- Cold snapshots retain strict-header-only placeholders with cohort/preset identity, no measurement or splits, no frontier eligibility or live claim. Warm results replace them; rewrite/truncation integrity remains enforced.
- Read-only real-data audit: 445 unique recordings, 63 cohorts; 17 previously hidden cohort traces restored, no prior trace lost, identical gold frontier a8f9. All 64 browser selections (including All recorded runs) exercised, no duplicate points. Five cohort recordings have only GAME_RUNNING and no story checkpoint; no fabricated progress/backfill. Original event logs unchanged.
- Browser snapshot preview 8799 is GET-only and starts no experiment runner. Recent v5 pair reports 2 selected / 2 plotted with endpoints Route 101 10:18.190 and bedroom 3:25.504; first whole-map pair shows b300 and 35df through gym trainers. Restored ecda0ee Petalburg pair visible with not-from-zero origin and exclusion reason.
- Tests: viewer 1503 and agent coverage gates pass (viewer lines/branches/functions 97.81/91.05/94.18; agent 99.16/93.04/97.57). Python initial direct invocation missed ROM environment, fixed and rerun: 3166 pass, zero skips; coverage 97.11/92.69/100. Full lint/build/vendor pass. experiments-audit prints nothing. Desktop/phone screenshots under canonical runs/mockups/frontier-recorded-runs/shots/.

## Review round 1 and repair

- Frozen f6a99db3, base 24648e12, packet 6c90c16b…d57aee. Grok LGTM (terminal exit 0); independent GPT/Codex LGTM with verified digest and 92 focused tests. Claude direct OAuth expired; Cursor Claude Opus/Sonnet/Haiku usage-capped. Cursor GPT usage-capped, replaced by independent GPT/Codex per standing equivalent-harness rule.
- Independent Astra fallback found concrete P2: replay links inside expanded recording coverage lost keyboard focus on the five-second poll. Accepted and fixed; RED regression reproduced it, then preserved exact replay href across replacement with summary fallback if the recording disappears. Viewer final 1504 tests pass; coverage 97.81/91.06/94.18 (lines/branches/functions), lint passes. Agent/Python sources unchanged from gated tree.
- Read-only backfill warm completed all 445 projections without reader problems; 435 finished logs retain exact SHA256 and bytes. Fresh cache-only partial reader immediately reuses all 435 ended records; only ten unended logs need a fresh read. No gameplay action or run restart.
- Final source packet will be re-reviewed; no self-merge while required Claude lane remains unavailable without an operator exception.
