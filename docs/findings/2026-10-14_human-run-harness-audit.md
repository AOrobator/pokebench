# Finished human run: harness gaps

Audit of `2026-10-13T23-50-13_human_1848`, through final event 100267. Original events and frames remain unchanged. Supplemental receipts live in the run’s `harness-audit/` and `strategy-audit/` directories. This audit changes no harness/model behavior. All 13,324 available screenshots were scanned (8,087 battle, 5,237 nonbattle); key positive findings were verified visually.

## Recording integrity

100,268 consecutive events; 49,237 applied input intervals cover emulator frames 0–397,952 with no gaps. All 13,324 saved screenshots exist and match their recorded SHA1 hashes. Median screenshot spacing 0.501s supports the two-per-second target. Three screenshot gaps are 1.112–1.262s. Median RAM-state spacing 0.192s (about 5.2/s); one unpaused state gap1.038s. The declared 100 ms sample delay is a wait between observations, not a guaranteed 10 Hz capture rate.

Sampling preserves a useful baseline but cannot establish every brief menu phase or exact battle turn. Repeated screenshots of the same message are not multiple actions. Input intervals supply actual applied frames; sampled milestone frames remain first-observation upper bounds.

## Highest-priority fixes still needed

| Priority | Gap | Evidence and required behavior |
| --- | --- | --- |
| 1 | Battle readout | 21,946 state samples use unsupported callback `0x08038421`. Record the actual active Pokémon, opponent identity/level/HP, moves and PP, status, action/move/target selection, readiness and outcome. Screenshots currently supply this evidence through manual inspection/OCR. Verify each input owner against the matching ROM; a blanket battle callback label cannot establish cursor or readiness. |
| 2 | Pokémon decoding validity | 29 state samples report impossible species IDs 42103, 58708, 4205, 40833. Seq 9262 is Torchic→invalid→Torchic with unchanged level/HP. Current reader still emits species strings rather than rejecting invalid/checksum-failing data. Validate the decrypted Pokémon checksum, species/level/HP bounds and ownership; retry or expose unknown instead of silently producing a species. Preserve bounded raw bytes/checksum when decoding fails. |
| 3 | Actionable menus |Starter selection/confirmation, party switching, Bag, shop quantities and summary moves were encountered with unsupported state and no selected value. Examples: state seq 57538/shop quantity 3,51216/Oran Berry Bag,70026/fainted-Marill party menu,94418/Rollout summary. Record selected item/slot/move, quantity, relevant contents and readiness through each real owner. |
| 4 | Inventory, captures and berry history |Record received/used/bought items, successful catches with species/identity and party-or-box destination, completed learned/replaced moves, and berry tree harvest/plant/water transitions. Counts alone do not reconstruct these decisions. |

24,342 of 37,664 state samples (64.6%) have unsupported active UI. This includes 28 callback owners, not 28 separate actionable defects: inspected owners also include Poké Ball wipes and black loading/animation frames. Classify verified transitions as unavailable/not-ready; retain diagnostics for genuinely unsupported actionable owners. Do not suppress errors by calling every unknown screen overworld.

Emerald temporarily decrypts Pokémon data in place, which could explain transient invalid species. No raw Pokémon bytes were archived in this run, so the cause remains unproven. The snapshot lock alone does not establish that a game-owned buffer is semantically ready.

## Milestones and activities

All true recorded story-completion flags have their native milestone markers. Gym complete and Stone Badge were recorded at seq 100001/100002; Rock Tomb at 100071. These game completions were recognized correctly.

Already fixed for subsequent recordings:

- Route101/102/103/104 label mismatch. This run’s four visits are recovered with saved state evidence 6075/17872/13345/27713, without changing raw events.
- Rustboro Gym and Route102/104 initial trainer victories, Roxanne victory, capture/evolution counters, completed Center heal witnesses, blackout callbacks, stable-identity level gains and save attempts. These fields were absent in this older running recorder and cannot be retroactively created as native evidence.

Additional observed events still outside the native recording/milestone contract:

- Woods and Route116 trainer victories. Screenshot candidates include Lyle 35963, James 47001, Joey 83887, Karen 85712, Johnson 88181, Devan 89015 and Jose 95025. Add verified initial trainer flags; screenshots alone do not become native flags.
- First visits to Route115 (82360), Route116 (83029) and Rusturf Tunnel (89725). Stable RAM proves these visits. Optional navigation splits should remain distinct from required first-Gym progress.
- Berry harvest and same-variety replant. Verified Oran harvest 22972→plant 23136, Pecha 23233→23363; later Oran 30443→30592 and Pecha 30667→30798. These screenshots contain completed messages, not only prompts. Further verified pairs: Cheri 49833→50020, Oran 50078→50240, Leppa 61713→61894, Cheri 61960→62125. All eight pairs show two harvested and one of the same variety planted; this is a screenshot-supported count, not a native event total.
- Learned moves: Torchic Focus Energy/Ember, Marill Tail Whip/Water Gun/Rollout, Shroomish Stun Spore are visible. Learning a move and executing it are different events; useful move availability is a meaningful training-readiness signal.
- Captures after the party filled, including Silcoon49143, Taillow78863 and Whismur90687 (screenshot evidence). A new capture counter records totals but still does not preserve caught species or box destination.
- Optional item pickups/rewards and inventory changes. Eight pickups were visually verified: two Potions, two Super Potions, two Poké Balls, X Defend and X Special; Potion pickup 24473 is one example. Source flags exist for rewards such as Wailmer Pail/Bullet Seed/Miracle Seed, but visiting the relevant building does not prove receipt.

Berry source authority: `GAME_STAT_PLANTED_BERRIES=3`; SaveBlock1.berryTrees offset `0x169C`, 128 trees. A harvest commits only after successful inventory addition and tree removal. Same-variety replant requires tree identity/type/stage transitions plus harvest evidence; inventory deltas alone are ambiguous. These fields are not yet implemented.

No evolution was established: the Cascoon was caught at level 5. Acquiring an evolved species must not trigger an evolution milestone.

## Strategy interpretation and remaining interview

The operator prioritizes damage or reducing the opponent’s ability to act. Stun Spore is part of that offensive/disruptive strategy; avoidance of Growl/Howl is personal preference, not evidence all non-damaging moves are useless. He replenishes berries by replanting the same variety after harvesting. These amendments should remain attributed self-report, with screenshots supporting the observed berry actions.

Two useful follow-ups concern decision boundaries: when a trainee is strong enough to stop switching out, and how he chooses between more training, an item, or healing when a fight is risky. Watering/revisiting berry patches is relevant for a long-run resource policy but low priority for first-Gym timing. Route/boss/type knowledge was known before this run; preserve that context when interpreting a model comparison.

Recommended implementation order: battle ownership/readiness plus valid Pokémon decoding; party/Bag/shop/summary owners; action-specific history; remaining optional milestone coverage. Qualify new fields with paired native probes and recorder/replay tests before another measured cohort. No patch benefit is claimed by this audit.
