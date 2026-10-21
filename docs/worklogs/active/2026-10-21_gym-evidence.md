# Gym evidence repair

User authorization: "Fix those three harness issues behind a new switch, keep the active run untouched, and make sure the model gets the actual incomplete Gym state without telling it what to do next. these fixes need to be in the bundle".

One milestone: gym-evidence-v1. Default/control OFF, bundle ON. No live run edits, inputs, restarts or launch. No objective selector, forced route, battle choice or full-HP gate.

Scope: existing story-destination and harness-trust owners preserve a compound Gym-in-town reference instead of substituting its town. Existing tool factory supplies current native Rustboro Gym completion facts (false/true/unknown kept distinct), qualified by the run's delivered Gym evidence, across heal trips. Existing citation owner delivers a bounded factual miss even with input-cuts. Same execution and navigation policy. Registry, presets, bundle, explainer and pending experiment included.

Evidence: d548 source 4590d681, seq 14990 shows MARC victory and ROXANNE warning; turn 416 identifies final challenge; turn 426 claims gym complete; turn 430 invents Devon/Meteorite. State 15558 raw 7023 frame 274474 was hash/ROM validated and reparsed: Josh/Tommy/Marc true, Roxanne/gym/badge false. Result 15559 collapses Gym phrase to town. Citation 15575 not_found is suppressed by input-cuts. Exact Dad dialogue retained in ledger 15568. Reference pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, RustboroCity_Gym_EventScript_RoxanneDefeated sets the Gym and badge flags; trainers separate.

- [x] RED regression tests: gym-evidence.test.ts fails on missing GymProgress export (runs/gym-evidence/red.log). Exact source fixture retains 5 schema-validated d548 events, compressed; no game artifacts. Commit: test(agent): capture Gym evidence drift (RED).
- [x] GREEN implementation, OFF invariance and production factory proof. Eight regression tests; 3 bundle definitions exercise armPreset (bundle ON/control OFF). All 3406 agent tests passed under coverage; agent lines 99.2, branches 93.23, functions 97.9. Nine deletion attempts failed as intended (six wiring/native flags, three naming/unknown-state cases); both restorations pass. Receipt files under runs/gym-evidence/.
- [x] Recorded-data rehearsal through playGameTools and RunRecorder.emit: returned text equals recorded tool_result, citation text is delivered, Gym incomplete/Roxanne not defeated and whole Gym-in-city reference present. No live game or model request. Scratch viewer 8797: recorded frame, expanded trace tool result and citation row, Harness Config GYM EVIDENCE card ON, READ EXPLAINER click opens tracked page. Screenshots at 1280/1440/375 inspected; diagrams/tables scroll inside cards on phone. Full native source reference/raw validation retained from audit.
- [ ] Gates: test, coverage >=90 each metric, lint, build, vendor, experiment/page validation
- [ ] Principles PB1-PB13, frozen packet and Claude/Grok/GPT review
- [ ] Landing board, reviewed fast-forward landing, viewer-only restart coordinated, live proof

Current gate notes: lint TypeScript/ESLint and ruff pass; initial isolated Python setup lacked the installed mGBA native binding and ROM environment. Linked the existing dependency into the owned venv and configured the existing external ROM path; no binary copied and no live server touched. A serial-comparison child-output timeout and the experiment-cli 5000ms test timeout occurred under concurrent gate load; original logs retained, no retries/timeouts/skips added, targeted experiment-cli passes. Full final gates still being recorded.

New switch will be enabled only in future bundle configuration; measured run remains pinned and untouched. Pending experiment stays unapproved and unqueued. No benefit claim until measured.

GREEN commit: `d7aa01e5057e82049e3d4fe40c9342e1593b9471`. Agent 3406 coverage tests and viewer 1654 coverage tests pass; respective line/branch/function percentages 99.2/93.23/97.9 and 97.94/91.34/94.34. Source-pinned pending entry points to this implemented code checkpoint; no runtime source changed in the pin receipt. Native dependency setup corrected, mypy now passes all 112 source files. Full Python rerun uses the owned environment and external ROM.
