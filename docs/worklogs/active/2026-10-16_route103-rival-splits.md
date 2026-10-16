# Route 103 rival splits (measurement only)

Operator ask (the operator, 2026-10-16 02:55 and 03:13 EDT; plan OK 03:44 EDT): more milestones between Oldale and the Pokédex, and rival battle started split from rival battle won.

## Grounding (pokeemerald 731ad5bf, verified on run 2026-10-16T02-23-17_qwen36-gpu1_sh02 raw RAM)

- Route 103 rival is an object script (no coord trigger): `Route103_EventScript_Rival` → `trainerbattle_no_intro TRAINER_{MAY,BRENDAN}_ROUTE_103_{TREECKO,TORCHIC,MUDKIP}` (opponents.h 520/523/526/529/532/535) → `AfterMayBattle` talk → `RivalExit` → `RivalEnd` sets VAR_BIRCH_LAB_STATE 4, FLAG_DEFEATED_RIVAL_ROUTE103 (0x82), VAR_OLDALE_RIVAL_STATE (0x40C7) 1.
- gTrainerBattleOpponent_A 0x02038BCA (122 literal-pool refs in the ROM); gBattleTypeFlags 0x02022FEC, BATTLE_TYPE_TRAINER = bit 3. Trainer flag = TRAINER_FLAGS_START 0x500 + id.
- sh02: frame 148843 opponent 0→535 with trainer bit; 151983 flag 0x717 set (battle won); 152367 flag 0x82 set (scene over, recorded RIVAL_BATTLE_WON 03:14 EDT). Afterwards lab 4, Oldale rival 1.
- `OldaleTown_EventScript_RivalFinish` sets Oldale rival state 2 after the "let's go back" scene; `LittlerootTown` OnTransition also sets 2 when it is still 1, so the Oldale split needs the 1→2 change inside Oldale.

## Design

- New reader field `route103_rival` {battle_active, defeated, oldale_stage} beside game_stats, NOT inside `story`: loop detection fingerprints `story` as progress, and `story.text()` is the model readout. Readout text bytes stay identical.
- `RIVAL_BATTLE_WON` keeps its flag and meaning (no model-visible timing change: hint, objectives and stall clocks key off it). Viewer label becomes "Rival sends you back".
- New measurement-only splits (feature `route103-rival-splits-v1`), in order after ROUTE_103:
  - RIVAL_BATTLE_STARTED: battle_active (in battle, trainer bit, opponent in the six ids).
  - RIVAL_BATTLE_DEFEATED: any of the six trainer flags; precedes RIVAL_BATTLE_WON.
  - (RIVAL_BATTLE_WON existing)
  - RIVAL_OLDALE_SEND_OFF: settled OLDALE TOWN at Oldale rival 1, then settled OLDALE TOWN at 2.
  - ROUTE_101_AFTER_RIVAL_BATTLE: witness lab 3, settled OLDALE TOWN at lab 4, settled ROUTE 101 at lab 4.
  - LITTLEROOT_AFTER_RIVAL_BATTLE: witness lab 3, settled ROUTE 101 at lab 4, settled LITTLEROOT TOWN at lab 4.
- Viewer derives the two lab-state splits for older logs; the three reader splits need the new field.

## Milestones

- [x] M1 Python reader: RED/GREEN, readout bytes unchanged, coverage ≥90
  - RED: test_route103_rival.py fails at import (no pokebench_env.route103_rival).
  - GREEN: pytest 2150 passed; Python coverage lines 97.15 / branches 92.80 / functions 100 (route103_rival.py 100%); ruff clean. mypy reports only the pre-existing mgba._pylib import (no native build in this worktree). Updated shape-golden tests: state_json key list, GameState equality, displayed-names json golden pops only route103_rival.
- [x] M2 TS schema, tracker, qualification, viewer, frontier, features: RED/GREEN, gates
  - RED: agent route103-rival.test.ts 5 failing; viewer frontier 5, frontier-recording 1, panels 1 failing.
  - GREEN: agent 1440/1440 (cov 97.75 st / 94.64 br / 98 fn / 99.09 ln), viewer 826/826 (95.2 / 90.68 / 93.56 / 97.65), tsc+eslint clean, schemas/events.v1.json regenerated. Recorder refuses a run that declares route103-rival-splits-v1 when the reader omits the field (fake-server fixtures now send route103_rival:null). Name-plate milestone totals 40→45. Explainer docs/explainers/route103-rival-splits-v1.html (pages-check clean) mapped in FEATURE_EXPLAINERS.
- [ ] M3 Explainer, reviews (Codex + grok), operator approval, local merge
  - Review 1: Codex gpt-5.6-sol BLOCKING (frontier-recording compact() drops route103_rival so receipts fail qualification; rivalWitness accepts post-defeat/in-battle lab-3 states). grok cursor-grok-4.5-high BLOCKING (loop-detection nativeProgress counts measurement-only story splits as progress, resetting the guard). All accepted. RED: agent 3, viewer 2 failing. GREEN: loop guard iterates NATIVE_PROGRESS_MILESTONES (story minus measurement-only); compact() keeps route103_rival; pre-battle witness excludes battle_active/defeated states (tracker and viewer). agent 1442 (97.75/94.64/98/99.09), viewer 828 (95.2/90.7/93.56/97.65), lint clean.
  - Review 2: grok LGTM (low: behavioral loop test, import placement). Codex BLOCKING: legacy logs without route103_rival still take an in-battle or post-battle Route 103 lab-3 state as the witness. Accepted: witness never in battle, and without the field never on Route 103. RED committed (agent 1, viewer 1); legacy derivation fixture's witness moved to Oldale. GREEN: agent 1443 (97.75/94.63/98/99.09), viewer 829 (95.2/90.69/93.56/97.65), lint clean; NATIVE_PROGRESS_MILESTONES moved below imports.
  - Review 3: Codex gpt-5.6-sol LGTM (codex3.log); grok LGTM (grok2.log). Awaiting operator merge approval.
  - Operator said "merge it" (2026-10-16 04:33 EDT). Synced with main (one conflict: features.test.ts legacy list, resolved by adding route103-rival-splits-v1 to main's list and moving native-target-stop-v1 to index 32). Main moved again; re-synced (same features.test.ts conflict, same resolution). Gates on the synced tip: agent 1501, viewer 871, pytest 2212 passed; coverage agent 97.85/94.43/98.16/99.13, viewer 95.37/91.01/93.58/97.71, Python lines 97.26 branches 92.96 functions 100; tsc/eslint/ruff clean; mypy clean with the mgba-built venv (worktree venv lacks the native binding). Claude CLI review config is not logged in, so the Claude lane runs as Cursor Claude. Final round: Claude, grok and Codex on the sealed packet (runs/reviews/route103-rival/final.*).
  - Final round 1 (packet f352e223, base 6d2be8af): Claude (fresh read-only subagent, operator-approved 05:10 EDT) LGTM with 5 low/info notes deferred; grok LGTM; Codex LGTM. Cursor Opus/Sonnet were at usage limit; Claude CLI review config logged out; `claude -p` was refused by the auto-mode guard as self-approval.
  - Held for claude/nav-guidance (164d7a79). Re-synced: conflicts in features.test.ts (legacy list) and panels.test.ts (kept both explainer tests). Gates on the tip: agent 1555, viewer 884, pytest 2236; coverage agent 97.89/94.56/98.2/99.14, viewer 95.34/91.02/93.62/97.64, Python 97.31/93.08/100; lint, ruff, mypy clean. Final round 2 on the new packet.

## Landing and follow-up

- MERGE: fast-forward of main to `3307db77` (packet e233c5d6; Claude subagent, grok, Codex LGTM in runs/reviews/route103-rival/final2-*.log).
- Post-landing `just test` on main FAILED: 34 real-ROM pytest cases (battle_message_waiting 10, in_game_naming 13, offscreen_objects 7, connection_edges 2, rerender 2) raised KeyError 0x02038BCA. Their fixtures hold only the RAM windows older readers touched; route103_rival also reads gTrainerBattleOpponent_A. The worktree had no `.env`, so POKEBENCH_ROM was unset and these tests skipped, hiding it from the gates. Live play reads full RAM and was unaffected.
- [x] Fix (branch claude/route103-fixture-windows): append the missing windows (opponent id, battle type flags, the rival trainer-flag bytes, the Oldale rival var) to the 11 window fixtures, copied from each fixture's own source raw-RAM archive (SHA-256 checked where the fixture records it). No code change. With `.env` present: agent 1555, viewer 884, pytest 2270 passed, 0 skipped. COMMIT: `test(fixtures): RAM windows for the Route 103 rival reader in real-ROM fixtures` (3c237922). Gates: lint/ruff/mypy clean; coverage agent 97.89/94.56/98.2, viewer 95.34/91.02/93.62, Python 97.33/93.17/100; verify-vendor OK.
- Lesson: copy `.env` into a worktree before running gates so real-ROM tests run.
- Fix review (packet 9ac04a6c, base 1f4ac74e, head beb9bff1): Claude (fresh read-only subagent) LGTM; Codex gpt-5.6-sol LGTM; grok LGTM on round 2 after round 1 blocked only for lacking shell (verify.py/verify.txt: 24 groups, archive SHA match, old windows an unchanged prefix, 0 byte mismatches). Re-synced with main; `git diff --binary main HEAD` stayed byte-identical (9ac04a6c). MERGE: fast-forward of main to `2cb0e316`. On main: pytest 2270 passed with POKEBENCH_ROM set (0 failed), viewer 904 passed, agent 1618/1619 with one runs-cli timeout under load that passes alone (16/16).

## Review notes follow-up (operator OK 2026-10-16 13:16 EDT)

Branch claude/route103-review-notes. Claude-lane low/info notes from final round 1:
- [x] Tracker witness requires a location, like the viewer (RED: route103-rival.test.ts null-location witness, 1 failing; GREEN: agent 1868 passed).
- [x] Explainer: "Rival battle starts" also counts a battle the player then loses; a rematch after a loss gives no second credit; furthest_milestone can now name these splits (the two battle splits between ROUTE_103 and RIVAL_BATTLE_WON, the other three between RIVAL_BATTLE_WON and RECEIVED_POKEDEX); status updated to landed.
- [x] Feature blurb names the defeat split "rival beaten" so it is not confused with RIVAL_BATTLE_WON.
- Decision (PB9): crediting RIVAL_BATTLE_STARTED for a battle later lost is intended; it marks reaching the battle, and RIVAL_BATTLE_DEFEATED marks winning it.
- Principles evidence (PB11): the opponent address rests on the sh02 raw-RAM transition (frame 148,843, 0→535 with the trainer bit), the ROM literal-pool count is supporting only.
- Gates (with .env): agent 1868, viewer 932, pytest 2313 passed; coverage agent 97.99/94.69/98.4, viewer 95.33/91.09/93.68, Python 97.37/93.23/100; lint, ruff, mypy clean; pages-check clean.
- Review round 1: Claude subagent BLOCKING (medium): the explainer put all five splits after RIVAL_BATTLE_WON; the two battle splits come before it. Fixed in the explainer and this note; code unchanged.
- Round 2 (packet 718e33e1): Claude subagent LGTM, grok LGTM, Codex LGTM. Re-synced; diff byte-identical. MERGE: fast-forward of main to `b80c4481`. On main: viewer 933, pytest 2372 (ROM set) passed; agent 1871/1872, the one failure is runs-cli "uses the repo runs/ directory and the 500 MB cap" timing out at 5 s while it scans the real 26 GB runs/ under load (passes alone, 16/16; same flake seen at 2cb0e316, unrelated to this change).

## runs-cli disk test follow-up (coordinator handoff, 2026-10-16 13:40 EDT)

`runs-cli.test.ts` "uses the repo runs/ directory and the 500 MB cap" called `main(["disk"])`, which scans the real 26 GB runs/ and timed out at 5 s under load (seen at 2cb0e316, b80c4481 and in the harness-bugs thread). Fix: `main` takes an optional runs root (default `RUNS_ROOT`); the test passes a fixture root and still checks the 500 MB cap wiring (exact output) and that `RUNS_ROOT` is the repo's runs/. No timeout change.
- [x] Round 1 RED: the test asserts the fixture's 400 B against the 500 MB cap; main ignores the root (1 failing). GREEN: runs-cli 16/16; agent, viewer 933, pytest 2372 pass (ROM set); coverage agent 97.99/94.69/98.4, viewer 95.33/91.09/93.68, Python 97.42/93.35/100; lint clean.
- Review round 1: Claude LGTM (low: RUNS_ROOT uses URL.pathname), grok LGTM, Codex BLOCKING (medium: URL.pathname keeps %20 and Windows drive slashes; medium: main.length does not prove the default root). Accepted both. RED: runs-cli-main.test.ts mocks FrameStore to record the default root and cap without scanning, and runsRootFor must decode escaped paths (fails: runsRootFor missing).
