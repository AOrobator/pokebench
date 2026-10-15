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

## Qualification table (fixed build)

Evidence: `runs/auto-advance-qualify/out/fixed/summary.json` (69c062a build, servers `aaq-explore-1`/`-2`),
`out/r2/` (round-2 build). Runs data is gitignored (repo convention); paths are in the main checkout.
"B" = harness presses; "RAM" = `ramcheck.py`: every harness B had a ready field message and no YES/NO or
multichoice task in its pre-read RAM, and the event's joined pages equal the `gStringVar4` buffers printed.

| Scenario (save) | Expected per RAM / pokeemerald | Observed | Result |
|---|---|---|---|
| Truck exit (`truck-edge`), RIGHT then A | MOM's 12 pages (`players_house.inc` truck script); field free after `releaseall` | 12 pages from "MOM: AA, we're here, honey!" to "Don't forget to set it!", B×12, stop field_free; final lock 0, ctx stopped | pass |
| Truck exit, A sent 9 s late, MOM's page 1 already waiting (D1) | same 12 pages | before fix 11 (page 1 missing); after: 12, B×11, identical pages in 2 runs | pass (fixed) |
| Wall clock (`clock-facing`), A A | "The clock is stopped…" pages then the clock UI | 2 pages, B×2, stop menu at the clock UI | pass |
| Clock-set confirmation YES/NO (`clock-ui`), A ×3 | wall-clock UI is not a field message; harness must not engage | 0 harness presses, no event; only the model's 3 A | pass |
| TV cutscene (`room-after-clock`) | MOM calls, walks, TV report; lock between pages | 8 pages, B×8, no press during lock, stop field_free with ctx stopped | pass |
| Rival's house (`town-before-rival-door`) | rival's mom, 6 pages | 6 pages, B×6, field_free | pass |
| May's bedroom (`may-ball`), A ×4 | `MeetMay`: lockall, MAY walks in, 13 pages, MAY walks out | 13 pages, B×13, waited out both walks, field_free (lock 0, ctx stopped) | pass |
| Twin NPC (`twin`) | 4 pages, NPC talk | 4 pages, B×4, field_free | pass |
| "H-help me!" waiting, model A closes it into the chase (D1) | page recorded; no press while locked; "Please! Help!" pages advanced | before fix: no event, page lost; after: ["H-help me!", "Hello! You over there!\nPlease! Help!", "In my BAG!\nThere's a POKé BALL!"], B×2, 0 presses during the lock, field_free | pass (fixed) |
| Route 101 entry (`route101-edge`), UP then A | `StartBirchRescue` | 3 pages, B×3, field_free | pass |
| Bag and starter YES/NO (`bag`), A ×4 | starter choose screen is not a field message | 0 harness presses; only the model's 4 A | pass |
| Post-battle talk → lab → nickname YES/NO (`birch-yousavedme-p1`), A (D1, D2, D3) | 15 pages; ON_FRAME `GiveStarter` after the warp; `MSGBOX_YESNO` left open (`gSpecialVar_Result` 0xFF) | before fix: page 1 missing; 15 pages with a message duplicated (1 run); stop field_free on frame 86241 in 2 of 5 runs. After: 15 pages = RAM buffers, identical in 3 runs, B×12, stop menu with YES/NO and YES highlighted; final `Task_HandleYesNoInput` live, result 0xFF | pass (fixed) |
| Model answers NO to the nickname (`lab-yesno`), DOWN, A | harness resumes the next messages and stops at the next YES/NO unanswered | 4 pages, B×3, stop menu, YES/NO live, result 0xFF; question not re-recorded | pass |

No harness B was pressed while a YES/NO or multichoice task was live in any run (RAM-checked), and none was
pressed into a locked script without a ready message.

## Review

Round 1 (cloud lanes; base 4d5cc83, head 69c062a): Codex gpt-5.6-sol CHANGES REQUESTED, Cursor grok-4.5
CHANGES REQUESTED, Cursor opus unavailable (usage limit; fable fallback next round). Fixed in round 2:
- a batch that starts inside a conversation stops after its first input (a carried page could otherwise let a
  second B land on the YES/NO the first one opened);
- the carried position survives a failed state read and a `navigate_to` that opens no dialogue (resume happens
  in `see`, not only in `prime`);
- the settle timeout no longer claims free field: its detail says the frame never advanced;
- `OpenMessage` is module-internal; the fake's per-press `posts` copy is removed.

Round 2 (base 4d5cc83, head fa2497a): Codex CHANGES REQUESTED, grok CHANGES REQUESTED, fable rc=1 (no output).
Triage by the operator merge rule (blocks only on crash / OFF drift / false info or wrong press CLOCK_SET→RIVAL_MET
/ corrupted outcomes). Blockers, fixed in round 3:
- B1 (both): a failed before-read ignored the carried open message, so `[B,B]` could open a YES/NO and answer NO
  (rule 3). Fix: without a read, `open !== null` counts as in-dialogue.
- B2 (both): an engaged `navigate_to` built `Pages` without the carried position and re-recorded a capped page
  (rule 4). Fix: `new Pages(record, open)`.
- B3 (codex): the carried position was cleared before the model's press succeeded; a failed press then a retry
  re-recorded the page (rule 4). Fix: clear `open` only after the press went through.
- B4 (codex): live evidence not bound to a commit. Operator-chosen cheap fix: `qualify.mjs` records HEAD, a
  clean-tree flag and the sha256 of `dist/dialogue-auto-advance.js`; re-run lab-1, truck-late, nickname-no and
  help-me on the committed build.

## Deferred (post-experiment)

- Byte-offset printer cursor vs decoded-text page cut (multi-char glyphs, `{PAUSE}` codes): first reachable in
  Slateport/Mauville/Lilycove, past Oldale.
- Frameless second free read still confirms `field_free` (fakes only; real archives carry `raw_ram.frame`).
- Settle timeout reuses stop `field_free` with a distinct detail (schema constraint).

## Progress Log

- 2026-10-15 17:15 setup: worktree, submodule, .env, `just setup`, `just build-mgba`, `just build`.
- 17:20–17:45 live scenarios on the unfixed build; D1 found (truck-late, help-me, lab), D2 (lab), D3 (lab warp).
- 17:50 RED: 6 new tests fail on the unfixed source (fixture replays from `rec/*.json` trimmed to
  `packages/agent/test-support/auto-advance-replays/`); GREEN after the fix (37/37).
- 18:00 lint 0; coverage agent 97.69/94.68, viewer 95.25/90.94.
- 18:15 server on 8811 hung mid re-qualification (another client was holding connections to 8811); restarted
  as `aaq-explore-2` on port 8873 and re-ran the remaining scenarios.
- 18:35 round 3 RED: 3 new tests fail on fa2497a (B1–B3).
- 18:40 round 3 GREEN: 43/43 (ee890b4). Gates on ee890b4: test agent 1215, viewer 684, python 1917 passed; lint 0;
  coverage agent 97.69/94.67/98.12/98.99, viewer 95.25/90.94/94.18/98.01, python 96%; verify-vendor OK.
- 18:55 B4 evidence binding: `qualify.mjs` records `build` {head, clean, dist_sha256}. Re-ran lab-1, truck-late,
  nickname-no and help-me on ee890b4 (clean, dist sha256 124f568b…) on port 8873, run dir `aaq-explore-3`
  (`aaq-explore-2` cannot be reused: a run directory is used once). `out/r3/`: lab-1 15 pages, B×12, stop menu at the
  nickname YES/NO (task live, result 0xFF), first page "PROF. BIRCH: Whew…"; truck-late 12 pages, B×11, field_free,
  first page MOM's "AA, we're here, honey!"; nickname-no 4 pages, B×3, stop menu, YES/NO live; help-me 3 pages
  ["H-help me!", …], B×2, field_free. ramcheck problems 0 in all four.
- 19:05 merged main (bundle 4b5b8bf + decision-point 954d74f): conflicts only in dialogue-auto-advance.ts/test.ts
  (main's round 4–6 pressedOf/pressLineOf/results vs round-3 carried `open`); both kept. observation.py untouched
  by this branch.

## Invariants

- INV-1 OFF byte-identical: the wrapper is only installed when `dialogue-auto-advance-v1` is ON; no server or
  OFF path changed.
- INV-2 The harness presses only B, only on a ready field message (page_wait, scroll_wait, dismiss_wait) with no
  menu, naming, battle or YES/NO task live (RAM-checked on every harness press).
- INV-3 Every page the game printed during an engaged call is in the event once, in order, equal to
  `gStringVar4` cut at the printer's waits.
