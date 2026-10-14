# Confirmed battle choices

Reference: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, clean. ROM US SHA1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7` (resolver checks identity).

`src/battle_main.c:HandleTurnActionSelectionState` distinguishes action/menu selection, canceled moves, invalid moves, double-battle partner cancellation and all-battler confirmation. States0–8 are the private enum at4118. The selection routine assigns moves/targets at4398–4401, but a partner can still cancel a double-battle choice. Only the transition to `SetActionsAndBattlersTurnOrder` after all communications equal5 commits a complete turn. A commit is not attack execution, a hit, or damage.

Read-only Thumb disassembly matches that source:

- Selector `0x0803BE75`: entry resets communication+4; dispatch indexes communication by active battler; jump table covers0–8.
- `0x0803C942–980`: chosen slot at battle struct+0x80, battler size0x58, moves+0x0C; stores chosen move and target+0x0C. Literals0x0803C98C/990/994 prove struct pointer `0x0202449C`, chosen moves `0x02024274`, mons `0x02024084`.
- `0x0803CD1E–32`: confirmed count equals battler count then stores literal `0x0803D2E9` at `gBattleMainFunc=0x03005D04` (literalsCDA4/CDA8). Communication owner `0x02024332`, active battler `0x02024064`, count `0x0202406C`, chosen actions `0x0202421C` are matched literal operands. Party indexes/count/positions share the source layout: party indexes `0x0202406E` (u16×4), positions `0x02024076` (u8×4), before mons0x84.
- Turn cleanup `0x0803BA98–A6` increments battleResults+0x13 unless >0xFE; literal0x0803BB2C proves `gBattleResults=0x03005D10`. Displayed battle turn is that count+1; saturation at255 remains game behavior.
- BufferB `0x02023864` is matched literal at0x0803C8C0 and action handling multiplies battler by0x200. Items come from the accepted per-battler BufferB+1 u16; switches from struct+0x5C. Initial moves use the BattlePokemon plaintext layout (species, moves, PP, HP, level, maxHP, personality, OTid), not party-slot inference.
- ROM text `POUND` at0x08319789 matches move1 and the source13-byte rows, establishing names base `0x0831977C`; existing verified species names base0x083185C8/11-byte rows.

The owned class wrapper runs immediately after `EmeraldEmulator.run_frame_with_buttons`, inside the vendor's existing `step_environment` memory lock. It sees every completed stepped frame for human and agent input. Provisional phase3→4 selections are retained only until turn commitment, and discarded on cancel/reselection. Forced turns without a qualified selection retain automatic origin and unavailable move/target, rather than using stale chosen-move values. Wally tutorial and in-game partner choices are labeled scripted. Only player-side positions are recorded; opponent private choices do not enter model context.

The bounded journal holds4096 choice records and only prunes when a later request acknowledges a durably written ID. Gaps, invalid memory, overflow, missing transport and incompatible reader fail explicitly. Both samplers drain the same journal into `battle_choice` events, retaining commit time, exact stepped frame, battle index, game turn, actor/target identity, species/level/HP, selected move/slot/PP and confirmation-source facts. The model observation/prompt is unchanged. `battle-choices-v1` declares the new measurement; old logs remain unchanged and cannot acquire retrospective move records.

Replay folds choices into persistent event history, raw inspection and existing presses lanes in both regular and human timelines. No new lanes or viewer shortcuts. The native commit timestamp positions the mark; event write timestamp records when the recorder drained it. Execution, miss/failure, damage and affected targets for spread moves are not inferred from these records.

## Native direct-core qualification

Own probe `/tmp/pokebench-battle-native/native-qualification.json` loads immutable pre-clock reader-restart.state (SHA1 retained), then advances only ordinary buttons on its own native core. It reaches the first Route101 battle with Mudkip Lv5 versus Zigzagoon Lv2. Opening the move menu atstep277 and canceling at279 leaves journalempty. Step283 screenshot shows Growl selected,40PP; step284 commits id1 atframe29600/turn1 with actorHP20/20,targetHP13/13. Step285 repeated observation retains exactlyonechoice. Reconfirming Growl atstep292 commits distinct id2 atframe30356/turn2,39PP,actorHP17/20. Both entries carry native main_func0x0803D2E9, communication[5,5], battle_type20 and pass the production TypeBox batch schema. Paired PNG hashes and setup/source/ROM identities are retained in the receipt. This qualifies native reader/commit semantics; shared human/agent recorder and replay propagation are separately verified by tests. It does not claim a full native HTTP/controller recording or attack outcome decoding.

Integration audit corrected BufferB: exact US ROM literal at0x0803C8C0 is0x02023864, corroborated BufferA0x02023064 plus0x800. Earlier move-only native proof did not qualify item IDs; independent item qualification required.
