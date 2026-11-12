# Lavaridge navigation and gym protection

Operator 2026-11-12: fix navigation and supervisor blame; prefer existing switches; do not touch current Astra run.

## Scope

Use existing active-warp-exits-v1 predicate in stride execution, preserving OFF behavior. Enable existing gym-puzzle-supervisor-hold-v1 in the dedicated Opus/Astra Rayquaza preset; standard current control and onInBoth recipe already enable it. No new supervisor behavior or switch, no live intervention or launch.

## Evidence

Run af33 seq 47460 / raw archive 32019 (SHA-256 18c46ff407edc95efa5ee455dd2baeb3b12b00cd10f7589fd3f8f5ce7f8374ee): at (13,17), map 4/1, behavior 0 ordinary floor, elevation 3, collision 0; static warp at origin is dormant. Unfiltered stride read rejects it while active-warp readout omits it. Seq 48186 T827 blames gym trips; hold switch explicitly false in dedicated preset since creation a1c2c76c9, but true in current-control and current recipe onInBoth. The hold suppresses gym map-pair warnings and off-map suggestions inside the gym; it does not suppress all drought notes outside.

Reference pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean: field_control_avatar.c IsWarpMetatileBehavior; existing active_warps.py owns the predicate.

## Milestones

- [x] RED: six Python cases fail on missing active_warps wiring; preset regression fails because dedicated lane false.
- [x] GREEN: 38 Python and 67 agent tests PASS; mypy (env config), ruff, changed-file eslint and agent tsc PASS.
- [ ] Gates and saved-RAM read-only proof
- [ ] Independent review and landing

No live-run changes; source landing is separate from activation.

## Proof receipts

Saved raw frame 1108907: targets (12,17) and (13,16) both return safe=False with OFF, safe=True with ON, using validated archive and matching ROM. No emulator inputs or live calls. Factory regression covers dormant origin/target and active pad; OFF preserves refusal. Mutation 1 removes travel-to-strides forwarding: 2 intended failures, 4 PASS; restored. Receipt runs/gym-navigation-proof/mutation-1.log. Existing Lavaridge supervisor path records diagnostic would_warn and sends no map-cycle note when hold ON. Source producer, schemas, delivery, Activity History and replay consumers unchanged for the hold.

Read-only explainer screenshots inspected at 1280, 1440, 375. Existing diagrams scroll on phone; added text fits. No new viewer interactions or event types. Full checks and source review pending; no activation.
