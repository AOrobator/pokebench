# Menu owner coverage

Reference source: clean `pret/pokeemerald` revision
`731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. Running US ROM SHA1
`f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

This is an owner inventory, not a claim that every Emerald menu is decoded.
Unmapped phases are harness coverage defects. They retain callback2, all active
task IDs/functions and bounded task data; they never emit a guessed selection.
Selections below require exact owners; menu phases sharing one callback cannot
silently borrow a stale generic cursor.

| Family | Game-owned state | Implemented owner/readout | Remaining proof or repair |
|---|---|---|---|
| Intro/main menu | `main_menu.c`, Birch task phases | Main task variant/options/cursor plus save/battery printer readiness and exact warning text; existing gender/name/clock readers | Native NEW GAME→OPTION→Options→B-return; existing Birch/gender/name/clock proof |
| Naming | `naming_screen.c` editor buffer/sprite cursor | Template-qualified editor, page/key/buffer/readiness; player/box/caught_mon/nickname/walda ownership | Native player proof existing; native nickname template3 proof round1 |
| Starter | `starter_choose.c` task `data[0]` and confirmation menu | Exact0x081341E1 task owner; species, YES/NO and transitions | Native Torchic/Mudkip cursor, confirm NO, decline and transitions round1 |
| Start | `start_menu.c` `gMenuCallback`, action list/cursor | Live Task_ShowStartMenu state1 plus HandleStartMenuInput; dynamic actions | Native Start/Party/Bag/Options/Card ordinary inputs rounds1–4; stale callback lifetime regression fixed |
| Party | `party_menu.c` gPartyMenu and sPartyMenuInternal | Chosen slot, switch target, action labels including fourteen field moves | Native Party/Summary/Item/Cancel; Native Potion animation/message/close fixed; held-item/mail/learning YES/NO owners covered by fixtures; subsidiary transition inventory continues |
| Bag | `item_menu.c` gBagPosition and task-owned list | Pocket/list actual item ID, context action array including single choice, toss/sell/deposit quantities, swap target and pocket transition | Native empty Bag/pocket changes; nonempty item/context/transaction fixtures; subsidiary direct message/acknowledgment and automatic item-use owners covered by fixtures |
| Shop | `shop.c` task list, tItemCount/tItemId | Buy/sell/quit; buy item list and quantity; shared purchase confirmation/message | Source/ROM fixtures; native shop not yet qualified |
| Summary/moves | `pokemon_summary_screen.c` sMonSummaryScreen | All move IDs/names/PP, page, reorder/forget, HM rejection and sliding-window readiness | Native page/selection/reorder/cancel rounds1–2; native forget/HM rejection pending |
| Options | `option_menu.c` Task_OptionMenuProcessInput task data | Selected setting plus current editable speed/scene/style/sound/buttons/frame values | Native speed change, row change and B exit round2 |
| Pokédex | `pokedex.c`, `pokedex_area_screen.c`, `pokedex_cry_screen.c` | List/actions/search/filter options/parameter cursors/info/cry/size/caught entry exact owners | Source/ROM fixtures; native unlocked Pokédex/area proof pending; area subsidiary source owner and contents now covered |
| Pokémon PC/storage | `pokemon_storage_system.c` | menu_pc: box/party selection, item cursor, action/release/exit/marking popup | PC agent native item/storage evidence and remaining storage subsidiary owners tracked separately |
| Player PC | `player_pc.c` | menu_pc: item storage/mailbox/list/quantity/message, dynamic field and grid choices | PC agent native PC item menu/list/quantity proof; mail/decor branches separately owned |
| Field script choices | `script_menu.c` | menu_pc: exact script multichoice/grid/dynamic list options and cursor | PC agent native top menu and source/ROM dynamic fixtures; inspect special script content individually |
| Save / Pyramid retire | `start_menu.c` exact save callback table | Confirmation/overwrite, writing/result/error, printer/sound readiness; Pyramid retire YES/NO | Native fresh-core save and CONTINUE proof; overwrite/error/retire source fixtures |
| Trainer card | `trainer_card.c` | Front/back input state, cached name/ID/time/money/caught/battle/trade/BP data | Native front/back/cancel rounds3–4 including exact model readout details |
| Town map/Fly | `region_map.c` | Region section/name/cursor/zoom and input handler; Fly target and fly eligibility | Source/ROM fixtures; native unlocked map/Fly proof pending |
| PokéNav | `pokenav*.c` modules | Main/condition/map/mon lists/graph/markings, Match Call actual trainer name/options/check/call, ribbon grid and expanded owner | Source/ROM fixtures; native unlocked Nav proof pending; Match Call check-page flavor text now decoded |
| Berry tag | `berry_tag_screen.c` | Selected berry ID/name, exact task readiness/change/exit | Source/ROM fixtures; native berry tag pending |
| Berry planting/harvest | `berry.c`, field scripts | Generic dialog/menu only | Script multichoice owner/berry selection; root action history records authoritative tree changes |
| Pokéblock case/feeder | `pokeblock.c`, `pokeblock_feed.c` | menus_extra: case/feed/block and party contexts; shared toss callback context | Rare-menu agent source/ROM qualification; native ordinary later-game proof pending |
| Mail | `mail.c`, `mail_data.c`, `easy_chat.c` | menus_extra: reading and Easy Chat category/word/editor owners | Rare-menu source/ROM fixtures; native late menu proof pending |
| Contest | `contest.c`, `contest_util.c` | menus_extra: exact appeal move and turn/results state | Rare-menu agent maintains remaining registration/results qualification; native late-game proof pending |
| Berry blender/crush | `berry_blender.c`, `berry_crush.c` | menus_extra: blender and Crush communication/input owners | Rare-menu source/ROM qualification; native late-game proof pending |
| Link/trade/Union Room | `link*.c`, `trade.c`, `union_room*.c` | menus_extra: trade/Union Room/chat; menu_wireless: leader/group actual player list, selection and confirmation | Source/ROM fixtures; linked native qualification needs ordinary partner setup |
| Mystery Gift | `mystery_gift*.c` | menus_extra: card/news list and task phases, ROM ListMenu items supported | Source/ROM fixtures; native linked proof pending |
| Battle Frontier/Pyramid | `battle_*`, `frontier_*`, party/item menus | menus_extra: Factory selection/swaps and Pyramid bag; shared Pyramid toss context | Rare-menu agent qualification; other facility-specific owner inventory remains open |
| Minigames | `slot_machine.c`, `roulette.c`, `dodrio_berry_picking.c`, `pokemon_jump.c` | menu_corner: slot bet/reel/help/quit/message; roulette grid availability/wager/continue; extras Jump/Dodrio | Exact ROM function tables/fixtures; native late-game proof pending |
| Move tutor/relearner/deleter | `field_specials.c`, `party_menu.c`, summary readers | Move Relearner exact heap/move list/yes-no/learned message; Deleter uses ordinary source SELECT_MOVE summary and field choices | Source/ROM fixtures; native tutor/deleter/relearner later-game proof pending |
| Battle commands | Battle controllers/script owner | battle_state continuous controllers; ActiveUi battle input or handoff, external menus preserved | Separate battle native/readout/journal receipts under root |

## Exact ROM evidence

Historical primary-source assembly is useful because it contains US-ROM function
addresses and literal names while current C defines the readable layout:
[starter source](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/starter_choose.c),
[start assembly](https://github.com/pret/pokeemerald/blob/5dde701c819ca19f00bc77f7979fa287da0d7c0b/asm/start_menu.s),
[party assembly](https://github.com/pret/pokeemerald/blob/16c05694fb02eb979f62a0de2f728772f715c883/asm/party_menu.s),
[Bag assembly](https://github.com/pret/pokeemerald/blob/16c05694fb02eb979f62a0de2f728772f715c883/asm/item_menu.s),
[summary assembly](https://github.com/pret/pokeemerald/blob/16c05694fb02eb979f62a0de2f728772f715c883/asm/pokemon_summary_screen.s),
[Options assembly](https://github.com/pret/pokeemerald/blob/6f0e42a91aeeedd64725ce57e3dad6a38421d8e9/asm/option_menu.s),
[shop assembly](https://github.com/pret/pokeemerald/blob/6f0e42a91aeeedd64725ce57e3dad6a38421d8e9/asm/shop.s).

Literal-pool ROM inspection confirmed Start cursor 0x0203760E, action list
0x02037610, `gMenuCallback` 0x03005DF4; Party menu 0x0203CEC8,
internal pointer 0x0203CEC4; Bag position 0x0203CE58; palette fade
0x02037FD4. List selection validates exact ListMenuDummyTask 0x081AE459,
active task lifetime, list length/scroll/row and drawn window before following
its bounded text pointer. Summary pointer 0x0203CF1C and offsets 0x40BC mode,
0x40BE party index, 0x40C0 page, 0x40C4 new move, 0x40C6/7 move cursors
match source/assembly; cached move IDs/PP live at +0x84/+0x8C.

New implementation has synthetic tests for owner validation, changed selection,
confirmation/cancel, transition, dynamic Start actions, party switch target,
Bag/shop list and quantities, summary select/reorder/forget, and editable
Options values. Synthetic fixtures are not native rendered-frame proof.

Naming template ownership is read from +0x1E2C, destination pointer +0x1E30,
species +0x1E34 and personality +0x1E38, confirmed by DoNamingScreen
0x080E2D79 ROM instructions. Ready and transitioning naming states retain the
owner rather than treating Pokémon/box naming as the player intro. Bag pocket
items use verified gBagPockets 0x02039DD8 (pointer/capacity records, eight bytes),
item IDs stay distinct from list row IDs. Shop item IDs use sMartInfo
0x02039F60 +8 item list pointer/+12 count.

## Additional identified families

Decorations/secret-base PC, placement/put-away/toss, Hall of Fame record/mon
review are owned by root `menus_misc.py`. Pokémon markings is shared
`menu_markings.py`, gated by exact PC or PokéNav parent input owners.
Safari/Pal Park retirement, Trainer Hill and replay-specific prompts need
explicit field-owner confirmation; they are not counted as complete merely
because a generic cursor can be read. The matrix is a maintained inventory,
not an exhaustive-completion receipt.

## Native probe receipt

Separate fresh mGBA cores loaded immutable owned intro states and continued by
ordinary button input. No RAM writes, save editing, cohort controls or measured
human run controls were used. Artifacts are `runs/menu-owner-proof/round1-proof.json`
and `round2`/`round3`/`round4` `proof.json`, each with paired screenshots, typed
snapshots and exact model readouts. Round4 trainer-card front/back confirms
`ActiveUi.details` reaches the actionable `Menu state` text, while callback/task
pointers are omitted from model text. Earlier one-frame starter cursor captures
can precede rendered pixel refresh; stable `no_native` is the confirmation proof.
Late-game readers currently have source/ROM-qualified fixtures, not native
rendered proof. Tests do not substitute for that distinction.

## Expanded exact ROM evidence

Pokédex view pointer0x02039B4C; TrainerCard pointer0x02039CE8;
BerryTag0x0203BCF4; region map/fly pointers0x0203BCD0/0x0203A148;
PokéNav resources0x0203CF40 and callback table0x0861F3EC;
Move Relearner0x0203BC34; markings0x0203A124.
PokéNav Match Call resolves actual header table0x086252A8 and rematch
0x085500A4 (16-byte records), gTrainers0x08310030 (40-byte records),
class names0x0830FCD4 (13-byte entries), rather than inventing trainer labels.
Summary HM rejection input0x081C1941 waits for sliding task0x081C1E21.
Shared task0x08121FDD uses exact function pair0x0203A138, preserving purchase,
Bag toss/sell, Pokéblock index and Pyramid toss context.

Game Corner callback0x0812A671 owns SlotMachine pointer0x0203AB34,
task0x0812AAC9 and state table0x085A7450 (29 entries). Help task0x0812DCD5
uses native fifteen-entry table0x085A75D4; only state6 accepts B/SELECT.
Roulette callback0x08140239 pointer0x0203AB88 identifies playTaskId+0xA4,
input task0x08141041 and task data4 selection/data13 coins. GridSelection
ROM0x085B6154 records are twenty bytes; availability is game hitFlags against
record+8 flag, not guessed from colors. Continue task0x08141EF9 owns delay,
key mask and continuation at heap+0xA8/+0xAA/+0xAC.

Wireless lobby tasks0x08012781/0x080134E9 share sWirelessLinkMain0x02022C30,
which must equal that active gTasks record's data address. The native lobby
state is an IWRAM task overlay, not an EWRAM heap. Player records are thirty-two
bytes, native list length/cursor come from exact ListMenu task; names, trainer
IDs, activity/started/spawn flags are read for every displayed record.
RfuGetStatus0x08011A75 loads0x03005000+0xF1. Leader state6 waits for players;
its states11/16/20 and join state8 own confirmation, textState1 is input.
Historical [wireless source](https://github.com/pret/pokeemerald/blob/456cc3a6f02b6f45753b47e5ea37bd92e616f089/src/union_room.c),
[slots assembly](https://github.com/pret/pokeemerald/blob/6f0e42a91aeeedd64725ce57e3dad6a38421d8e9/asm/slot_machine.s),
[roulette assembly](https://github.com/pret/pokeemerald/blob/6f0e42a91aeeedd64725ce57e3dad6a38421d8e9/asm/roulette.s)
provide primary fixed-address qualification; current pinned C supplies semantic
layout and state names. Actual ROM literal tables were also inspected.

Ribbon titles/descriptions resolve actual normal ROM table0x086239AC; gift slots resolve SaveBlock1+0x31A8 values before indexing gift table0x08623DF8 (64 values). Visible Match Call entries expose actual trainer names, not raw byte rows.

Native item proof `runs/battle-item-proof-r6/proof.json` contains615 ordinary
frames with zero harness_bug/journalerror: Potion target HP18→20, Bag count1→0,
item13 selection receipt and actual “HP was restored by2 point(s)” printer text.
Passive Party owners0x081B1E61/0x081B672D/0x081B6795/0x081B12F9 are animation,
message construction/automatic-close/close handoff, not player-input phases;
background printer0x081B1B8D validates drawn window6 and actual gStringVar4.
Eleven other exact Party YES/NO handler owners now cover cancel choice,
participation, held-item switch/toss, mail/send/loss, spin trade, field exit,
replace/stop-learning and Bag item switch. Future native proof remains separate.

Main menu exact callback0x0802F6B1 tasks0x0803024D(input)/0x080300B1(highlight)
use data0 variant,data1 cursor,data12 count,data14 scrolling,data15 adapter.
Options are game-owned variants2/3/4/5 rows. Exact warning text pointers come
from source/ROM SaveFileStatus0x03006210 values2/255/4 and battery warning
0x085E8453. Printer readiness uses exact active byte020201B0+window*0x24+0x1B,
qualified by actual ROM IsTextPrinterActive08004800. Fresh-core ordinary-button
native proof is `runs/menu-owner-proof/main-proof/proof.json` and
`main-option-proof/proof.json`, paired screenshots/readout/typed states,
with no external core access or save modification.


## Main-header, save and supplemental owner closure

Fresh ordinary-button proof `runs/menu-owner-proof/save-continue-proof/proof.json`
records SAVE confirmation, writing and completion, then a normal game soft reset
and CONTINUE. The inspected `main_continue.png` shows player AAAAAAA, 0 badges,
0:16; the paired typed/readout state records the exact saved name/gender/map,
badges, playtime and Pokédex count/visibility without inventing live field
coordinates while `started=False`. ROM map-group/header/region-name tables and
Hoenn-national-number table are qualified; inconsistent Pokédex bit copies are
explicit bugs. Standalone script-save and Start Save/Pyramid retire callbacks
share the source-qualified `menu_save.py` reader (24 focused fixtures).

Battle entry handoffs CB2_GiveStarter0x080B1159,
CB2_StartFirstBattle0x080B11A9 and CB2_InitBattle0x08036761 are automatic,
input-inactive source owners. Historical `battle_setup-full.s` lines1341–1404
and `battle_2-full.s` lines9–64 qualify them. Root's integrated fresh starter →
battle proof now traverses824frames/51actions with no harness diagnostics.

| Supplemental family | Implemented source owner and contents | Qualification limit |
|---|---|---|
| Diploma | `menu_aux.py`: exact init/MainCB2/task fade/input/exit; actual expanded certificate and dex type | 3 task phases and undrawn input fixtures; late native proof pending |
| Clear save | Exact setup/main/return; live YES/NO cursor and static ROM prompt; automatic erase phase | Source fixtures only; actual deletion never invoked by probes |
| Reset RTC | Exact task root/editor/prompt; selected Days/Hours/Minutes/Seconds/Confirm and current editable values | Bounds/window/input/transition fixtures; native debug-reset entry pending |
| Cable Club link-up | `menu_cable.py`: 12 exact task phases, actual player count/connection status, readiness/cancel/start controls and expanded message | 15 source/ROM fixtures; linked partner native proof pending |
| E-Reader | `menu_ereader.py`: exact Task0x081D5085 under Mystery Gift callback; all27 enum phases, receive substates, transfer status/timer, actual message and cancel/continue/fanfare readiness | 31 source fixtures; linked eReader native proof pending; unused states remain explicit defects |
| Field custom scroll lists | `menu_field_widgets.py`: glass/Fan Club/Frontier vendors/move tutors/Tidal/Tent rules; live ListMenu selection and complete options verified against exact ROM family table | Source fixtures; ordinary late native proof pending |
| Field Pokémon pictures | Exact `script_menu.c` picture task0x080E2899; actual species/window/sprite/phase; picture task does not invent button ownership | Source fixtures; dialogue/script continuation remains separately observed |
| Link Battle records | Exact script PC0x0827736F, source wait controller, drawn records window, five native names/IDs/WLD rows and decrypted total WLD | Source/ROM fixtures; linked record native proof pending |
| Trainer Hill records | Exact setup/main and fade/input/exit tasks; all4 timer values and displayed times | Source fixtures; later native proof pending |

Root-owned legacy MysteryEvent/save-failed readers are integrated. Berry Fix
maintenance is still root-owned inventory work; any additional identified source
owner must be qualified before exhaustive coverage is claimed.
This inventory does not treat diagnostic-only owner labels as complete decoding.
The full US/Japanese charmap now comes from `native_text.py`; unknown glyphs,
truncated controls and unexpanded placeholders fail explicitly rather than
silently produce question marks or guessed labels.

The final identified subsidiaries now have concrete readers: Pokédex area task
0x0813D42D/0x0813D5A1 overrides the parent detail task, reads the source heap
0x0203AB7C and records selected species, all overworld/special section IDs and
region names, unknown-area visibility, and only native input state1 B/right
controls. New `menu_item_use.py` differentiates A-only error acknowledgment,
A/B TM/HM/stat/toss/sell/deposit messages, inactive versus active source printers,
and automatic Repel/flute/stat timers or item-close transitions. TM/HM shared
YES/NO pair0x080FE03D/0x081ABBBD matches ROM table0x085920E8. Expanded messages
are copied by source DisplayMessageAndContinueTask into gStringVar4, avoiding
stale direct-ROM message inference. Reserved/uncertain Pokémon species labels
and invalid language metadata in Link records are explicit defects.

PokéNav check-page content is now decoded: the four strategy/Pokémon/self-intro
fields resolve actual ROM table0x08622028 or0x08625388 overrides. Steven's second
entry requires its actual native flag1270; no milestone inference selects it.
ROM inspection confirms ordinary flavor strings are at most28 bytes. Original
`check_page_header` was corrected to `list_build_header` because it is builder
scratch state, not the check-page-selected trainer. Two content/flag tests prove
these semantics, bringing the Nav suite to57 tests.

Additional source sweep owners live in separately qualified team modules:
`menu_legacy.py` save-failed/legacy MysteryEvent, `menu_apprentice.py` mandatory
Apprentice answers (B ignored), `menu_field_people.py` Daycare/Trader/Storyteller/
field Match Call/SS Tidal porthole, and `menu_pokemon_lifecycle.py` evolution,
hatching and feeding. Their tests/provenance/native limits remain separate from
this lane's proofs. Source truck entry is automatic, and the porthole's A-only
exit is separate from generic ScriptMenu Pokémon pictures; no fossil ownership
is falsely inferred from those unrelated tasks.

## Title launch and maintenance shortcuts

`menu_title.py` qualifies actual title task ownership: logo0x080AAB45 and
banner0x080AAC51 accept A/B/START/SELECT to skip; launch0x080AAD65 accepts
A/START for main menu, held UP+B+SELECT for clear save, held LEFT+B+SELECT for
RTC only when native flag0x8C2 and var0x402C==0x920, or B+SELECT for Berry Fix.
The source branch priority is preserved. Native disabled RTC is reported false,
not assumed enabled. The intro-to-title fade0x0816CC55 and title/main/maintenance
fade callbacks are automatic nonready handoffs even while old tasks remain.

Paired fresh-core ordinary-button proofs:
`runs/menu-owner-proof/title-main-proof/proof.json` captures actual logo/banner
skip and launch→main; `title-clear-proof-r2/proof.json` captures title launch,
UP+B+SELECT, actual default-NO clear-save prompt and B cancellation back to intro;
`title-berry-proof/proof.json` captures B+SELECT→Berry Fix intro, A→connection
instructions and stops before initiating hardware transfer. Inspected PNGs match
NO cursor/prompt and native Berry Fix connection instructions. All final proofs
have zero active-UI diagnostics; the earlier `title-clear-proof` exposed the
intro fade gap, which r2 repairs and replaces as the qualifying receipt.

RTC enabled shortcut is source/ROM fixture qualified, not native entered: these
owned fresh saves have the game's RTC-enable flag disabled, and qualification
uses no RAM/save writes to manufacture it. Main and automatic transition fixtures
retain this limitation explicitly. A running-proof wild encounter additionally
qualifies callback0x08085E51 only with exact Task_BattleStart0x080B05F1 state0/1;
source `battle_setup.c` starts/polls the transition and hands off to battle init.
Frozen owned gate after title closure:553 tests, Ruff clean and strict mypy clean.

## Source-qualified startup before callbacks exist

Zero callbacks/Save pointers/tasks alone remain an unsupported state. The new
`boot.py` instead requires the separate `SnapshotMemoryReader.native_boot_cpu_context`
capability plus exact US-ROM entry/crt0/AgbMain instruction signatures. Initial
reset requires the exact fresh native PC4/LR0/SP03007F00/CPSR1F and zero general
registers. Later startup owners require a finite qualified PC/LR pair plus the
actual AgbMain startup callee return at03007E24 and crt0 return08000234 at03007E3C.
These source startup call sites are m4aSoundInit(return080003D3),
InitRFU(return080003DB) and CheckForFlashMemory(return080003E3); BIOS IRQ frames
have distinct banked SP03007FA0/mode12 checks. ROM AgbMain at080003A4 matches
`main.c`, historical `main-full.s`, and source `crt0.s` initial stack/call setup.

This is deliberately finite qualification of observed frame-boundary execution,
not a broad PC range or a generic exemption for empty RAM. Wrong PC/mode/stack,
corrupt signatures, live save pointers/task bytes or unavailable CPU context do
not qualify. The existing Pokémon crypto IRQ guard remains unchanged. Both
Screen and ActiveUi become nonready boot only with this positive owner evidence.
Native `runs/menu-owner-proof/boot-proof/trace.json` records frames0–19 with CPU,
call stack, callback/save/task bytes and paired PNG/typed/readout; frames0–12 are
boot with no diagnostic and frame13 moves to the normal intro owner.

Additional routing/content tests use native owner fixtures through the public
screen/UI dispatcher and JSON/model readout for22 separate interfaces, preventing
specific owners being masked by generic menus. Match Call tests cover all six
actual special-header formats, malformed header/trainer/class owners and gift
ribbon SaveBlock/ROM resolution, including the two native gift-value bounds.
