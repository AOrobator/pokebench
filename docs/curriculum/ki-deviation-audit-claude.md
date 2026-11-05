# Rayquaza lane vs keepingiticy's run: deviation audit (Claude)

Audited 2026-11-05 against branch `claude/rayquaza-lane` at bbb970df3. Read-only apart from this file. The other audit in this folder was not read.

**Keys.** G1 = `rayquaza-guide-badges-1-3.md`. G2 = `rayquaza-guide-heat-to-champion.md`. `seg N #k` = row k of `runs/keepingiticy-video/paths/segment_N.summary.txt`. `v` = video time. "Frame" means I opened a frame cut from the 720p video. "OCR" means `ocr_dialogue.tsv`.

**Severity for route time.** High: over 60 s, or a real risk of stalling. Med: 15–60 s, or a fight at risk. Low: under 15 s.

**Limit.** "Med" and "High" are my judgement from segment times, not measured on our runs.

## Corrections to the KI notes

Frames and paths overrule these notes. Several change what the guide should say.

| Note says | Evidence says |
|---|---|
| findings: 4 Teleports | **5.** Also Petalburg → Mauville at v1:08:18 (OCR "healing spot used last in MAUVILLE C"; seg 4 #3 → #4). |
| findings: Mudkip and Rayquaza not nicknamed; "declines" at 2:09:16 | **Both are named "A".** Rayquaza's naming screen is open at v2:09:08 (frame), and its battle box reads "A Lv71" at v2:22:06 (frame). Marshtomp's box reads "A" at v0:53:45 (frame). Birch's prompt is at v0:04:28, with a black fade at v0:04:29. Taillow and Abra keep their names. |
| findings: bought 1 Guard Spec | **At least 2.** Used at v0:53:13 (frame, "Ally became shrou…"), yet the bag still holds ×1 at v1:40:29 (frame). OCR reads ×2 at v0:53:12 and ×1 at v0:53:25. |
| findings: "one more ₽1500 item" | **TM47** (frame v0:45:18). TM34 stays in the bag on that frame. |
| findings 40: "Cable car" after Winona | **Fly to Lavaridge first** (OCR v1:27:25; seg 5 #2). |
| findings 48: surf to the Route 126 dive spot | **Surf to Pacifidlog, Fly to Mossdeep, then surf.** Fly cursor on Pacifidlog then Mossdeep at v2:01:15–16; seg 6 #13. |
| findings 54: surf 127/128 after Juan | **Fly to Mossdeep first** (seg 7 #4). |
| findings 19, 34: Mauville visits | Two Route 118 detours, and only one is noted. Deandre at v0:38:49 is missing (seg 2 #35). |
| findings 21: "Nugget on Route 113" and items.csv | The hidden Fallarbor Nugget and the hidden Route 110 Full Heal in G1 are right (ROM (2,15), (37,67); seg 3 #8). The ball beside him at v0:34:06 is a different item. |
| items.csv: Soft Sand "back on Swampert at v1:40:40" | Not supported. Soft Sand ×1 is in the bag at v1:40:36 (frame), and the cursor only passes over it. |

## INTENDED

| ID | Deviation | KI evidence | Ours | Note |
|---|---|---|---|---|
| I1 | Master Ball detour | Skipped, `master-ball.md` | G2:48–51 | |
| I2 | No Button Mode L=A | v0:00:48 option screen | G1:14 | |
| I3 | No RNG, save or reset; normal Mudkip and Rayquaza plan | Save and reset v0:02:09–21; save v2:08:05; Poké Ball v2:08:52 | G1:3, G1:18, G2:77 | |
| I4 | TM39 taught for the Route 110 rival | Sold at v0:45:16 | G1:62, G1:68, G1:71 | Costs ₽1500 at Fallarbor, so the shop list will not fully fund. See U16. |
| I5 | Abra only if met | Caught v0:20:22 | `rayquaza-guide.ts:15`, `:103` | See U6 for the Teleports that depend on it. |
| I6 | Castform not nicknamed | "G" (frame v1:17:06) | G2:24, `no-nickname-guidance-v1` | |

## UNINTENDED: High

| ID | Deviation | KI evidence | Ours | Proposed fix |
|---|---|---|---|---|
| U1 | Grinding to Lv10 before the gym | Goes straight to the door at Lv8 (v0:13:37); Water Gun learned during Josh (OCR v0:14:53) | G1:43, G1:44 | Replace with: enter at Lv8, use Mud-Slap until Water Gun comes mid-gym. |
| U2 | No Fly after Winona | Fly to Lavaridge, Route 112, Cable Car (OCR v1:27:25; seg 5 #2–4) | G2:39 | Add "Fly to Lavaridge, go east on Route 112 to the Cable Car". |
| U3 | No Fly after Juan | Fly to Mossdeep, surf south (seg 7 #4–5) | G2:85 | Add "Fly to Mossdeep" before Routes 127–128. |
| U4 | Post-Seafloor order is wrong and conditional | Surf Route 128 to Pacifidlog, Fly to Mossdeep, surf to the Route 126 dive (OCR v2:01:15–25; seg 6 #13–14) | G2:72 | State that order as an instruction. Pacifidlog is needed for the Fly at G2:74. |
| U5 | Walks out of Granite Cave | Escape Rope at v0:27:26 | G1:58 ("Leave the cave") | "Use the Escape Rope from 1F" in that step. |
| U6 | 4 of 5 Teleports have no `to` | Rustboro → Petalburg v0:24:32; Route 111 → Mauville v0:58:44; Petalburg → Mauville v1:08:18; Mt. Pyre → Fortree v1:21:40 | Only G1:85 matches. G1:55, G2:11, G2:21, G2:36 lack `TO:` | Add `TO:` tags. Applies only when Abra was met. |
| U7 | Harness sends every town into its Pokémon Center | KI enters 3 in the whole run: Petalburg, Mauville, Fortree (seg 1 #26, seg 2 #37, seg 4 #12) | `town-center-checkpoint-v1` on in the preset | Turn it off for this lane and add explicit rows (U8). As it stands it costs a visit per town and moves the respawn, so `situationNotes` (`rayquaza-guide.ts:109–110`) stops firing for later Teleports. |
| U9 | Repels are bought but almost never used | About 20 uses: v0:11:41, 0:20:46, 0:44:08, 0:45:52, 0:47:30, 0:48:25, 1:08:32, 1:57:32, 2:07:51, each re-applied after "wore off" | "Use" only at G2:53, G2:88; no harness code | Add a Repel line at the start of each stretch: Woods, Route 116, 106, 112, then Super from Fallarbor, Max from Mossdeep. |

## UNINTENDED: Med

| ID | Deviation | KI evidence | Ours | Proposed fix |
|---|---|---|---|---|
| U8 | No step enters the Petalburg, Mauville or Fortree Center | Petalburg and Fortree entered with 0 steps (v0:09:12, v1:15:05), purely to set the respawn; Mauville heals (v0:39:45) | G1:37, G1:71, G2:25 | Add "step into the Center" at Petalburg and Fortree, and heal at Mauville. |
| U10 | Heals at Lavaridge Center | Straight to the gym, 5 s (seg 3 #29). Mauville stays the Teleport target | G1:88 | Drop it. Enter the Gym directly. |
| U11 | Route 118 XP detours left out | Deandre v0:38:49 (seg 2 #35), Rose v0:49:00 (seg 3 #21), about 50 s each | G1:71, G1:85 | Name both, or decide to skip them and state the level target. |
| U12 | Other XP trainers not named | Calvin, Devan, Isabel, Kaleb, Alyssa, Edward, Lucas (OCR v0:07:59 to v0:46:38) | G1:36, G1:51, G1:68, G1:69, G1:83 | Name them or add level targets: 14 at Roxanne, 18 at the rival, 23 at Wattson. |
| U13 | No rule for wild battles | Flees: Wurmple v0:08:47, Shuppet v1:21:24 | None; 0 "run" lines in either guide | Add a short rule to `BATTLE_EXPLAINER`. |
| U14 | Level-up moves not specified | Mud Shot over Growl (v0:30:06). Declines Bide, Foresight, Mud Sport, Take Down, Muddy Water | Later rows assume this moveset (G1:85) | Add Growl → Mud Shot and "decline other moves". |
| U15 | Maxie 1 lead left out | Taillow leads (frame v0:53:06), uses Guard Spec on its own turn (v0:53:13), faints, Marshtomp enters under Mist | G1:86 | Add the sacrifice lead, with Guard Spec on that turn. |
| U16 | Fallarbor list | At least 2 Guard Specs; sold exactly Nugget, TM39, TM47; keeps TM34 for Castform | G1:82 ("a Guard Spec", "spare TMs") | Say 2 Guard Specs, "sell TM47, keep TM34", and give a priority order since I4 leaves ₽1500 less. |
| U17 | Flannery plan uses Water | Mud Shot on Camerupt and Torkoal; Torkoal uses Sunny Day (OCR v0:56:47–0:57:01), which halves Water moves | G1:89 | Use Mud Shot on Torkoal. Add X Attack first and Strength on Slugma. |
| U18 | Route 111 rocks come back | Rock Smash again on the way north (OCR v0:49:55) | G1:85 | Add it, with the same coordinates as G1:78. |
| U19 | First Sky Pillar climb omits the bike | Biked throughout (seg 6 #18–24) | G2:75; only G2:77 says Mach Bike | Add "Mach Bike" to G2:75. |
| U20 | Rayquaza not moved to lead | Swampert leads at 17/157 (frame v2:09:12); Rayquaza leads by v2:10:36. The exact swap frame was not found | G2:79 | Add "move Rayquaza to first slot", and ExtremeSpeed on Luvdisc (OCR v2:10:36). |

## UNINTENDED: Low

| ID | Deviation | KI evidence | Ours | Proposed fix |
|---|---|---|---|---|
| U21 | Nicknames | Mudkip and Rayquaza named "A", which shortens battle text | `no-nickname-guidance-v1` says NO always | Operator call. Keeping NO is simplest; if so, add it to the intended list. |
| U22 | Party kept for the League | Deposits all but Rayquaza at the League PC (OCR v2:19:46; frame v2:19:50) | G2:86, G2:91 | Add one line, or add to the intended list. |
| U23 | Rival's mom needs no talk | Her speech is automatic (OCR v0:03:04; seg 1 #5 is straight U6; ROM `GoSeeRoom` trigger) | G1:21 | Drop "Talk to the mom". |
| U24 | Kecleon vague | Sends out, then flees within 3 s (frames v1:15:40–47) | G2:31 ("handle") | Say "run from it". |
| U25 | Return to Sootopolis | Fly animation by v2:05:30 (frame) | G2:76 | Say "Fly". |
| U26 | Castform's forgotten move | Rain Dance replaced by Shock Wave (frame v1:18:01) | G2:32 | Name Rain Dance. |
| U27 | Phoebe's Dusclops | Uses Fly once (frame v2:22:09), then Aerial Ace | G2:93 | Optional. |
| U28 | Taillow's ball | Great Ball (findings; items.csv from bag at v0:20:11, not re-checked) | G1:51 | Add "with the Great Ball". |
| U29 | Rival order | Slugma, Grovyle, Wingull (OCR v0:34:24–0:35:52) | G1:68 | Reword. Order may depend on AI. |
| U30 | Summit Rare Candy note names no map | Picked up on the Summit (v1:21:27; ROM `MtPyre_Summit` (37,7)) | G2:36 row is tagged `FortreeCity` | Say "On the Mt. Pyre Summit". |

## UNCLEAR: needs an operator decision

| ID | Deviation | KI evidence | Ours | Question |
|---|---|---|---|---|
| C1 | Healing and safety | One nurse heal in the whole run (OCR v0:39:45) plus the Institute bed. Calvin at 2 HP; Swampert 17/157 and three fainted at the catch (frame v2:09:12) | G1:36 and about 11 heal lines, including G2:25, G2:79, G2:86, G2:91; `heal-before-trainers-v2`, `gym-heal-warning-v1`, `story-battle-heal-first-v1`, `trainer-heal-guidance-v1` | `curriculum-additions.md` calls safety "ours not his", but it is not on the intended list. Keep it? |
| C2 | Teleport he never made | Walks Rusturf → Rustboro, 57 steps (seg 2 #4) | G1:52 `TO:RustboroCity` | Fires only with a Rustboro respawn, which would misdirect the Teleport to Petalburg. Remove? |
| C3 | Rustboro rival offer | Never seen: Teleport avoids the y=53 trigger (ROM `RustboroCity/map.json`) | G1:55 "say NO unless…" | Always NO? |
| C4 | X items without Abra | Bought at Petalburg because Teleport lands there (v0:24:45) | G1:55 | Rustboro Mart stocks the same items (ROM). Buy there when Abra was not met? |

## Checked, no deviation

Mach Bike registration and riding (`bike-register-v1`, `bike-auto-mount-v1`); `story-route-plan-v1` is off; Text FAST and Battle Scene OFF (Battle Style SET is taken from the brief: my v0:00:48 frame still shows SHIFT selected, and I did not catch a later frame); Rock Smash, Strength, Surf and Dive replacements; Rayquaza's Aerial Ace over ExtremeSpeed and Waterfall over Rest (OCR v2:11:36, v2:20:48); Lilycove touched before Mt. Pyre (seg 4 #16); hidden item coordinates at Route 110, Route 111, Fallarbor, Petalburg, Route 120 and the Summit (ROM); Elixir tiles; Lavaridge vent chain; Fortree Gym walk (seg 4 #23); Sky Pillar strings (seg 6); Seafloor room order; Wallace's Sky Pillar choice (ROM multichoice).

## Summary

| Class | Count | Items |
|---|---|---|
| INTENDED | 6 | I1–I6 |
| UNINTENDED High | 8 | U1–U7, U9 |
| UNINTENDED Med | 12 | U8, U10–U20 |
| UNINTENDED Low | 10 | U21–U30 |
| UNCLEAR | 4 | C1–C4 |
| **Total** | **40** | 30 UNINTENDED |

Top ten UNINTENDED, in fix order: U1, U2, U3, U4, U5, U6, U7, U9, U8, U15.
