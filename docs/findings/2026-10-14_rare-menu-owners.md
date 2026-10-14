# Additional Emerald menu owners

These readers use the clean source revision
`731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` and the US Emerald ROM with SHA1
`f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Each input selection is bound to its
callback, task or owner structure. Initialization and animation states retain
bounded owner facts and report input readiness separately. Invalid owner
pointers, impossible cursors, undrawn required windows and failed Pokémon
checksums are explicit harness bugs. No selection is invented from a screenshot
or a stale shared cursor.

The rare screens were **not reached in an ordinary native playthrough** from
our isolated pre-starter state. Source/ROM qualification and synthetic tests
below establish mappings, not rendered late-game/link proof. The separate
Pokémon decoding finding contains actual native encrypted/plaintext proof.

| Family | Exact callback / owner | Recorded input and contents |
|---|---|---|
| Mail | `08121C65`, pointer `0203A134` | Printed message lines, nine word codes, sender, mail type, CLOSE/exit state |
| Easy Chat | `0811A279`, task `0811A2FD`, pointers `0203A118/120` | Phrase codes/words, title, phrase/footer/group/alphabet/word selection, four confirmation states, completion, transition |
| Mystery Gift | `08018439`, task `080191F5` | Command state, task-owned list item/text, card/news viewing, YES/NO, link transitions |
| Pokéblock case | `0813591D`, pointer `0203AB50` | List/swap item, dynamic action labels from ROM, toss-result slot; shared callback reader owns toss YES/NO |
| Pokéblock feeding | `08179B69`, pointer `0203BD18` | Validated Pokémon identity/species, block slot/color/flavors/feel, nature, gain, animation timer; automatically advances |
| Contest appeals | `080D823D`, resource pointer `02039F34` | Four actual moves/options, move cursor, appeal/turn/contestant/applause, continuation versus animation |
| Contest results | `080F5C01`, pointer `0203A034`, continuation task `080F66B5` | Relative preliminary/round-two points and bar lengths, winner animation, explicit A continuation |
| Contest painting | `0812FDED/0812FDF9/0812FE0D`, winner pointer `030061C0`, hold state `030011F0` | Winner identity/species/nickname/trainer/category/rank, mosaic/fade, close readiness and load/closing transitions |
| Berry Blender | `08080019/080808D5/08081899/08081FC9/08082645/08082925`, pointer `020322A4` | Selected berries, players, arrow position/speed/RPM/game frames, results state, continuation and play-again choice |
| Berry Crush | `08020F89`, pointer `02022C90`, command table `082F43CC` | Actual command identity/state, participants, presses, message wait keys, result page/delay, gameplay and play-again choice |
| Dodrio picking | `080261CD`, pointer `02022C98` | Function/state, participants, berry results/eaten/streaks, delayed result continuation, custom play-again cursor |
| Pokémon Jump | `0802AC6D`, pointer `02022CFC` | Function/main/helper states, participants, score/streak, prize item/quantity, active jump/prize/play-again readiness |
| Link trade selection | `0807825D`, pointer `0203229C` | Both checksum-validated teams and identities, active slot/side, SUMMARY/TRADE, confirmations, waiting/message states |
| Trade animation | `0807B60D/0807EA11`, pointer `020322A0` | Both selected validated identities/species, animation state/timer/type/timeout/finish signals; final in-game A confirmation, automatic link playback |
| Minigame records | Overworld + tasks `08022251/0802E3E5` | Displayed Crush speed snapshot, Jump streak/score records, window-backed continuation and transition |
| Union Room interaction | Overworld callback + task `080156E1`, pointer `02022C30` | Room state/activity/response/received packet, interaction/registration/type/trading-board lists, confirmations |
| Union Room Chat | `0801DF39`, task `0801DF55`, pointer `02022C84` | Draft text and cursor, registered phrases, actual page/row/glyph, page labels, registration, quit/save confirmations and transitions |
| Factory rental | `0819A4C9`, pointer `0300127C` | Six validated candidate identities/species/levels, selected rental order, SUMMARY/RENT/DESELECT/OTHERS, custom YES/NO, message readiness |
| Factory swap | `0819C7E1`, pointer `03001284` | Both three-mon teams, player/opponent indices, exact side-owned action table, SUMMARY/SWAP/RECHOOSE, custom YES/NO and duplicate-species message |
| Pyramid Bag | `081C501D`, pointer `0203CF2C` | List/swap/action labels, toss item/quantity/available count, result/error continuation; shared callback reader owns toss YES/NO |

## Primary-source qualification

Readable layout and input handlers are in the pinned source files with the same
family names. Historical primary-source assembly provides exact address labels:

- General assembly reference `6f0e42a91aeeedd64725ce57e3dad6a38421d8e9`: `mail.s`,
  `easy_chat.s`, `contest.s`, `berry_blender.s`, `trade.s`,
  `contest_link_80F57C4.s`, `contest_painting.s`, combined `rom_8184DA4.s` (Factory), combined
  `rom_81BAD84.s` (Pyramid Bag) and `rom_81795E8.s` (feeding).
- `456cc3a6f02b6f45753b47e5ea37bd92e616f089`: `berry_crush.s`,
  `dodrio_berry_picking.s`, `pokemon_jump.s`, `union_room.s` and the matching
  old `union_room.c`.
- `b4d10ab7aba76bf9ab16f07cc9409083388c603d`: full `pokeblock.s`;
  semantic old C at `5b409d49edfa1102fdbf7a9d860aec387d7a523a`.
- `f34cda3b5209735fbf276b0f23e29549b1a1a3d9`: `mystery_gift.s`.
- Trade animation numeric cases and readable struct offsets were cross-checked
  against primary historical `trade.c` at
  `681d9298920e9ed7da08a3802568f694d9295237` and the general `trade.s`;
  exact in-game callback `0807B60C` calls the animation dispatcher, and
  state 71 is the sole in-game A continuation.
- `af1baa89f1c7f657eb096df5bf2677527301b5c4`: `union_room_chat.c` and remaining
  `union_room_chat.s`; `0801DF54` binds the function dispatcher to `02022C84`,
  and `0801EC94` binds page/row/column to ROM keyboard table `082F2BA8`.
  `080203B0` loads actual page-label table `082F2DC8`, rather than assumed labels.

The source cache lives outside the checkout in `/tmp/pokebench-extra-menu-map`.
The running ROM was read without copying it into the repository. Literal pools,
struct offsets and callback identities were checked against that exact ROM;
all 30 Union Room keyboard rows contain five valid decoded glyphs, including
source-named multibyte emoji. Pokémon species/move/item labels use the same
qualified ROM tables as the checksum decoder.

Focused synthetic tests cover selection changes, dynamically changed actions,
custom versus shared confirmation cursors, input transitions, delay gates,
wrong/duplicate owners, stale/undrawn list or window data, invalid phase holes,
invalid counts/cursors, actual ROM label lookup, and checksum-invalid teams.
Current focused suite: 58 tests pass; decoder + rare menus: 127 pass. The combined
GameState run currently has one unrelated expected-running-state fixture mismatch
after the root running-permission integration (180 other cases pass).

## Remaining native and subsidiary breadth

The scope is every Emerald menu. This finding does not close that scope merely
because the family callback is recognized. Native ordinary-input proof for
these late/link screens remains outstanding. Jump/Crush record-only field tasks and trade-animation callbacks are separately
bound; link recovery initialization and passive transition callbacks still need
rendered native proof. Other Frontier facility subsidiary interfaces still need their own
owner inventory. Contest painting loading/view/closing owners are now bound. The main menu coverage finding and root worklog track the
other agents' screens (wireless lobbies, Game Corner, PC, navigation, tutors,
marking and core party/Bag/summary). Unknown owners remain recorded defects.
