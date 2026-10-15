# Qualify dialogue-auto-advance-v1 against the real game

Requested by the operator (2026-10-15). Branch `claude/auto-advance-qualify` from `claude/bundle-integration`,
worktree `/private/tmp/pokebench-auto-advance-qualify`. Local only; merge approved once review is clean,
serialized after the bundle.

## Problem Statement

`dialogue-auto-advance-v1` is the only switch in the strong bundle that presses buttons for the model. Its tests
ran against a fake printing server only. Requirements:
1. Dialogue is always recorded deterministically: every page the game printed, whole and in order, in the
   `dialogue_auto_advance` event and in the model's tool result, cut from the game's own message buffer.
2. YES/NO prompts and other script menus are never answered or skipped by the harness; B is never pressed while
   a YES/NO is up (B selects NO).
3. Cutscene locks: the harness neither presses into a locked script nor stops early in a way that misleads the
   model.

## Operator Decisions

- 2026-10-15 ~18:20 (the operator, mid-task): no local-model review lanes (no think-fast, think-swarm or other local
  endpoint lanes); they slow the process. Review uses cloud lanes only: Codex `gpt-5.6-sol` and grok (Cursor),
  with opus/fable fallbacks. Real-ROM work stays off the think-fast GPUs (reserved for the experiment); the
  qualification uses no model.

## Skills Loaded

pokebench-game-state, pokebench-patch-evaluation, pokebench-story-milestones, agent-observability,
feature-switch, pokebench-review, pokebench-agent-workflow, multi-model review contract.

## Method

- Real ROM on an isolated server (INV-7): `runs/auto-advance-qualify/tools/serve.sh aaq-explore-1 8811`, own
  run dir `runs/auto-advance-qualify/aaq-explore-1` (raw-RAM archive per state read), strong-bundle server env
  (`POKEBENCH_ACTIVE_UI=1`, `POKEBENCH_FEATURES_OFF=full-map-navigation-v1,counter-talk-v1`).
- Driver `tools/qualify.mjs` runs the real compiled `withDialogueAutoAdvance` over the real `gameTools`
  (`packages/agent/dist`) with the strong-bundle feature set; `--probe` reads state before every `/action`.
- Independent checker `tools/ramcheck.py` re-derives each state from the raw-RAM archive with pokeemerald
  (731ad5b) semantics, not the server's readout: `sFieldMessageBoxMode`, `sTextPrinters[0]` state and cursor,
  `gStringVar4` (decoded with the env decoder), `sGlobalScriptContext` status/mode/native pointer,
  `sLockFieldControls`, `gPaletteFade.active`, live `Task_HandleYesNoInput` / `Task_HandleMultichoiceInput`,
  `gSpecialVar_Result`. It flags any harness B whose pre-read RAM is not a ready field message, any B while a
  YES/NO or multichoice task is live, and any event whose joined pages differ from the game buffers.
- Saves under `runs/auto-advance-qualify/states/` cover the truck exit, MOM's clock instructions, the wall
  clock and its confirmation, the TV cutscene, the rival's house and bedroom (MAY), the twin NPC, Route 101
  ("H-help me!"), Birch's bag and starter YES/NO, the post-battle talk and lab, and the nickname YES/NO.

Source semantics cited (pokeemerald 731ad5b):
- `src/field_message_box.c` `Task_DrawFieldMessage`, `ShowFieldMessage`: mode 2 while printing, the box owns
  input until the script's `waitmessage`/`waitbuttonpress`.
- `src/text.c` render states: `RENDER_STATE_WAIT` (page_wait, `\p`), `RENDER_STATE_SCROLL` (scroll_wait, `\l`),
  A or B advance both identically (`JOY_NEW(A_BUTTON | B_BUTTON)`).
- `src/script_menu.c` `ScriptMenu_YesNo` sets `gSpecialVar_Result = 0xFF` and starts `Task_HandleYesNoInput`;
  `Menu_ProcessInputNoWrapClearOnChoose` returns `MENU_B_PRESSED`, which the task maps to NO (result 0).
- `src/field_control_avatar.c` `ProcessPlayerFieldInput`: `CheckForTrainersWantingBattle` and
  `TryRunOnFrameMapScript` run before any player input on every free field frame.
- `data/maps/Route101/scripts.inc` (`StartBirchRescue`, `BirchsBag`), `LittlerootTown_ProfessorBirchsLab`
  (`LikeYouToHavePokemon`, ON_FRAME `GiveStarter`, `WhyNotGiveNicknameToMon` `MSGBOX_YESNO`),
  `LittlerootTown_MaysHouse_2F` (`MeetMay`), `data/scripts/players_house.inc` (truck exit, clock, TV).

## Defects found

| # | Defect (real game) | Evidence | Fix |
|---|---|---|---|
| D1 | A page already waiting when the call began was skipped: `prime` set the offset past it. When the model's own press closed a single page into a locked cutscene, the call was not engaged at all, so the page was never recorded. | truck exit: MOM's "AA, we're here, honey!" missing (`rec/truck-late.json`); Route 101 "H-help me!" never recorded (`rec/helpme.json`); post-battle "PROF. BIRCH: Whew…" missing (`rec/lab2.json`). `ramcheck` pages ≠ `gStringVar4`. | `prime` captures the waiting page unless the previous call already recorded it (`OpenMessage` carried across calls); a call that recorded a page is engaged, and the rest of the batch is dropped. |
| D2 | One message recorded twice (whole, then page by page) when the first read saw `gStringVar4` before the printer had a cursor (message `null`, identity unknown) and the next read had the identity: the key flipped from text to identity and flushed the whole text as one page. | `out/lab.json` (frame 86225: mode 2, printer cursor 0, message null), 15 pages with LikeYouToHavePokemon twice. | Same text is the same message while either read lacks an identity. |
| D3 | `field_free` stopped on the single unlocked frame between the lab warp fade and the lab's ON_FRAME `GiveStarter` script, telling the model the field was free while a cutscene started on the next frame. | `rec/lab1.json`: frame 86241 lock 0 / ctx stopped / fade done, frame 86242 lock 1 native script. 2 of 5 lab attempts. | Free field is final only when a read on a later frame (`raw_ram.frame`) still shows it; bounded by the 10 s wait. |

Latent (not reachable from the qualification saves, not fixed here): the printer cursor is a byte offset into
`gStringVar4`, the page cut indexes the decoded text. They agree when every byte decodes to one character, which
holds for every message printed in this qualification (checked against RAM). Multi-char glyphs (`{POKEBLOCK}` 5
bytes → 9 chars) and dropped control codes (`{PAUSE n}`, `{PAUSE_UNTIL_PRESS}`, `{CLEAR_TO}`) first appear in
Slateport's Fan Club, Mauville, TV shows, Lilycove and the Safari Zone. There the cut would shift by the length
difference (pages still contiguous, nothing lost). A fix needs a server-side decoded cursor behind a server switch.

## Qualification table

See "Qualification results" below (filled from `runs/auto-advance-qualify/out/fixed/summary.json`).

## Progress Log

- 2026-10-15 17:15 setup: worktree, submodule, .env, `just setup`, `just build-mgba`, `just build`.
- 17:20–17:45 live scenarios on the unfixed build; D1 found (truck-late, help-me, lab), D2 (lab), D3 (lab warp).
- 17:50 RED: 6 new tests fail on the unfixed source (fixture replays from `rec/*.json` trimmed to
  `packages/agent/test-support/auto-advance-replays/`); GREEN after the fix (37/37).
- 18:00 lint 0; coverage agent 97.69/94.68, viewer 95.25/90.94.
- 18:15 server on 8811 hung mid re-qualification (another client was holding connections to 8811); restarted
  as `aaq-explore-2` on port 8873 and re-ran the remaining scenarios.

## Invariants

- INV-1 OFF byte-identical: the wrapper is only installed when `dialogue-auto-advance-v1` is ON; no server or
  OFF path changed.
- INV-2 The harness presses only B, only on a ready field message (page_wait, scroll_wait, dismiss_wait) with no
  menu, naming, battle or YES/NO task live (RAM-checked on every harness press).
- INV-3 Every page the game printed during an engaged call is in the event once, in order, equal to
  `gStringVar4` cut at the printer's waits.
