# Birch intro pages

## Problem Statement

Run `2026-10-21T13-33-00_cursor-agent-grok-4.7_probe` pressed B through PROF. BIRCH's opening speech (before gender and name). Every press result said `unavailable/transitioning (world position unavailable)` while the frame advanced one page. The `Dialog:` line stayed the whole `gStringVar4` buffer joined with ` | `, then jumped when the game loaded the next string. `birch-speech-pages-v1` only owns the two printers after the name is accepted (`0x0803133D`, `0x080314C5`). The opening pages are owned by `Task_NewGameBirchSpeech_ThisIsAPokemon` (`0x080309CD`, `gText_Birch_Welcome`), `Task_NewGameBirchSpeech_MainSpeech` (`0x08030A2D`, `gText_ThisIsAPokemon`), and `Task_NewGameBirchSpeech_AndYouAre` (`0x08030BCD`, `gText_Birch_MainSpeech`). Addresses from US ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`, source `pokeemerald` `731ad5bf`.

## Skills Loaded

- `.claude/skills/feature-switch/SKILL.md`
- `.claude/skills/feature-explainer/SKILL.md`
- `.claude/skills/feature-worklog/SKILL.md`
- `.claude/skills/execute-worklog/SKILL.md`
- `.claude/skills/experiment-queue/SKILL.md`
- `.claude/skills/pokebench-game-state/SKILL.md`
- `.claude/skills/talk-to-claude/SKILL.md`

## Architecture

New switch `birch-intro-pages-v1`, default off. ON: those three tasks, while printer 0 waits at a page break, read `Interface: birch_intro_page` with the on-screen page as the value, and `Dialog:` is that page. A page still printing stays not ready. The existing press comparison then reports an interface change instead of a missing world position. OFF: no owner, the joined buffer, and the world-position press line, as today. `birch-speech-pages-v1` is not widened.

## Invariants

- INV-1: OFF readout and active UI for this speech match the bytes from before the switch. Test: `test_the_readout_quotes_the_page_and_the_off_arm_keeps_the_whole_buffer`.
- INV-2: ON value is the page at the printer cursor, the same slice as `page_text`. Test: welcome page 1 vs page 2, the Pokémon sentence, and the main-speech first page.
- INV-3: The switch is absent from omitted presets and from the server unless the feature set turns it on. Test: `birch-intro-pages.test.ts`.

## Security Review

Reads emulator memory the server already reads (task, printer, window, `gStringVar4`). No new input path, no ROM in git, no network.

## Milestones

**M1 — Tests**
- [x] Write tests (welcome page, later strings, printing, off-arm buffer, production reader, registry)
- [x] COMMIT: `test(birch-intro-pages): failing page readout` (RED) `3cdf1fb412583f45712266cce50321f4d11b8339`
- [x] Implement
- [x] Gates: `just test`, `just lint`, `just build`, `just coverage`
- [x] COMMIT: `feat(birch-intro-pages): report the pre-name page` (GREEN)
- [x] Explainer, pending experiment, readiness row
- [ ] Multi-model review loop until clean
- [ ] LAND only when the landing board says number 1 and the three cloud lanes LGTM. Do not merge before that.

## Closing the Loop

Unit tests are the proof for the readout. The probe run is the failing evidence. A new live play is not part of this branch. Viewer card click waits until the explainer is linked and a viewer built from this branch can serve it; do not restart the shared `just viewer-main` from this branch.

## Session Log

- 2026-10-21: Branch `cursor/birch-intro-pages` from `2850ace69`. Told Claude; no listener, mail saved. Not joining the landing board until review is done.
- 2026-10-21: Wiring-deleted proof. Removed `birch_intro_pages_enabled` from `rerender.read_state`. `test_the_production_reader_honors_the_switch` failed: the on-arm `active_ui` was `None`. Restored the argument. The same test passed.
- 2026-10-21: Gates on this branch. `just test`: agent vitest 3357, viewer vitest 1633, pytest 3806. `just lint` passed (tsc, eslint, ruff, mypy). `just build` passed. Coverage: agent lines 99.18%, branches 93.05%, functions 97.76%; viewer lines 97.91%, branches 91.33%, functions 94.33%; Python lines 97.29%, branches 93.12%, functions 100%. One combined `just coverage` hit two viewer 5s timeouts while the machine was busy (`experiment-cli` pin test, `server-stream` malformed-chunk test). Those files passed in `just test`, and `pnpm coverage` in `packages/viewer` then passed 1633 tests. The Python coverage gate passed on its own run. Floor is 90.
- 2026-10-21: GREEN `52c533e125ac1f00e84c02b4346ee4f2dea3d342` `feat(birch-intro-pages): report the pre-name page`. Main is untouched. Review has not started. The landing board has not been joined.
- 2026-10-21: The bundle arm turns `birch-intro-pages-v1` on. Registry default and the control arm stay off. The five current bundle definitions (`bundle-v-control`, `bundle-cook-1h`, `whole-map-cook-1h`, `whole-map-pair-2h`, `bundle-v-control-2h`) list it last in `switches`, with `base.features` false. The pending experiment's incumbent is that bundle arm with only this switch off. Older cook pins are unchanged. Commit `dca407250`. Joined the landing board as number 5. Nobody is asked to hold. Main stays untouched until this branch is number 1 and the three cloud lanes LGTM.
- 2026-10-21 (5:20 PM New York): Claude took over after Cursor ran out of tokens; Cursor's worktree is left as it was, mid-merge. New branch `claude/birch-intro-pages` from main `d6622d404`, merged `cursor/birch-intro-pages` (`387669a0e`). Conflicts were the append-at-end switch lists: birch-intro-pages-v1 goes after the seven switches main added (story-goal-player-name-v1 … gym-evidence-v1), and every tail-index test shifts by one. The pending experiment's incumbent gained those seven switches as true, so it is again the bundle-v-control bundle arm with only this switch off. `play-preset.ts` needed birch-intro-pages-v1 in the schema's Exclude cast; `birch-intro-pages.test.ts` needed a SwitchableFeature index for tsc. Gates on the merged tip: `just build` passed; `just test` agent vitest 3410, viewer vitest 1660, pytest 3812, all passed; `just lint` passed; `just coverage` passed (agent lines 99.2%, branches 93.23%, functions 97.9%; viewer lines 97.95%, branches 91.33%, functions 94.35%; Python lines 97.29%, branches 93.12%, functions 100%). `just verify-vendor` OK.

## Surprises

- The task that waits on a string is the next function, not the one that loaded it. Welcome pages are `0x080309CD`, the Pokémon sentence is `0x08030A2D`, and the main speech is `0x08030BCD`.

## Multi-Model Review Log

None yet.

## Boy Scout Log

None.

## Archive Milestone

- [ ] ASK USER: archive this worklog
