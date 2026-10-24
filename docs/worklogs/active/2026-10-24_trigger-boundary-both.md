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
