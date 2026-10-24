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
