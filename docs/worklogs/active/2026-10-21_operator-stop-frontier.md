# Operator stops preserve frontier progress

Operator correction 2026-10-21: an operator abort ends observation early; it does not invalidate earned frontier milestones.

Scope: workbench eligibility for readable operator_abort/operator_stop recordings, including fixed-ledger stop-only annotations. Preserve terminal reasons, log/native evidence validation, probe exclusions, checkpoint start rules and fixed-run validity/replacement/analysis rules. No agent behavior, launches or experiment outcomes change. Evidence: b300 and97a0 excluded solely for operator abort in record-audit wb.json.

M1 RED: regression for ordinary and fixed-ledger early stops reaching frontier, with probe/schema/config failures staying excluded.
M2 GREEN: narrow workbench correction, gates and recorded-run comparison.
M3 REVIEW/LAND: frozen Claude/Grok/GPT review and real-browser proof; no unreviewed merge.

RED verified: 3 failures/59 passes in workbench-store.test.ts before production edit (ordinary abort and both fixed-stop rows). GREEN removes standalone stop exclusion and only exempts exact stop-only fixed outcomes; reason/cohort/native splits remain. Plan mismatch reason remains excluded even with stop endReason. Fixed-ledger evaluator is untouched.

Gates: just test 3246 agent +1539 viewer +3560 Python; just lint/build/vendor pass. Coverage all >90 independently (agent97.26/93.08/97.7; viewer95.27/91.14/94.24; Python97.25/92.95/100, lines/branches/functions). Final coverage reruns changed frontier tests (121 focused pass before broad gates). No skips or gate reductions.

Preview uses startViewer (no CLI autorunner) on8896 and read-only linked copies of3 real agent recordings; no approvals copied. b300/97a0/a8f9 splits and hashes exactly match frozen report snapshot, IDs unique, no loss. New frontier97a0 MARC, then b300 TOMMY; a8f9 JOSH preserved. Browser legend says Agent frontier: stopped early97a0; b300 solid overlay, mark labels and stop reasons preserved. Preview lacks human source log (historical baseline not copied); human selection code unchanged. Screenshots and comparison receipt /tmp/operator-frontier-proof/. Early-stop missing milestones now censored, reached milestones unchanged. Review pending.

Review R1: Astra LGTM; Sol and Grok found one in-scope P2: HOW copy still described operator stops as invalid. FIX: consistent help sentence plus rendered-legend regression (RED1fail/9pass; GREEN111 targeted pass). Cloud Claude CLI logged out, Cursor Opus/Sonnet/Fable capped; Cursor GPT capped; isolated Codex rejects available model IDs under ChatGPT auth. These are unavailable approvals, not LGTM. R2 reviews use cumulative patch after help fix. No merge performed without required cloud approvals or explicit operator exception.

## Landing and live verification — 2026-10-21 00:54 EDT

Operator explicitly replied "yes u can land those changes for b300" to the request for landing with Grok and two independent fallback approvals. R2 Grok/Astra/Sol LGTM on772a4614, exact cumulative diff SHA2567d8d68155132cd44a654af204ee672f5175f8f9ef1c4f4034f205451fea47843. Required unavailable cloud lanes waived for this patch only. Fast-forward main46663221→772a4614 (exact reviewed tree).

Post-main initial test saw stale agent dist lacking move-learn features; no source defect or tests changed. Rebuilt main, reran all:3246agent+1539viewer+3560Python=8345pass. Prior lint/coverage/vendor remain green on exact patch.

Viewer772a4614 clean on8790, listener51664 at00:54EDT; gameplay9204/9209 both survived. Initial foreground wrapper's listener exited with tool session; reran through detached just viewer-main after confirming no listener. Stable detached wrapper returns success. Browser native b300 TOMMY point#15570 opens exact hash1fc39a7e…/268846652bytes and62:34.941, ended/operator_abort, no invalid-trial notice. Legend identifies97a0 stopped-early frontier, MARC126.4min; direct frontier helper agrees. Zero app console errors. Screenshot runs/mockups/operator-stop-frontier/shots/live-b300.png. All449run IDs retained, none duplicated;51b300/53_97a0/57a8f9 splits and hashes byte-identical to before. Full historical cache continues warming after restart; no full-cache completion claim. Runtime recordings/presets/outcomes untouched.

Original report banner corrected to reflect live landing. Evidence packets and authorization under runs/reviews/operator-stop-frontier/. M1–M3 complete.
