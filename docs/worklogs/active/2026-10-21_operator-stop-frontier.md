# Operator stops preserve frontier progress

Operator correction 2026-10-21: an operator abort ends observation early; it does not invalidate earned frontier milestones.

Scope: workbench eligibility for readable operator_abort/operator_stop recordings, including fixed-ledger stop-only annotations. Preserve terminal reasons, log/native evidence validation, probe exclusions, checkpoint start rules and fixed-run validity/replacement/analysis rules. No agent behavior, launches or experiment outcomes change. Evidence: b300 and97a0 excluded solely for operator abort in record-audit wb.json.

M1 RED: regression for ordinary and fixed-ledger early stops reaching frontier, with probe/schema/config failures staying excluded.
M2 GREEN: narrow workbench correction, gates and recorded-run comparison.
M3 REVIEW/LAND: frozen Claude/Grok/GPT review and real-browser proof; no unreviewed merge.
