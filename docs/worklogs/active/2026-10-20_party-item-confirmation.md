# Party item confirmation correctness repair

Authorized by delegated operator request 2026-10-20. One repair milestone: reproduce → RED/GREEN → full gates/review → eligible local landing. No GPUs, active games, presets, viewer restart or benchmark launch. Original recordings immutable. Canonical main is preserved until repository landing gates pass.

## Boundary and consumers

Correct party_item_message readiness only when the exact close-after-text task and unique party printer own a drawn window 6, an active window-6 printer points into the current message, and its native state waits for a button with auto-scroll disabled. Preserve passive printing, HP animation, fade and handoff. No injected press. Default-OFF server feature party-item-confirmation-v1; exact OFF behavior. Consumer path: raw memory → menus → active_ui → game_state/rerender → typed observation/readout → viewer/replay existing Interface field. Registry, defaults, explainer and pending unqueued metadata are required collateral.

## Evidence before edits

Reference pokeemerald clean 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881. strings.c gText_PkmnHPRestoredByVar2 ends PAUSE_UNTIL_PRESS; party_menu.c Task_PrintAndWaitForText keeps task active until RunTextPrintersRetIsActive ends; Task_ClosePartyMenuAfterText waits for it. text.c TextPrinterWait requires JOY_NEW(A_BUTTON|B_BUTTON), except autoScroll. include/text.h TextPrinter stride 0x24, active +0x1b, state +0x1c, WAIT=1.

Reproduced from matching-ROM hash-validated raw archives 6468,6472,6507 of run 2026-10-20T14-04-18_qwen38-mac_28f3, frames 823448/825148/842563: window 6 printer pointer 0x02021fef, active=1, state=1, text_flags=1 (autoScroll bit 4 clear). Existing reader returns ready=False and passive handoff wording. Paired 028132_0.png visually opened: complete TORCHIC HP restoration message. ROM SHA1 f3ae088181bf583e55daf962a92bb46f4f1d07b7. Reparse script retained canonical runs/party-item-confirmation/reproduce.py (read-only originals). The run also contains model errors; no attribution of all terminal delay or performance benefit.

## Checklist

- [x] Rules, coordination, source, raw reproduction and screenshot
- [ ] RED regression commit
- [ ] GREEN implementation, exact OFF and consumer propagation
- [ ] Gates, mutations, isolated viewer/replay verification
- [ ] Principles and cloud review, synthesis
- [ ] Landing if eligible; no runtime restart

## Open questions

Validate message-pointer bounds/consumed wait bytes against raw receipts, and fail closed for invalid native printer ownership. Review availability and concurrent main movement may block landing; neither is approval.
