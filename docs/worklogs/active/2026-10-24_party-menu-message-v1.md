# Party-menu message and cursor facts (item 5)

## Approved scope
The operator's five-chat brief authorizes item 5 implementation, tests, independent review and local landing. Source: runs/agent-mail/briefs/2026-10-24-frontier-top5.md. Only expose native party return-message text/readiness and cursor species with explicit slot indices. No input automation, run termination, GPU/probe calls, active-run mutation, or timeline additions. New `party-menu-message-v1` defaults OFF in every arm until separately approved activation.

## Production boundary
menus.py, ui_state.py, game_state.py, rerender.py, readout.py; TS feature registry/preset/default transport; explainer mapping. No new tool; existing press controls remain factual. OFF must preserve exact state/readout/prompt/tools. ON text requires the return-message owner plus unique printer task and drawn window 6; readiness additionally requires active printer 6 at consumed FC09, WAIT, no fade or auto-scroll. Cursor facts reuse decoded party; no species guessed from an invalid slot/diagnostic.

## Grounding
Reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean checked 2026-10-24. party_menu.c Task_ReturnToChooseMonAfterText / Task_PrintAndWaitForText; strings.c gText_PkmnHasNoEnergy; text.c EXT_CTRL_CODE_PAUSE_UNTIL_PRESS. Exact US ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. Report ram_audit.md item 2: GLM 0d5d event 39808 turn390 raw8360; post-A raw8367/event39857. Confirm archived memory hashes and ROM identity during fixture extraction.

## Milestone
- [ ] RED fixture + negative cases committed
- [ ] GREEN and production-wire deletion/restoration
- [ ] Explainer + offline turn390 probe plan
- [ ] Gates (finite shared CPU window)
- [ ] Principles, frozen cloud reviews; standing Grok outage fallback only with provenance
- [ ] Landing board, ff-only, postmerge checks and coordinated viewer proof

## Evidence
Started from main bbefc77b8 in /private/tmp/pokebench-party-menu-message on codex/party-menu-message-v1. Current gameplay/compute untouched. Focused tests only until coordinated full-gate window.

RED: test_party_menu_message.py 10 failed / 6 passed before implementation; receipt runs/red-party-menu.txt. Fixture extraction validates archive/index SHA256 and exact external ROM identity using load_raw_ram; retains only consumed byte ranges (including future printer/window reads), no binary ROM asset or emulator state. Memory fixtures are bounded two states, reused production read_state/render seam. OFF baseline captured before implementation. COMMIT: `test(party-menu): retain native message wait regression` (RED).
