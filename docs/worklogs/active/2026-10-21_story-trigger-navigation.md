# Navigation script boundaries

Authorized outcome: fix the trigger-policy contradiction; leave the active run untouched.

One milestone: allow a model-selected route to enter a matching coordinate trigger, then return control to the model after that step. No story classifier, hard-coded route, objective selection, live-run edits or launches. Existing terrain, object, trainer and input gates stay authoritative. New default-OFF switch preserves exact incumbent behavior. Consumers: navigate_to, navigate_to_target, recorded tool result/model feedback and feature card.

Evidence: ea04 turns 600–660, seq 22794–24576; 17 refusals across matching Rustboro var 0x405A=1. pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 RustboroCity StolenGoodsTrigger0–4 leads to StolenGoodsScene and changes state to 2. General policy uses only current matching trigger coordinates; no hidden story knowledge is delivered.

- [ ] RED regression and exact OFF contract
- [ ] GREEN production wiring and semantic stop; adversarial deletion/restoration
- [ ] Gates and read-only replay on recorded Rustboro state
- [ ] Explainer and pending experiment
- [ ] Principles and cloud review
- [ ] Landing and served proof, only through landing board

Implementation boundary: navigation.ts and semantic-navigation.ts if required, existing feature registration/preset/default owners, focused tests, explainer mapping/docs, pending experiment. No new runtime owner or event schema.
