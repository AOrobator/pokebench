# Viewer budget extension

User authorization 2026-10-25: reuse existing Extend dialog, choose additional time or turns; retain30m/1h, add2h/4h, add1000/2000 turns; display Astra's actual20000-turn limit without disturbing active gameplay.

One bounded feature: operator budget controls and faithful projection. No model prompts, tools, navigation or automatic gameplay changes. Operator-only control has no experiment treatment switch: unchanged until explicit operator request, same as existing time extension. No trainer-card redesign, timeline additions, new runs or gameplay restart. Original evaluation horizon retained separately from continuation.

- [ ] Tests for control application/refusal, projection, dialog and source capability.
- [ ] Implementation through existing control/event/viewer path, validated Astra override receipt.
- [ ] Targeted and full gates, independent review, headless browser proof, queued local landing and safe viewer refresh.

Active Astra pin cannot acquire source updates automatically. Its actual turn override is audited in its run sidecar; compatibility/capability must be explicit, never queue unsupported actions as successful. No inspector mutation as a viewer endpoint.

RED commit1d0278f28: three new cases failed on unsupported actions before implementation. GREEN targeted controller/governor, reducer/dialog and HTTP tests cover independent turn/time increments, deduplication, expired/unsupported/overflow refusal, original horizons, durable acknowledgement and verified operator receipt. No gameplay requests sent.

Compatibility: new run_start.extend_budget advertises expanded actions. Legacy pins retain original30m/1h controls; unsupported2h/4h/turn actions are disabled and rejected409, never queued indefinitely. Astra's audited sidecar is schema-checked (matching run, PID/readbacks, applied status, safe increasing total) through read-only /budget and projects effective20000 without altering its original recording or process. No new inspector endpoint or restart.

Broader gate caught and corrected browser module allowlist wiring and an optional-budget fixture stub; retained existing WALL LIMIT detail label for compatibility. Targeted audit exposed no gameplay mutation.

Regression checks:283 viewer application/server/card tests pass; targeted budget suites pass; pnpm recursive lint passes. Browser proof and full final gates pending.
