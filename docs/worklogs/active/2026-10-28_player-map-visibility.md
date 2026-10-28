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
