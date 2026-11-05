# Rayquaza lane vs keepingiticy's run: merged deviation audit

Merged 2026-11-05 from `ki-deviation-audit-claude.md` and `ki-deviation-audit-codex.md`. Disagreements were settled on frames, path files or ROM source, not on `findings.md`.

**Keys.** A = `rayquaza-guide-badges-1-3.md`. B = `rayquaza-guide-heat-to-champion.md`. G = `packages/agent/src/rayquaza-guide.ts`. P = `experiments/presets/rayquaza-lane-8h.json`. `seg N #k` = row k of `runs/keepingiticy-video/paths/segment_N.summary.txt`. `v` = video time. OCR = `ocr_dialogue.tsv`. **✓** = re-checked on a frame, path file or ROM for this merge; the rest is carried from the audits.

**Severity** is judgement from route times, not measured on our runs. H: over 60 s, a real stall risk, or a badly exposed boss. M: 15–60 s, or a fight at risk. L: under 15 s. Where the audits differed, the row says so.

**Found by.** Both, Claude or Codex. "Class" for each row is the section it sits in.

## Operator decisions (the operator, 2026-11-05 4:18 PM)

Healing: items only, right before rival and gym leader fights; his own Center steps stay (Petalburg and Fortree respawn, Mauville heal). No nicknames for Mudkip or Rayquaza (intended). League: deposit down to Rayquaza alone. Buy X items at Rustboro Mart regardless of party. Fight his XP trainers. `town-center-checkpoint-v1` off in this lane.

## INTENDED

| ID | Deviation | Found by | Sev | KI evidence | Guide | Fix |
|---|---|---|---|---|---|---|
| I1 | Master Ball detour, including its Nugget | Both | M | Skipped: `master-ball.md`, seg 5 #15–21. ✓ ROM: walls at (14,9) and (15,8) leave only (15,10) Nugget or (16,9) Electrode as ways to reach (15,9) | B:48–51 | None. The Nugget pickup is the no-fight way in, so keep it. |
| I2 | No Button Mode L=A | Both | L | ✓ v0:00:48.5: FAST, OFF, SET, MONO, L=A | A:14, G:17 | None. |
| I3 | No RNG, save or reset; normal Mudkip and Rayquaza catch | Both | M | Save and reset v0:02:09–21; save v2:08:05; Poké Ball v2:08:52–2:09:00 | A:3, A:24, B:77 | None. Treat KI damage figures as observations. |
| I4 | TM39 taught for the Route 110 rival | Both | M | Sold at v0:45:16; KI used Mud-Slap, Mud Shot and Tackle there | A:62, A:68, A:71 | None. Budget the lost ₽1500 (U16). |
| I5 | Abra caught only if met | Both | M | Caught v0:20:22 | G:15, G:105 | None. Every Teleport keeps a walking fallback. |
| I6 | Castform not nicknamed | Both | L | ✓ "G" on the party frames v1:40:37 and v2:09:12 | B:24, P:128 | None. |

## UNINTENDED: High

| ID | Deviation | Found by | KI evidence | Guide | Fix |
|---|---|---|---|---|---|
| U1 | 4 of 5 Teleports not wired | Both | ✓ Rustboro → Petalburg v0:24:32 (seg 2 #9–10); Route 116 → Mauville v0:48:43; Route 111 → Mauville v0:58:44; Petalburg → Mauville v1:08:18; Summit → Fortree v1:21:40 | A:55, B:11, B:21, B:36 have no `TO:`; only A:85 matches. G:109–112 | Add `TO:PetalburgCity`, `TO:MauvilleCity` ×2, `TO:FortreeCity`. Say Teleport from outdoors, after the candy where there is one. Walking is the no-Abra fallback. |
| U2 | No step enters the Petalburg, Mauville or Fortree Center | Both (Claude M, Codex H) | ✓ Entered at seg 1 #26 and seg 4 #12 with 0 steps, only for the respawn; Mauville heals, seg 2 #37, before Wally. ROM: entry sets respawn | A:37, A:71, B:25 | Add "step into the Center" at Petalburg and Fortree, and heal at Mauville before Wally. U1 depends on this, so H. |
| U3 | Harness sends every town into its Center | Claude | ✓ KI enters 3 in the whole run. `town-center-checkpoint-v1` is on (P:304) and fires on any town that is not the respawn | P:304, G:112 | Turn it off for this lane and rely on U2. As it stands it costs a visit per town and moves the respawn, so Teleport notes stop firing. |
| U4 | Grind to Lv10 before Rustboro Gym | Both | ✓ Lv8 at v0:12:45, straight to the Gym (seg 1 #36–37). Mud-Slap on Josh; "A learned WA…" at Lv10, v0:14:53. Tommy fought with Water Gun, v0:15:10–40 | A:43, A:44, A:45 | Enter at Lv8, Mud-Slap until Water Gun comes mid-gym, then Josh, Tommy, Marc. Add the Nosepass heal contingency. |
| U5 | No Fly after Winona | Both | ✓ Fly map v1:27:25; Lavaridge arrival seg 5 #2; Route 112 and Cable Car #3–4 | B:39 | "Fly to Lavaridge, go east on Route 112 to the Cable Car." |
| U6 | No Fly after Juan | Both | ✓ Rayquaza flying v2:12:34; Mossdeep seg 7 #4; Route 127 #5 | B:85 | Add "Fly to Mossdeep" before Routes 127–128. KI taught both moves on this leg, so keep them in this row. |
| U7 | Post-Seafloor order is wrong and conditional | Both | ✓ Surfs west (Route 130 popup, `splits.csv`) to Pacifidlog, Fly from there v2:01:20, Mossdeep seg 6 #13 | B:72 | State it as an instruction: surf Routes 129–131 to Pacifidlog, Fly to Mossdeep, surf to Route 126. B:74 needs the Pacifidlog tag. |
| U8 | Repels bought but almost never used | Both (Claude H, Codex M) | ✓ 2 bought v0:09:01.6; 14 "wore off" or Repel prompts in OCR from v0:22:50 to v2:16:05; Super Repel ×8 of 11 by v0:53:12 | "Use" only at B:53, B:88. Buys: A:37, A:55, A:82, B:59 | Add a Repel line at each stretch: Woods, Route 116 after Taillow, Route 106, Route 112, then Super from Fallarbor, Max from Mossdeep. Buy 2 at A:37. |

## UNINTENDED: Med

| ID | Deviation | Found by | KI evidence | Guide | Fix |
|---|---|---|---|---|---|
| U9 | Walks out of Granite Cave | Both (Claude H, Codex M) | ✓ "A used the ESCAPE ROPE" v0:27:26, **in Steven's room**, same background as v0:26:11. About 40 s to walk back | A:58 | "Use the Escape Rope in Steven's room as soon as the TM47 dialogue ends." |
| U10 | Route 118 XP detours left out | Both (Codex H for Deandre) | ✓ Deandre seg 2 #35, 50 s, before the Mauville heal; Rose seg 3 #21, 58 s | A:71, A:85 | Name both, or skip them and state the level target. |
| U11 | XP trainers and early moves not named | Both | Calvin, Devan, Isabel, Kaleb, Alyssa, Edward, Lucas, OCR v0:07:59–0:46:38; Route 103 Tackle and Mud-Slap | A:26–36, A:51, A:68, A:69, A:83 | Name them or add level targets: 14 at Roxanne, 18 at the rival, 23 at Wattson. |
| U12 | No rule for wild battles | Both | Flees Wurmple v0:08:47, Shuppet v1:21:24 | No "run" line in A or B; G:12 | Add a short rule to `BATTLE_EXPLAINER`. |
| U13 | Level-up moves not specified | Both (Codex H) | Mud Shot over Growl v0:30:06. Declines Bide, Foresight, Mud Sport, Take Down, Muddy Water | A:59–62; A:72 and later assume it | Add Growl → Mud Shot, "decline other moves", and note that Mudkip evolves during the museum fight. |
| U14 | Taillow catch order | Both (Claude L, Codex M) | First Route 116 grass, Great Ball, before the Repel; then Devan | A:51 | "Catch in the first grass with the Great Ball, then Repel." |
| U15 | Rival battle offer | Both (Claude UNCLEAR, Codex M) | ✓ Offered on Route 104, not "never seen": rival leaves Briney's house at trigger (17,51), registers v0:25:16, KI says NO (v0:25:22, ROM NoConfidence branch) | A:55 | "Rival offers a battle in Rustboro or at Briney's house. Say NO." |
| U16 | Fallarbor list | Both | ✓ Guard Spec ×2 on the bag frame v0:53:12, ×1 at v1:40:29, second use v1:52:18. ✓ TM47 sold ₽1500 v0:45:18; TM34 stays | A:82 ("a Guard Spec", "spare TMs") | 2 Guard Specs; "sell TM47, keep TM34"; give a priority order since I4 leaves ₽1500 less. |
| U17 | Route 111 rocks come back | Claude | Rock Smash again on the way north, OCR v0:49:55 | A:85 | Add it, with the coordinates from A:78. |
| U18 | Maxie 1 lead left out | Both (Codex H) | ✓ Guard Spec on Taillow's turn v0:53:13, Taillow 0/20 by v0:53:18, Marshtomp enters under Mist | A:86 | Add the sacrifice lead with Guard Spec, a safe alternative, then Strength on Mightyena and Zubat, Mud Shot on Camerupt. |
| U19 | Flannery plan uses Water | Both | Mud Shot on Camerupt and Torkoal; Torkoal uses Sunny Day, OCR v0:56:47–0:57:01 | A:89 | X Attack first, Strength on Slugma, Mud Shot on Torkoal. |
| U20 | Heals at Lavaridge Center | Both | ✓ Straight to the Gym, seg 3 #29; Mauville stays the Teleport target | A:88 | Drop it. Any heal there must say it moves the Teleport target. |
| U21 | Herb Shop and Route 109 dock unnamed | Codex (H, with U1) | ✓ Herb Shop seg 3 #42; boat from Route 109 (21,26), seg 3 #49 | B:11 | Name both. The Teleport half is U1. |
| U22 | Brawly's path and level | Codex | ✓ Only Brawly fought, OCR v1:00:01–47; 75-step path seg 3 #51; candy to Lv30 before Norman | B:12, B:13 | Give the trainer-free path and the Lv30 target. |
| U23 | Norman resources | Codex (H) | ✓ Strength, Mud Shot, Rock Smash by foe, OCR v1:05:22–1:06:34; Slaking uses Counter and Facade. Item counts from `findings.md` | B:19 | Add counts and attacks by foe. M, because B:19 already has rooms and setup. |
| U24 | Route 118 Steven scene and Route 119 waypoints | Codex (H, with U1) | ✓ seg 4 #5–6; Steven in `splits.csv:116–118` | B:21, B:22 | Add the east-bank scene and trainer-skipping waypoints. |
| U25 | Route 121 setup order | Both | Candies and evolution v1:17:10–36, Fly, Shock Wave v1:18:02; Lilycove one tile, ✓ seg 4 #16 | B:32–36 | Keep two candies for Lv34, tag Lilycove and turn back, say when to spend the Summit candy. |
| U26 | Winona fight | Codex | Tropius leaves Swampert at 22 HP; Pelipper Protect; Energy Powder and PP use around v1:24 | B:38 | Add the setup, PP reserve and "decline Muddy Water". |
| U27 | Magma Hideout rooms and Rope | Codex | ✓ 1F → 2F_1R → 3F_1R → 4F, seg 5 #7–10; Rope after Maxie | B:45–47 | Add room exits, keep one Rope, name the Crobat contingency. |
| U28 | Aqua doubles and Declan | Codex | ✓ Max Elixir used on Swampert v1:40:37; Declan v1:40:55 | B:51–53 | Add "use the Max Elixir now" and the Declan fallback. |
| U29 | Tate & Liza plan | Codex (H) | Switch path seg 5 #25. Revive on Castform; Taillow and Abra as fodder (`findings.md:595–597`) | B:60 | Add waypoints and the partner plan, with a no-Abra option. M, because B:60 already has Surf and Revive. |
| U30 | Space Center plan | Codex | ✓ Mist is Guard Spec, not a move: "Ally became shrouded" v1:52:18; ROM `pokemon.c:4912` | B:61, B:62 | Four grunts, Guard Spec then X Special, Surf. Do not teach or prescribe Mist. |
| U31 | Seafloor waypoints | Codex | ✓ seg 6 #7–12 | B:64–66 | Add current and boulder waypoints and the Archie contingency. |
| U32 | Rope and Fly legs around Sky Pillar | Both (Claude L, Codex H) | ✓ Rope v2:03:47; Fly Pacifidlog v2:04:05, Fly Sootopolis v2:05:30, Fly Pacifidlog v2:06:55. ✓ Rayquaza has Fly, v2:09:20 | B:74, B:76, B:77 | Say "Fly" at each return. M, because B:74 has it and B:76–77 imply it. |
| U33 | First Sky Pillar climb omits the bike | Both | ✓ Biked throughout, seg 6 #18–24 | B:75 | Add "Mach Bike" to B:75. |
| U34 | Rayquaza not moved to lead | Claude | ✓ Swampert leads at 17/157, v2:09:12; Rayquaza first by v2:19:50 | B:79 | Add "move Rayquaza to first slot" and ExtremeSpeed on Luvdisc (OCR v2:10:36). |
| U35 | Juan's ice route and exit | Codex | ✓ seg 6 #35; exit via B1F, seg 7 #1–2 | B:79, B:85 | Add the tile route and the deliberate drop on exit. |
| U36 | Victory Road route | Codex | ✓ seg 7 #6–8; no Flash; Hope, Shannon and Julie, Edgar fought. seg 7 misses part of B2F | B:87–90 | Add waypoints and trainer order. Fill B2F from frames first. |
| U37 | Elite Four boosts and PP | Both (Claude L) | ✓ Dusclops: Protect ×2, then Fly v2:22:09–13, then Aerial Ace v2:22:29. Glacia and Drake one X Attack each | B:92–96 | Add the boost count and PP budget. Fly on Dusclops is optional. |
| U38 | Wallace boost plan | Codex (H) | ✓ Aerial Ace throughout, OCR v2:27:51–2:29:05; Gyarados Dragon Dance. Three X Attacks from `findings.md:612–614` | B:97 | Add the three-boost plan with HP checks. M, because B:97 already has safe-turn boosts. |
| U39 | Route 110 extras | Codex | Itemfinder dialogue; rival Yawn; Foresight at Lv20 | A:68, A:69 | Finish the dialogue, skip using the Itemfinder, add the sleep contingency. |

## UNINTENDED: Low

| ID | Deviation | Found by | KI evidence | Guide | Fix |
|---|---|---|---|---|---|
| U40 | Party kept for the League | Both (Claude L, Codex H) | ✓ DEPOSIT v2:19:51 and Swampert last out v2:19:50.5; Rayquaza alone in the Hall of Fame v2:30:40. Costs seconds | B:86, B:91 | Operator call (Q3). Solo removes our backup, so L. |
| U41 | Mudkip and Rayquaza named "A" | Both | ✓ "A" on Marshtomp v0:53:45; naming screen v2:09:08; "A Lv70" v2:09:12. Taillow and Abra keep names | A:15, A:24, P:128 | Operator call (Q2). Scope the prompt or add it to INTENDED. |
| U42 | Rival's mom needs no talk | Claude | ✓ seg 1 #5 is straight U6; her speech is automatic | A:21 | Drop "Talk to the mom". |
| U43 | Kecleon vague | Claude | Flees within 3 s, frames v1:15:40–47 | B:31 | "Run from it." |
| U44 | Castform's forgotten move | Claude | Rain Dance replaced by Shock Wave, frame v1:18:01 | B:32 | Name Rain Dance. |
| U45 | Summit Rare Candy row map | Both | Taken on the Summit v1:21:27; ROM `MtPyre_Summit` | B:36 | Say "On the Mt. Pyre Summit"; the row is tagged `FortreeCity`. |
| U46 | Rival team order | Claude | Slugma, Grovyle, Wingull, OCR v0:34:24–0:35:52 | A:68 | Reword. Order may depend on AI. |
| U47 | Jagged Pass on foot | Codex | ✓ seg 3 #27, bike 52 of 52 steps | A:87 | "Bike down." |
| U48 | Ben and the TM34 dialogue | Codex | Ben v0:41:33; Wattson's TM34 v0:43:25 | A:72, A:78 | Add Ben as XP; finish Wattson's dialogue. |
| U49 | `TO:RustboroCity` KI never used | Claude (UNCLEAR); Codex only noted the tag | ✓ Walks back, seg 2 #4–5. With Petalburg as respawn it cannot fire | A:52 | Remove once U2 and U3 land. |
| U50 | Timer start differs | Codex | Overlay starts at NEW GAME, about v0:00:54 | A:13–15, P | Report a NEW_GAME-relative split beside power-on time. |

## UNCLEAR

| ID | Deviation | Found by | Sev | KI evidence | Guide | Why it stays open |
|---|---|---|---|---|---|---|
| C1 | Healing and safety beyond KI | Both (Claude UNCLEAR, Codex UNINTENDED M) | H | One nurse heal plus the Institute bed. Calvin at 2 HP. ✓ Three fainted at the catch; ✓ no Center before Victory Road (seg 7 #5–6) | A:36, B:25, B:79, B:86, B:91; heal switches in P | `curriculum-additions.md:15` calls safety "ours not his", but it is not on the INTENDED list. Intent, not evidence (Q1). |
| C2 | Eight-badge mission beside delayed gyms | Codex | H | Dewford and Fortree deferred, `splits.csv` | P:302–304; `play-config.ts` | Not a frame or ROM question. Needs an offline check that gym reminders do not fight the guide. |
| C3 | Early visits and step order | Codex | H | Route 118, Lilycove, Pacifidlog and Dewford visited before the step that uses them | G:35–42, G:92–104 | Needs offline event sequences through `GuidePosition`. |
| C4 | Harness movement tooling | Codex (M); Claude found no deviation | M | KI registers the bike by hand v0:38:16 and rides continuously | P:336–338 | Same route, different inputs. Whether auto-mount holds speed over Sky Pillar cracks needs a lane run. |
| C5 | X items without Abra | Claude | L | Bought at Petalburg because Teleport lands there, v0:24:45. ✓ Rustboro Mart sells Repel, X Speed, X Attack | A:55 | Buy at Rustboro when Abra was not met? Operator choice (Q4). |

## Disagreements settled

| Point | Claude | Codex | Result |
|---|---|---|---|
| Battle Style at v0:00:48 | SHIFT, earlier frame | SET | SET (brief). |
| Where the Rope is used | From 1F | After Steven's scene | Codex. Same room at v0:26:11 and v0:27:26; ROM allows escaping there. The two blacks at v0:27:23–24 are the bag, not a warp. |
| Soft Sand at v1:40:40 | Not equipped | UNCLEAR | Claude. ✓ Frames v1:40:37–39: Max Elixir used, cursor rests on Soft Sand ×1, bag closes. Swampert holds Mystic Water at v2:19:50.5. No deviation, row dropped. |
| Rival offer | Never seen | Offered, decline | Codex. ✓ OCR plus Route 104 ROM trigger (U15). |
| Nugget by the Master Ball | Not raised | UNINTENDED: drop it | Neither. ✓ ROM: it is the no-fight access, so part of I1. |
| Source of Mist | Guard Spec | Verify | Guard Spec, on both uses (U30). |
| Route 110 Full Heal | Ball is a different item | UNCLEAR | Claude. ✓ Hidden at (37,67). The visible ball is Dire Hit at (30,69), with the Youngster at (33,69) in the same frame. Guide correct, row dropped. |
| Dusclops action | Fly once | Confirm from frames | Claude. ✓ v2:22:09 "A flew up high!" (U37). |
| `TO:RustboroCity` | UNCLEAR | Noted the tag only | ✓ KI walked (seg 2 #4–5), so UNINTENDED L (U49). |

Corrections to `findings.md` that still stand: 5 Teleports, not 4; Mudkip and Rayquaza are nicknamed "A"; Guard Spec ×2; the third Fallarbor sale is TM47; Fly to Lavaridge before the Cable Car; Pacifidlog then Fly to Mossdeep; Fly to Mossdeep after Juan; Soft Sand is not re-equipped at v1:40:40.

**Matched, keep:** badge order, Dewford skip, options, Petalburg Gym rooms, Fortree Gym walk, Seafloor room order, both Sky Pillar floor strings, HM allocation, hidden item coordinates, Lavaridge vent chain, Wallace's Sky Pillar choice.

## Operator questions

- **Q1 (C1).** Is safety beyond KI intended? If yes, add it to the INTENDED list and scope heals so they do not move the Teleport target.
- **Q2 (U41).** Keep "no nickname" for Mudkip and Rayquaza, or follow KI's "A"?
- **Q3 (U40).** Keep a backup in the League, or deposit to Rayquaza alone?
- **Q4 (C5).** Without Abra, buy the X items at Rustboro?
- **Q5 (U10, U11).** Match KI's XP trainers, or skip them and set level targets?
- **Q6 (U3).** May `town-center-checkpoint-v1` go off for this lane? It is a preset change, and U1 depends on it.
