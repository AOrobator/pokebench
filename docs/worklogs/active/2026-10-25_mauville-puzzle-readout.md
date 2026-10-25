# Mauville puzzle readout correctness

Authorization: The operator: “Let’s do it… bug fix… on in both arms, the control and the bundle.”

One bounded milestone: expose observable Mauville Gym floor-switch state and electric-door tiles from the current live map. Distinguish these from permanent walls/floor; label the existing interaction targets without changing their keys or selecting an action. Show the current barrier configuration on each observation so changes remain visible. Register mauville-puzzle-readout-v1, default ON with explicit OFF restoring legacy bytes, and onInBoth in the current feature recipe. Preserve frozen active runs and historical metadata.

No puzzle solver, route policy, foreknowledge of switch effects, input changes, or live-run restart. Runtime field state comes from the current paired map snapshot, never a predicted puzzle state. No new persistence or event schema.

- [ ] RED tests committed.
- [ ] GREEN implementation, shared arm config, explainer.
- [ ] Native archived-state proof and mutation check.
- [ ] Full gates, principles, cloud review.
- [ ] Serialized landing and viewer proof.

Reference: clean pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, matching US ROM f3ae088181bf583e55daf962a92bb46f4f1d07b7. Sources: MauvilleCity_Gym/scripts.inc, field_specials.c MauvilleGymPressSwitch/SetDefaultBarriers, metatile_labels.h. Evidence d41e #193989/#194138/#195466 reproduces recorded full grids exactly from hash-validated raw RAM.

RED: production-readout and arm-materialization regressions added. Python collection fails because the puzzle module is absent (expected).
