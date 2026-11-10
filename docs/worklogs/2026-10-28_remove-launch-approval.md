# Remove the fixed-run launch approval

The operator 2026-10-28 11:28 AM NY (relayed by the coordinator): "Remove it entirely" for the launch approval step. Dev-process change only; no model-facing behavior, so no feature switch.

Why: the approval bound only a hash of the definition text plus its feature recipe. Every landing to experiments/feature-configs/current.json invalidated all four recipe-backed definitions. No recorded launch was ever stopped for a real reason, and `dry-run` already bypassed it. The integrity checks stay: ROM sha1, start-save sha1, control-base sha256 and diff, seeded-plan equality, the pinned clean experiment checkout, serving receipts and the per-launch ledger.

## Change

- [x] RED: `run` launches with no approval.json present (fixed-cli.test.ts).
- [x] GREEN: fixed-cli.ts drops `approve`, the Approval record, both run/rerun gates, the `check` approval line, the usage line and the interactive/prompt/user/now deps and readline (`now` was used only by approve).
- [x] Tests: approval assertions removed from fixed-cli.test.ts (an `approve` command now prints usage, exit 2; an edited definition runs under its new hash; the rerun refusal for a changed definition becomes a refusal for a plan that does not match its seed); the shared-config test asserts each run carries the hash of the config it read. drought-progress-facts and player-elevation-bundle fixtures drop the removed deps.
- [x] Docs: justfile comment, fixed-run-launch, experiment-design skills. patch-evaluation, run-coordination, feature-switch and CLAUDE.md mention operator-approved definitions or approving experiments as an operator decision, not the removed command, and stay as they are. Old runs/experiments/*/approval.json files stay (never prune run data).
- [x] Targeted gates: fixed-cli tests, viewer tsc, eslint on touched files (no CPU window needed).
- [x] Review: Claude, GPT and fallback lanes on the frozen packet (Grok/Cursor out of usage; The operator's standing rule).
- [x] Land ff-only via the landing board; record the merge SHA.

## Log
- RED: fixed-cli.test.ts 1 failed (runs a checked definition with no approval file: exit 1 'is not approved'), 36 passed.
- GREEN: fixed-cli, drought-progress-facts, player-elevation-bundle: 51 passed. viewer `tsc --noEmit` clean; eslint on the four touched files clean. No full suite (no CPU window used).
- Review r1 (eb4d388be..979b004e6, diff e845631f…): Claude CLI OAuth expired and Cursor out of usage, so per the operator's standing rule: Claude subagent LGTM, Sonnet fallback LGTM (stale feature-configs README lines), Codex CLI gpt-5.6-sol BLOCKING (docs/experiments/starter-decision-salience-runbook.md still says the operator approves interactively).
- r1 fix: the runbook now says launch follows the operator's word with `just fixed-run run`; feature-configs README says launches record the definition hash and drops "approve" from the archive note. A repo grep for `fixed-run approve` and approval-step wording outside worklogs and historical explainer pages is clean.
- Review r2 (base eb4d388be, head 3b64829b0, diff 125babed658a39a8f908704dcf4c2bc11c0af1cc19f9096389cd1fb20c36a475): Claude subagent LGTM, Codex CLI gpt-5.6-sol LGTM, Sonnet fallback LGTM. Packets and logs: runs/reviews/remove-launch-approval/.
- Synced main 3c4b2e891 into the branch (f62b82487); `git diff --binary main HEAD` still 125babed…, so the reviewed change is byte-identical. Targeted gates on the synced tip: 51 passed, viewer tsc and eslint clean.
- LANDED 2026-10-28 12:00 PM NY: `git merge --ff-only` main 3c4b2e891 → f62b82487. On main: `just build` ok (stamp f62b824); targeted 51 passed; `just fixed-run approve bundle-v-control` prints usage, exit 2; `just fixed-run check bundle-v-control` passes with no approval line; `just viewer-main` → viewer at f62b82487, 1 live gameplay process kept running.
- Post-landing full `just test` not run: it needs the coordinator's CPU window (requested). Old runs/experiments/*/approval.json files left untouched.
