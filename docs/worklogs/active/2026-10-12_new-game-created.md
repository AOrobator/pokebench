# New Game Created milestone

User scope: add New Game Created as a split before player-name confirmation; user authorized landing and stopping the active experiment on 2026-10-12. Main chat notified before source changes. Ten planned trials were not launched; both launched logs retained with terminal records. No efficacy claim from the truncated experiment.

Completion condition: first verified `birch_speech` state after NEW GAME is accepted, before name confirmation. This is introduction entry, not saving to disk. No inference from highlighting NEW GAME, naming callbacks, or resumed overworld. Missing observation stays unrecorded. Evidence cites the state sequence; first observed time is an upper bound. Reuse existing verified reader, recorder and schemas.

Non-goals: new RAM fields, gameplay/model guidance, navigation/skills, historical event rewriting, more benchmark runs, or changing the experiment's prompts.

Source: pristine pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, src/main_menu.c ACTION_NEW_GAME -> Task_NewGameBirchSpeech_Init; existing game_screen.py callback/task decoder.

Paths: agent milestones/tests/live metadata; viewer catalog/panels; focused recorder/viewer tests and existing consumer contracts only. No new runtime owner.

## Validation

- [x] Original isolated targeted test RED -> GREEN; 355agent+146viewer pass.
- [x] Coverage90 floors, lint/type, build;357agent+147viewer+378unchanged Python=882tests. TS branch coverage agent93.23/viewer91.45;Python lines99.34/branches96.77/functions100. Initial Python command used repo root and collected vendor tests; corrected to existing env config, original failure retained. Typecheck caught legacy-state union access in new recorder test; fixed explicit screen-field guard. Four performed/restored mutants fail: detector positive, live metadata, viewer feature gating, catalog ordering. No gate weakening.
- [x] R1 fast/swarm/Grok each literal LGTM; sourcebe8cdd5919ccbe865ded2ef56739b19de58be5dc, diffSHA256308f9b7c54a2300097a00dec14f8109ea350f5485b65223516beb0f9e14688a0. Claude dedicated auth logged out; Cursor Opus/Sonnet/Fable and GPT5.6/5.3 usage unavailable. User explicitly waived exactly Claude/GPT lanes: "waived, land your work". Reduced review diversity recorded; no subagent fallback used. Grok Ask-mode could not reproduce shell hashes/status; orchestrator verified sealed commit/diff/clean status before and after. Full normal-roster success is not claimed.
- [x] Exact reviewed source fast-forwarded to main; rebuild passed; viewer restarted on8791, verified New Game Created row before name confirmation. Original old-run split shows not recorded. Source commitbe8cdd5919ccbe865ded2ef56739b19de58be5dc; worktree cleanup follows closeout documentation.

Missing-observation limit: an intro missed by polling is not reconstructed from later states; old runs remain not recorded. Raw run logs remain immutable.

Recorded read-only source evidence: stopped Swarm run first verified Birch state seq81 at15:44:10.414EDT; stopped Qwen baseline seq98 at15:44:52.894EDT. No event logs rewritten. Existing game_screen decoder owns verified callbacks/tasks. Earliest frames may still show the entry fade; split measures committed introduction entry, not completion of its rendering.

## Closeout receipts

882tests; coverage/lint/type/build green. Read-only replay of original logs yields exactly one new-game split: Swarm18.732s/evidence81;Qwen42.646s/evidence98. Replay receipt only, no raw-log backfill or new game inputs. Viewer session28920, screenshot runs/launch-receipts/new-game-created-review/viewer-landed.png. All packet, availability failures, synthesis, waiver and gate logs retained under that receipt directory. Source landed without modifying canonical sequencer; final hashes verified during cleanup. Original contextual experiment remains stopped_by_operator with two terminal runs and ten unlaunched trials; no efficacy inference from incomplete arms.
