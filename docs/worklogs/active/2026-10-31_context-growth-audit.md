# Context growth audit and shared bounds

Operator request 2026-10-31: enable supervisor-briefing-bound-v1 and compact-map-grid-v1 in both arms. Audit supervisor messages, instruction memory and growing model context report-only. No other behavioral changes or run launches authorized.

Scope: move only those two IDs from current recipe switches to onInBoth, set base bits true; frozen recipes and historical records unchanged. Audit output is ignored runs/reports content.

- [ ] RED effective arm tests
- [ ] GREEN recipe role and resolved-feature validation
- [ ] Required gates and independent review
- [ ] Landing board and post-main checks; no gameplay restart/launch
- [ ] Report read-only source inventory plus historical measured payloads and ranked proposals

RED: fixed-definition.test.ts 20 PASS / 1 FAIL because compact-map-grid-v1 is absent from onInBoth. The added test checks resolved flags and materialized preset features for both arms of all four maintained current recipes.
