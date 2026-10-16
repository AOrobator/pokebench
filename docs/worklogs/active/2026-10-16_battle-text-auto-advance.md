# battle-text-auto-advance-v1: the harness advances battle messages like field dialogue

Asked by the operator 2026-10-16 01:56 AM EDT in the showcase-analysis thread, after forensics of `2026-10-16T00-34-26_qwen36-gpu1_show` (report `runs/reports/showcase-oldale-analysis/index.html`). Seven wild battles took 19–37 agent turns each, mostly single A presses answered `interface unchanged` while `battle.phase` read `resolving`. Field dialogue auto-advance (`dialogue-auto-advance-v1`) stops at "a battle started" and never runs inside a battle.

Branch `claude/battle-text-auto-advance` in `/private/tmp/pokebench-battle-text`. Default-off bundle switch. The bundle definition (`experiments/fixed/bundle-v-control.json`) is owned by the Dual GPU experiment readiness thread; this branch does not edit it. Merge only after the operator types "merge it".

## Evidence

- Showcase seq 18431–18487 (turns 722–726): `battle.phase` `resolving` with `ready:false` for 12 states, then `input` with `player_inputs[0].selected = FIGHT`.
- `gDisplayedStringBattle` at 0x02022E2C decodes from the run's raw RAM: `Go!  ,VQ  SOC !` (raw-ram 00007775), `What will |  ,VQ  SOC  do?` (00007782). The buffer is also reused for healthbox names (`WURMPLE♀`, 00007765), so a page is recorded only while the battle message window's text printer shows it (to be grounded in pokeemerald `battle_message.c` / `text.c` and proven on the real ROM).

## Design

- ON: when a press, navigate_to or the field auto-advance ends inside a battle whose phase is not input-ready, the harness advances with B (pokeemerald battle text waits on A or B; verify) until the next decision point: the action menu (FIGHT/BAG/POKéMON/RUN) or move menu is input-ready, a YES/NO or other menu (learn a move, switch, nickname a catch), the naming screen, the bag or party screen, the battle ending (field free, or a field message such as a blackout or Birch's script, handed back to field auto-advance), or the shared caps. Buttons left in the model's batch after the battle text starts are not sent. The result lists every battle message page shown, whole and in order, with turn, map and battle turn.
- OFF: today's behavior byte for byte (field auto-advance stops at the battle; battle presses send exactly the model's buttons).
- Timing from game state per emulated frame (INV-4); no sleeps.

## Milestones

**M1 — battle message readout (env)**
- [x] Ground the message window and printer state in pokeemerald; receipt on the real ROM from a save in battle (docs/findings/2026-10-16_battle-text.md; `runs/battle-text-qualify/m1-receipt.txt`)
- [x] RED/GREEN: `battle.message` {state printing/waiting_for_input/idle, render_state, text whole, cursor, identity}, `battle.prompt` (battle-script YES/NO), `battle.text_phase`; per-frame page journal `/pokebench/battle/messages`; frame-driven `/pokebench/battle/wait` (600-frame bound, released on pause); healthbox reuse of the buffer never read as a page; Python coverage ≥90
  - COMMIT: `test(RED): battle message window, page journal and frame-driven battle wait` (91acc0d8)
  - COMMIT: `feat(env): battle message window, page journal and frame-driven battle wait` (see next entry)
  - Tests after GREEN: agent 1406, viewer 794, Python 2046 (2 ROM-gated skips). Gates: test, lint (tsc, eslint, ruff, ruff format, mypy all clean; the copied mGBA binding means no `mgba._pylib` mypy noise here), build, coverage (agent L 99.08 / B 94.56 / F 97.98; viewer L 97.60 / B 90.45 / F 93.59; Python L 97.19 / B 92.81 / F 100; `battle_text.py` 100/100), verify-vendor: all green.
  - The state JSON gains the fields; the model-facing readout text is unchanged (readout.py reads named fields only), so no SERVER_FEATURES entry: the server records, only the agent switch shows.

**M2 — battle-text-auto-advance-v1 (agent)**
- [ ] Switch registered (guidance, needs `dialogue-auto-advance-v1`, default OFF), presets, DEFAULT_NEXT_RUN, toolSwitches
- [ ] RED: OFF byte-identical; ON advances the recorded showcase battle sequences to the action menu, stops at YES/NO, naming, bag/party, battle end, caps; dropped buttons; pages whole; factory test; wiring-removal check
- [ ] GREEN, gates (test, lint, build, coverage ≥90, verify-vendor)

**M3 — proof, explainer, review**
- [ ] Real-ROM proof from a wild battle and from the Birch rescue battle
- [ ] Explainer `docs/explainers/battle-text-auto-advance-v1.html`, FEATURE_EXPLAINERS mapping, pending `experiments/battle-text-auto-advance.json`
- [ ] Review: Claude CLI, Codex (gpt-5.6-sol), Grok (cursor-grok-4.5-high) until LGTM
- [ ] ASK USER: "merge it"

## Session Log

- 2026-10-16 01:59 AM EDT: worklog drafted, awaiting the operator's OK.
- 2026-10-16 02:05 AM EDT: implementation dispatched by the parent session (the operator's go). `just setup`; mGBA binding copied from the main env venv; vendor submodule initialized at the pin.
- 2026-10-16 02:30 AM EDT: M1 grounding done (docs/findings/2026-10-16_battle-text.md). Battle text is printer 0 (`sTextPrinters[B_WIN_MSG]`) on `gDisplayedStringBattle`; A and B both advance (`JOY_NEW(A_BUTTON | B_BUTTON)`), so B is used as in field auto-advance. Healthbox/move/PP/type text reuses the buffer at speed 0 and never leaves printer 0 active. Most battle messages advance on their own (`waitmessage`); only `\p`/`\l`/wait pages need input. Design consequence: a per-frame journal records every page (auto ones included) and a frame-driven `/pokebench/battle/wait` replaces any polling.
- 2026-10-16 02:35 AM EDT: M1 RED: `env/tests/env/test_battle_text.py` (27 tests, real raw-RAM fixture from the showcase run) and the TS schema/StateWatcher tests in `game-state.test.ts`.
- 2026-10-16 02:45 AM EDT: M1 GREEN. Real ROM: from the Birch rescue battle's first page the wait returned message_waiting, input (188 frames), one 600-frame bound in a long turn (619 frames busy), input, two waits for fainted/EXP, then field (124 frames) on CB2_Overworld with Birch's message open. A first cut that returned `field` on any non-battle callback stopped on the field-return callback 0x080861CD; `field` now means CB2_Overworld with no fade.
