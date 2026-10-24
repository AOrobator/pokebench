# Trigger navigation boundary in both arms

Operator request: enable trigger-navigation-boundary-v1 in control and both arms and land it.
Scope: promote the existing switch in all eight fixed definitions that currently list it as a bundle treatment. Set base true, remove from switches, append to onInBoth. Preserve historical control-base files, global defaults, launch parameters and existing runs. No gameplay launch or benefit claim.

## Validation
Production armFeatures, armFeatureBits and armPreset must return true for both arms in every phase; definitions and frozen control-base validation remain valid.

## Session log
- Created isolated branch from ebed5a7f3; read active pointer, repo rules and landing/review/close-the-loop skills. Coordinator notified before review.
- RED: all eight production-recipe tests fail because onInBoth omits the switch; initial import setup required building the agent package.
- Promoted exactly the eight existing treatment recipes to base true/onInBoth; no other feature values or schedule settings changed.
- GREEN: focused recipe and fixed-design suite 50/50 passed. RED commit fceed27bb. Full build/test/coverage/lint/vendor gates running; no active run touched.
- Full agent suite exposed three expected stale recipe assertions: old bundle-only boundary contract, old base false expectation, and treatment-list indices shifted by one. Updated only those expectations to the approved promotion; build passed.
- Viewer suite similarly exposed old bundle-only assertion and five files pinning later treatment indices. Adjusted affected indices by one (GLM positions unchanged), preserving all existing feature-state/dependency checks. Agent suite now 4228/4228 passed.
- Gates complete: build passed; agent tests 4228, viewer 1837, Python 4106 passed. Protected headless cards 1280/1440/375 passed (POKEBENCH_CARD_ART points to canonical ignored assets); initial isolated worktree setup lacked ROM env/art, resolved with local config only. Coverage passed: agent lines 99.14/branches92.74/functions97.53; viewer98.04/91.67/95.18; Python97.37/93.33/100. Lint and vendor passed. Exact JSON comparison verifies only the authorized three-field promotion in eight files.
- Review packet: scope and PB1-PB13 adherence in /tmp/pokebench-trigger-review. No FAIL. Required cloud lanes pending; no local inference used.
- Review round 1: Claude LGTM; GPT and two availability-fallback reviewers confirmed exact requested recipe transformation. Accepted one test-only runtime-shape finding: cache two shared control-base files by path instead of reading them eight times. No other defects found. Fix validation: eight production recipe checks and ESLint pass; full gates above remain applicable to unchanged application/configuration. Grok Cursor grok-4.7-high exit1: ActionRequiredError, out of usage; no alternative approved Grok harness. Repo requires operator permission before landing with this missing cloud lane; fallback does not grant self-merge.

## Landing evidence (2026-10-24)
- The operator explicitly replied "waived" to missing Grok review on 2026-10-24 in chat 00000000-0000-4000-8000-78d635a4d1be. Claude CLI round2, isolated GPT gpt-5.6-sol and independent availability-fallback gpt-6.1-sol/gpt-6-astra each returned VERDICT: LGTM on base ebed5a7f331a9c2501fb7a695994afc9be7cebd9 to head 42edb3f22ffa4ef07d5b093701f098ae99264336, diff SHA256 45ef20b18d715415e91b6ca08a88a7e5d86b60e63d62c81eeb292b722a4a2cc4. Reduced vendor diversity disclosed; waiver is operator approval, not Grok LGTM.
- Joined landing board as number 1 with this exact chat ID, no entries ahead; fast-forwarded clean main to exact reviewed head 42edb3f22. Post-main `just test` exit0: agent4228, viewer1837, Python4106, protected headless cards3 passed. No tracked application changes after review. Evidence and separate stdout/stderr review receipts: /tmp/pokebench-trigger-review/.
- No gameplay launches, active trials, frozen recipes or leases modified. Six protected play/server processes captured before landing checks. Coordinator issued a later CPU/viewer hold; no new heavy work or refresh started after that hold. Mandatory post-main test process has now terminated successfully; CPU released. Viewer refresh pending coordinator single-refresh window/handoff, using clean POKEBENCH_VIEWER_WORKTREE=/private/tmp/pokebench-viewer-qwen36-20261024 per relay.
