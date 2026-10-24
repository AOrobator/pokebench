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

GREEN focused: 48 Python tests passed including real-ROM rerender tests (POKEBENCH_ROM bound to the standard resolver path); 29 focused TS tests pass. Production-wire deletion attempt `runs/wire-delete-1.txt`: replacing rerender's switch argument with False fails exact native fixture readiness assertion. Restored wire receipt `runs/wire-restored-1.txt`: 48 passed. Paired frame 039808_0.png inspected with background image tool: fainted MUDKIP cursor and native text match fixture. No desktop focus.

Private dependency ownership: initial read-only canonical interpreter plus explicit PYTHONPATH=env for focused checks; before uv/full gates replaced symlinks with owned private env/.venv and owned pnpm workspace links. Import path verified /private/tmp/pokebench-party-menu-message/env/pokebench_env. Submodule initialized at pinned bbab97ad73e460b7cd7c08527d10ced30cc03fbe, unmodified. No shared editable installs.

Review waiver verified in primary Claude transcript 00000000-0000-4000-8000-1bb4e739f4f4.jsonl line6309, server-copied human message [private message reference] at 2026-10-22T14:47:31Z: “land without grok. you're not a very good coordinator if you force me to go into chats”. Required fallback roster: available Claude + normal independent GPT + distinct cloud fallback, literal LGTM on frozen packet; report Grok outage and reduced vendor diversity honestly.
Source commit41385c0a6 includes the implementation, explainer, offline probe plan, and append-only registry bookkeeping. Focused tsc passes. Fixed a test closure binding caught by ruff before full-gate readiness (no production change). COMMIT: `test(party-menu): bind negative-case address`.
Before the full-gate freeze, source review caught cursor corner cases within item5: ON must label CONFIRM/CANCEL even when readout-truth-v1 is OFF; a -1 second cursor is unknown, not PARTY SLOT 0; an egg is named EGG, never its hidden underlying species. Added focused regressions, 21 passed. COMMIT: `fix(party-menu): keep cursor ownership independent of legacy truth switch`.
Exact trace indexing correction before freeze: event39808 points to state39807/raw8361 (not earlier equivalent raw8360). Added exact8361 and prior action-menu8356 fixtures; default regression now uses8361. Turn390 starts39776 with prior result39774/SEND OUT; missing-message result39808 follows turn390's A; turn391 begins39809 and is first decision on that result. Probe plan separates turn390 cursor and turn391 acknowledgement cases, 2 draws/arm/case proposed only. 23 focused cases passed. No inference. COMMIT: `test(party-menu): bind exact result archive and probe turn boundary`.
Background Chromium screenshots at1280/1440/375 inspected. No HTTP requests or page overflow. Narrow table/diagram were cramped, so the comparison now stacks on phone and the diagram scrolls inside its labelled container. Viewer-card link test and serving test cover exact feature/file path. No desktop actions used.

First coordinated full-chain window e4056d3d8: build passed17.97s; test stopped22.16s at39 historical registry assertions/36 files, 4136passed. Released CPU immediately (40.2s total), no lint/coverage/vendor attempted. Failures are mechanical append offsets and legacy fixture default flag; preserved all expected feature identities/order and corrected the same original bounds, plus new flag false in withoutFrontierTreatments. Focused formerly-failing registry groups103passed; initial targeted batch153passed/3failed before remaining FEATURES-filter slice adjustments, failures preserved. No tests disabled, assertions removed, floor/excludes changed or runner defaults altered. COMMIT: `test(party-menu): preserve historical registry positions after append`.

Additional source ownership check before freeze: return-after-message has other callers with ROM-backed text. ON now publishes STRING_VAR4 only after the active window6 printer cursor validates inside that buffer; an inactive/unrelated/invalid printer never publishes stale buffer text, including through diagnostic details→Dialog. Old item-message branch remains byte-identical OFF. Added explicit ROM-pointer/stale-buffer and diagnostic-message-absence assertions. 41 focused Python cases passed. This is the original truthful-message owner invariant, not generic text recovery. COMMIT: `fix(party-menu): publish text only after printer ownership validates`.
Python SERVER_FEATURES/default-off list now append the id at the tail, matching TS transport ordering and preserving all original positions; exact native OFF readout unchanged. 41 focused Python tests passed. COMMIT: `fix(party-menu): append Python server feature in transport order`.
Fixture8360 metadata now explicitly says related_event39808/earlier matching wait, rather than implying a direct pair. Exact event39808 regression remains8361. This corrects provenance only; retained memory/readout bytes unchanged. COMMIT: `test(party-menu): distinguish related archive from exact event pair`.
