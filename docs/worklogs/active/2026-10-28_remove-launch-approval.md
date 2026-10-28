# Remove the fixed-run launch approval

The operator 2026-10-28 11:28 AM NY (relayed by the coordinator): "Remove it entirely" for the launch approval step. Dev-process change only; no model-facing behavior, so no feature switch.

Why: the approval bound only a hash of the definition text plus its feature recipe. Every landing to experiments/feature-configs/current.json invalidated all four recipe-backed definitions. No recorded launch was ever stopped for a real reason, and `dry-run` already bypassed it. The integrity checks stay: ROM sha1, start-save sha1, control-base sha256 and diff, seeded-plan equality, the pinned clean experiment checkout, serving receipts and the per-launch ledger.

## Change

- [x] RED: `run` launches with no approval.json present (fixed-cli.test.ts).
- [ ] GREEN: fixed-cli.ts drops `approve`, the Approval record, both run/rerun gates, the `check` approval line, the usage line and the interactive/prompt/user deps and readline.
- [ ] Tests: approval assertions removed from fixed-cli.test.ts; the shared-config test now asserts the launch uses the new hash.
- [ ] Docs: justfile comment, fixed-run-launch, experiment-design skills. Old runs/experiments/*/approval.json files stay (never prune run data).
- [ ] Targeted gates: fixed-cli tests, viewer tsc, eslint on touched files (no CPU window needed).
- [ ] Review: Claude, Grok, GPT lanes on the frozen packet.
- [ ] Land ff-only via the landing board; record the merge SHA.

## Log
- RED: fixed-cli.test.ts 1 failed (runs a checked definition with no approval file: exit 1 'is not approved'), 36 passed.
