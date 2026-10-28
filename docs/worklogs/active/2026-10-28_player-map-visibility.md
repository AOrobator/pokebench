# Player map visibility

Authorized 2026-10-28: “ok build the switch on in both arms”, following agreement that the harness must see terrain/people as the player does, including Dewford Gym and caves without Flash. Current recipe ON in both arms; registered default OFF preserves old runs/presets. No active-run changes, launches or historical metadata edits.

One milestone: implement, test and review `player-map-visibility-v1` across native observation, remembered terrain, navigation and the current feature recipe, with an operator explainer. No forced training, battle policy, new navigation solver or viewer timeline changes.

Contract: unseen tiles are unknown; previously visible terrain is remembered without fresh hidden updates; live people require current screen/light visibility; hidden templates, exits, reachability and scene-history descriptions cannot bypass the boundary. Navigation uses discovered tiles. Ordinary maps use the viewport; darkness uses the game's current illumination. Unsupported/transitioning visibility fails closed. Flash changes the lit region, not whole-map disclosure.

Source: separate clean pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, matching US ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. `field_screen_effect.c` sFlashLevelToRadius/SetFlashScanlineEffectWindowBoundaries; `overworld.c` SetFlashLevel; ObjectEvent/Sprite rendered OAM layouts. GraniteCave 1F requires_flash=false, B1F=true. Qwen88ea seq69727/69730: entry5,27, flash7, entire map and Brawly4,3 exposed; seq69759 targets that disclosed tile. Original evidence remains immutable.

- [ ] RED regression and production-path tests.
- [ ] GREEN switch, memory/projection and both-arm recipe wiring.
- [ ] Native archive replay paired with frames; exact OFF invariance; performed wiring mutation.
- [ ] Explainer/card routing and background browser proof.
- [ ] Full build/lint/coverage/vendor gates; principles and independent review.

Stop before a gameplay launch. Landing only under repository review/landing-board gates; disclose any unavailable proof rather than claiming live correction.

Implementation checkpoint: RED ffe70872d (new boundary tests fail before module exists). GREEN targeted: 26 visibility tests, 41 visibility/native-rerender tests with real ROM; 56 observation/view/rerender tests; 43 feature/prompt tests; 360 viewer panels/server/arm tests; 32 visibility/people/gym tests. Full TS lint, Python ruff and mypy pass at pre-sync checkpoint. New owner measured at 96% branch-inclusive coverage in targeted checks. Removing projection wiring from the production read_state seam makes the installed observation endpoint test RED; restored GREEN. Current recipe armPreset→parsePlayPreset proves both arms ON and control-base invariants valid.

Native proof: Qwen88ea raw30297 hash e665b51f99b7dd5d67d4779ef90cc2dd70bc26e38228b23d568ef4f79be3616f, paired frame069730_0; OFF readout bytes and state JSON exactly equal parent implementation; ON504→4 known tiles, Brawly template absent. Astra429f state23664/raw19321 hash43b07457f20af23d398d0718bc3d4f06df8d100a195fef03f75f64da71f61e80, frame023666_0, Granite CaveB1F without Flash832→5 known tiles. Both screenshots inspected. No gameplay or inference launched.

Visibility discretization: central8×8 tile patch must lie inside the game's midpoint-raster light window and viewport; actor bounding boxes must be entirely lit. OAM anchors are corrected for sprite x2/y2 bobbing. Unqualified layouts, movement/locks, fades, forced blank or black palettes withhold fresh terrain. Bright locked scenes retain visible actors; dark locked scenes with potentially animating light omit actor assertions. Pyramid's separate light radius remains explicitly unavailable. Terrain/warps remembered per verified map/layout/dimensions; hidden mutable tiles do not refresh. VBlank rewind drops future knowledge. Session memory is injected by installed observation and archive replay factories; raw decoding utilities remain available for offline truth auditing.

Provisional broad Python run failed214/4483: initial server-feature insertion shifted append-only pins; corrected to append. Native legacy fixtures also exposed projection at the wrong ownership boundary; corrected by injecting session memory at delivery factories, retaining unprojected raw utility reads (no broad fixture rewrites). One environment failure was missing local native mGBA binding; copied existing built binding into this worktree environment, preserving its package symlinks, verified import. Failed logs retained; not a passing gate. Coordinator requested no further full suites until CPU grant; first run finished. Full-suite window queued after urgent cap/type-gap/current-question-focus/YAML work; awaiting START. No inference or native gameplay lanes requested.

Browser proof: scratch-only synthetic replay prefix (clearly labeled, never registered as benchmark) from projected native entry; real candidate server, Harness Config→PLAYER MAP VISIBILITY ON→READ EXPLAINER click, no page errors. Explainer screenshots at1280/1440/375, collapsed and expanded; initial phone diagram/table shrank/clipped, changed to scrolling containers and recaptured. No foreground focus or production viewer restart. Original failed script attempts retained (fixture short commit, missing run_end.turn, overly broad locator), final script passes. Ignored receipts: runs/reviews/player-map-visibility. Explainer themed and pages-check passes. Pending final screenshot inspection, complete gates and independent review; no claim landed/live.

Preparing to sync incoming main scene capture changes before the frozen review packet.
