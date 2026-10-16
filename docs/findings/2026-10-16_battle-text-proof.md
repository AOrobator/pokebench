# Real-ROM receipts: battle-text-auto-advance-v1

Tracked copy of the proof receipts. The full JSON receipts stay in the main checkout's ignored `runs/battle-text-qualify/` (save states never enter git); their SHA-256 digests are below so the copies can be matched. ROM: US Emerald SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7` via `POKEBENCH_ROM`. Servers: isolated `pokebench_env.launcher` runs from the branch worktree (M1 receipt: the env code committed as `c754f612`; M3 receipts: branch head `1a14f5a3`, agent built from it), `POKEBENCH_ACTIVE_UI=1`, ordinary presses only, no RAM writes.

- `runs/battle-text-qualify/m1-receipt.txt`: sha256 `02d6d8347adb6091039cd814362415cbd7938734c7ac5b9fcba55d714705df0b`
- `runs/battle-text-qualify/m1-receipt-messages.json`: sha256 `f6ef263f9c0ba043e68c8a8cd7cfba5dc4142f5c2e4ab47b2991513d084a8c8f`
- `runs/battle-text-qualify/m3-birch.json`: sha256 `14dcdbb8420739058cb1b07fec164fd70fb48781f026f001412dfba8d3d5aab7`
- `runs/battle-text-qualify/m3-wild.json`: sha256 `55693b3b023d941867c994d141e1851e37f8e970d59de43f4c4b65a625b574b1`

## M1: server wait and page journal (Birch rescue battle, from `states/first-battle-appeared.state`)

Driver `drive_m1.py`: wait → press B on `message_waiting`, A,A (FIGHT, first move) on `input`, stop on `field`. Columns: step, wait reason, frames waited, screen, in battle, text phase, message text.

```
0 message_waiting 0 battle True message_waiting Wild ZIGZAGOON appeared!
 None None
1 input 188 battle True input None None None
2 bound 600 battle True busy None None None
3 input 19 battle True input None None None
4 message_waiting 357 battle True message_waiting Wild ZIGZAGOON
fainted!
 None None
5 message_waiting 116 battle True message_waiting TORCHIC gained
17 EXP. Points!
 None None
6 field 124 overworld False None None None None
```

Journal pages (id, frame, battle turn, waited for input, text):

```
1 1 1 True 'Wild ZIGZAGOON appeared!'
2 86 1 False 'Go! TORCHIC!'
3 355 1 False 'TORCHIC used\nSCRATCH!'
4 590 1 False 'Wild ZIGZAGOON used\nGROWL!'
5 820 1 False "TORCHIC's ATTACK\nfell!"
6 1016 2 False 'TORCHIC used\nSCRATCH!'
7 1299 2 True 'Wild ZIGZAGOON\nfainted!'
8 1435 2 True 'TORCHIC gained\n17 EXP. Points!'
```

## M3: Birch rescue battle with the production tools (from `states/starter-confirm.state`)

Calls: A, then A,A three times. Driver `proof.mjs` (observe/press + `withDialogueAutoAdvance` from `packages/agent/dist`, `StateWatcher`, battle-text-auto-advance-v1 ON).

```
press A
pressed A
Press result: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 1 time to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.
Dialogue shown during this call (2 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "Wild ZIGZAGOON appeared!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "Go! TORCHIC!"
```

```
press A,A
pressed A, A
Press result: A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven) | then A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 0 times to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.
Dialogue shown during this call (3 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "TORCHIC used
SCRATCH!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "Wild ZIGZAGOON used
GROWL!"
3. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "TORCHIC's ATTACK
fell!"
```

```
press A,A
pressed A, A
Press result: A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven) | then A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 0 times to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.
Dialogue shown during this call (2 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 2: "TORCHIC used
SCRATCH!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 2: "Wild ZIGZAGOON used
TACKLE!"
```

```
press A,A
pressed A, A
Press result: A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven) | then A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 2 times to advance battle messages and 13 times to advance field dialogue; stopped: menu field_yes_no is open: options YES, NO; highlighted YES.
Dialogue shown during this call (18 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 3: "TORCHIC used
SCRATCH!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 3: "Wild ZIGZAGOON
fainted!"
3. turn 1 · ROUTE101 (map 0/16) · battle turn 3: "TORCHIC gained
17 EXP. Points!"
4. turn 1 · ROUTE101 (map 0/16) · at 6,13 · PROF. BIRCH: "PROF. BIRCH: Whew…"
5. turn 1 · ROUTE101 (map 0/16) · at 6,13 · PROF. BIRCH: "I was in the tall grass studying wild
POKéMON when I was jumped."
6. turn 1 · ROUTE101 (map 0/16) · at 6,13 · PROF. BIRCH: "You saved me.
Thanks a lot!"
7. turn 1 · ROUTE101 (map 0/16) · at 6,13 · PROF. BIRCH: "Oh?"
8. turn 1 · ROUTE101 (map 0/16) · at 6,13 · PROF. BIRCH: "Hi, you're AA!"
9. turn 1 · ROUTE101 (map 0/16) · at 6,13 · PROF. BIRCH: "This is not the place to chat, so come
by my POKéMON LAB later, okay?"
10. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "PROF. BIRCH: So, AA."
11. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "I've heard so much about you from
your father."
12. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "I've heard that you don't have your
own POKéMON yet."
13. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "But the way you battled earlier,
you pulled it off with aplomb!"
14. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "I guess you have your father's blood
in your veins after all!"
15. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "Oh, yes. As thanks for rescuing me,
I'd like you to have the POKéMON you"
16. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "used earlier."
17. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "AA received the TORCHIC!"
18. turn 1 · LITTLEROOT TOWN PROFESSOR BIRCHS LAB (map 1/4) · at 6,5 · PROF. BIRCH: "PROF. BIRCH: While you're at it, why not
give a nickname to that TORCHIC?"
```

Recorded `dialogue_auto_advance` events (requested, sent, dropped, auto presses, battle presses, stop, pages):

- ['A'] sent ['A'] dropped [] · B 1 (1 in battle) · battle_input · 2 pages
- ['A', 'A'] sent ['A', 'A'] dropped [] · B 0 (0 in battle) · battle_input · 3 pages
- ['A', 'A'] sent ['A', 'A'] dropped [] · B 0 (0 in battle) · battle_input · 2 pages
- ['A', 'A'] sent ['A', 'A'] dropped [] · B 15 (2 in battle) · menu · 18 pages

Buttons the press tool sent, in order: A B A A A A A A B B B B B B B B B B B B B B B

## M3: Route 101 wild battle with the production tools (from `states/route101-grass-torchic.state`)

Calls: one walk step per call (LEFT/RIGHT) until a battle started on the 14th, then A,A per turn. Walk calls without a battle are omitted here. Driver `proof.mjs` (observe/press + `withDialogueAutoAdvance` from `packages/agent/dist`, `StateWatcher`, battle-text-auto-advance-v1 ON).

```
press RIGHT
pressed RIGHT
Press result: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 1 time to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.
Dialogue shown during this call (2 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "Wild POOCHYENA appeared!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "Go! TORCHIC!"
```

```
press A,A
pressed A, A
Press result: A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven) | then A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 0 times to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.
Dialogue shown during this call (2 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "TORCHIC used
SCRATCH!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 1: "Wild POOCHYENA used
TACKLE!"
```

```
press A,A
pressed A, A
Press result: A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven) | then A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 0 times to advance battle messages; stopped: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT.
Dialogue shown during this call (2 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 2: "TORCHIC used
SCRATCH!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 2: "Wild POOCHYENA used
TACKLE!"
```

```
press A,A
pressed A, A
Press result: A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven) | then A: interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)
Battle text auto-advance: the harness pressed B 2 times to advance battle messages; stopped: the battle ended and field controls are free.
Dialogue shown during this call (3 pages, in order, whole):
1. turn 1 · ROUTE101 (map 0/16) · battle turn 3: "TORCHIC used
SCRATCH!"
2. turn 1 · ROUTE101 (map 0/16) · battle turn 3: "Wild POOCHYENA
fainted!"
3. turn 1 · ROUTE101 (map 0/16) · battle turn 3: "TORCHIC gained
15 EXP. Points!"
```

Recorded `dialogue_auto_advance` events (requested, sent, dropped, auto presses, battle presses, stop, pages):

- ['RIGHT'] sent ['RIGHT'] dropped [] · B 1 (1 in battle) · battle_input · 2 pages
- ['A', 'A'] sent ['A', 'A'] dropped [] · B 0 (0 in battle) · battle_input · 2 pages
- ['A', 'A'] sent ['A', 'A'] dropped [] · B 0 (0 in battle) · battle_input · 2 pages
- ['A', 'A'] sent ['A', 'A'] dropped [] · B 2 (2 in battle) · field_free · 3 pages

Buttons the press tool sent, in order: B A A A A A A B B

