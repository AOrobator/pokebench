# Decorations, Secret Base registry and Hall of Fame

Implementation: `menus_misc.py`, integrated before the generic shared message
and YES/NO readers. Source is clean `pret/pokeemerald`
`731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`; exact US Emerald ROM SHA1 is
`f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Historical primary assembly reference
`16c05694fb02eb979f62a0de2f728772f715c883` contains all 135 decoration functions,
45 Hall of Fame functions and 99 Secret Base functions in the corresponding
source definition order. Input functions and critical literals were separately
inspected against the running ROM; ordinal alignment alone is not native proof.

| Interface | Owner | Recorded content and selection |
|---|---|---|
| Decoration actions | Task `08126B81` | Four actual ROM action labels/table `085A6B48`, generic cursor, room context |
| Categories | Task `08127089` | Eight actual category labels/table `085A6B28` plus CANCEL, selected category and category counts |
| Inventory | Task `0812764D`, list task ID in `data[13]` | Actual printed list label/item/index; inventory row maps to a decoration ID/name/description |
| Place / put away | Task `08128E19` | World/map coordinates (map offset 7), width/height, command and queued button, actual camera sprite interpolation and readiness |
| Decoration messages | Shared task `08121F3D` plus exact continuation | Actual message; printer lifetime; A/B continuation versus automatic return |
| Decoration confirmations | Shared task `08121FDD` plus exact pair | Place/cancel/toss/put-away/stop contexts, selected YES/NO and decoration/location |
| Secret Base registry | Tasks `080E9C9D`, `080E9E91`, `080E9FB1` | Registered-base list/text/base ID, row/scroll, actual DEL REGIST/CANCEL action labels |
| Registry deletion | Shared pair `(080EA121,080EA13D)` | Selected base ID and YES/NO; main Secret Base PC menus use the qualified field multichoice reader |
| Hall of Fame ceremony | Callbacks `08173695/081736D9/08173561`, finite task set | Recorded team species/levels/nicknames/stable identities; animation/save/exit owner; final A continuation |
| Hall of Fame PC | Initial callback `08174195`, input task `08174729` | Team/page/Pokémon cursor and count, team records, chosen Pokémon; A earlier team/B exit |
| Hall of Fame corruption | Task `08174A09` | Game-owned corrupted-save screen and A exit; this state is distinct from a decoder failure |

Critical ROM/source bindings:

- `08127770` multiplies decoration ID by 32, adds 24 and loads description
  through table literal `085A5C08` at `081277A0`. ID byte/name16/descriptionPtr
  match `struct Decoration`. All 120 real rows decode valid names/descriptions.
- `SetDecorationInventoriesPointers` at `081617F4` binds inventory records
  `0203BC40` (pointer/capacity, stride8) to SaveBlock1 offsets
  `2734/273E/2748/2752/2770/278E/2798/27C0` and capacities
  `10/10/10/30/30/10/40/10`.
- Placement task `08128E18` loads `gSprites=02020630` and camera index
  `0203AA38`, then checks sprite data[4] at stride68/+36. The reader records
  this actual interpolation phase and queued button separately.
- `IsTextPrinterActive` at `08004800` computes ID*36 and reads active at +1B
  from base `020201B0` (literal at `08004814`). Shared message task calls the
  continuation at `0300117C` after that printer is inactive. Verified waiting
  continuations are `08127A5D/08129021/08129D65`; other decoration returns
  automatically advance.
- HoF owner pointer `0203BCD8` indexes teams with stride120; each of six
  records has tid+0/personality+4, species nine bits and level seven bits in
  halfword+8, and ten-byte nickname+10. Source prints a terminator after the
  ten bytes; full-length names are therefore legal. Species412 is the game's
  EGG entry and must be decoded, not rejected as an unknown party species.

The exact-ROM fixture checks literals and all decoration rows and invokes the
reader with actual ROM labels. Synthetic tests cover changed actions/category
CANCEL, inventory row versus decoration ID, placement movement/queued input,
printer-before/after completion, registry base selection/actions, HoF team
stride/full-length names/egg data, invalid species/levels/cursors, duplicate
owners, corruption versus diagnostic, and unrelated-callback no-read bounds.
21 focused tests pass; misc + shared + existing UI: 102 tests pass. Lint and module type checks pass.

Qualification receipt: ignored artifact
`runs/menu-misc-owner-map/qualification.json` records source hashes, ROM hash,
function maps, literal values and bounded input-owner prologues. It explicitly
sets `native_rendered_proof=false` and has no game input actions. These late
screens were not reachable from our ordinary pre-Gym isolated probe. No saved
state, RAM or running measured core was modified to manufacture native coverage.

Known remaining bounds: native rendered interaction proof is outstanding.
Category disable colors derive from the recorded owned counts; placement
legality itself remains the game's own rejection/confirmation, rather than a
harness prediction. All qualified task transition owners retain their phase;
unknown owners stay coverage diagnostics rather than invented selections.
