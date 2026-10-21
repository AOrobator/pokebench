# Gym evidence repair

User authorization: "Fix those three harness issues behind a new switch, keep the active run untouched, and make sure the model gets the actual incomplete Gym state without telling it what to do next. these fixes need to be in the bundle".

One milestone: gym-evidence-v1. Default/control OFF, bundle ON. No live run edits, inputs, restarts or launch. No objective selector, forced route, battle choice or full-HP gate.

Scope: existing story-destination and harness-trust owners preserve a compound Gym-in-town reference instead of substituting its town. Existing tool factory supplies current native Rustboro Gym completion facts (false/true/unknown kept distinct), qualified by the run's delivered Gym evidence, across heal trips. Existing citation owner delivers a bounded factual miss even with input-cuts. Same execution and navigation policy. Registry, presets, bundle, explainer and pending experiment included.

Evidence: d548 source 4590d681, seq 14990 shows MARC victory and ROXANNE warning; turn 416 identifies final challenge; turn 426 claims gym complete; turn 430 invents Devon/Meteorite. State 15558 raw 7023 frame 274474 was hash/ROM validated and reparsed: Josh/Tommy/Marc true, Roxanne/gym/badge false. Result 15559 collapses Gym phrase to town. Citation 15575 not_found is suppressed by input-cuts. Exact Dad dialogue retained in ledger 15568. Reference pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, RustboroCity_Gym_EventScript_RoxanneDefeated sets the Gym and badge flags; trainers separate.

- [x] RED regression tests: gym-evidence.test.ts fails on missing GymProgress export (runs/gym-evidence/red.log). Exact source fixture retains 5 schema-validated d548 events, compressed; no game artifacts. Commit: test(agent): capture Gym evidence drift (RED).
- [ ] GREEN implementation, OFF invariance and production factory proof
- [ ] Wiring deletion/restoration receipt, recorded-data replay, delivery and viewer proof
- [ ] Gates: test, coverage >=90 each metric, lint, build, vendor, experiment/page validation
- [ ] Principles PB1-PB13, frozen packet and Claude/Grok/GPT review
- [ ] Landing board, reviewed fast-forward landing, viewer-only restart coordinated, live proof

New switch will be enabled only in future bundle configuration; measured run remains pinned and untouched. Pending experiment stays unapproved and unqueued. No benefit claim until measured.
