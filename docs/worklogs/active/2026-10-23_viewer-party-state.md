# Viewer party state

## Request and boundary
Investigate GLM Marshtomp/Taillow empty party display, repair, review and land on local main. Viewer-only; no harness changes, flags, launches, game inputs, recording rewrites or timeline additions. Production paths: model.ts (party sample owner), panels.ts (fallback and notice), app.ts (rich party consumer). Tests cover partial reads, true emptiness, new samples, reset and replay.

## Evidence
Run 2026-10-22T20-40-54_glm53-mac_0d5d, state 126191 has Marshtomp Lv21 HP63/63 and Taillow Lv11 HP17/30. States 126192/126194 have started=true, screen=battle but party=[], name/location/money/play_time_s=null; state 126210 reads the two members again. game_state.py refuses save-backed reads mid-frame (transition-coherence-v1); readout_fixes.py describes these as unread, not empty. Viewer currently consumes every state.party directly. Headless browser on main ec19227bc showed two members at a readable sample, demonstrating the intermittent nature; original operator tab untouched.

## Invariants and proof
- Raw latest state remains exact and inspectable; party panel tracks its own last readable state with sequence disclosure when stale.
- A save-backed play_time_s or nonempty party establishes a readable party; confirmed pregame screens clear history. A readable empty party clears it too.
- Replay and run selection use the normal reducer lifecycle, never future data.
- Background browser only, desktop focus preserved. Preview uses scratch copied recordings.

## Progress
- Investigation complete; regression tests next.
- Required gates: test, lint, build, coverage >=90, verify-vendor; background browser desktop/phone; three cloud review lanes; landing board; main test and viewer restart/live proof.
- RED: panels/app regression run reached 276 tests: 3 failed, 273 passed. Exact failures: unread sample renders no Pokémon instead of Torchic/label; first unread sample says empty; rich party loses .pv.
- Source grounding skill used: pokeemerald clean revision 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, load_save.c MoveSaveBlocks_ResetHeap moves pointers then restores data. game_state.py lines 461-499 deliberately suppress save reads on torn frames; readout.py serializes None party as []. No decoder or model behavior change needed.
- GREEN: 311 focused tests passed. Removed each operand from the party sample condition separately: reset removal failed 1 test, clock removal failed 3, populated removal failed 1; restored source. Raw latest state equality is asserted. New replay test proves no future samples and a fresh reducer has no carried party.
- Browser proof: headless Chromium on scratch ports 8798 (main) and 8797 (candidate), copied real event subset [0,126052,126191,126194], shared original log untouched. Before shows no Pokémon yet, after shows Marshtomp 63/63 and Taillow 17/30 with sample #126191 timestamp and stale HP/moves warning. No page errors. Captured and inspected before/after at 1280,1440,375; clicked Taillow, MOVES, keyboard ArrowLeft -> STATS through polling. The original operator tab was not inspected or altered. The copied run header still points to its live game port, so frame streaming was live/read-only; no game controls used.
- Sent coordination letter asking for a review hold and later single restart coordination; no Claude listener, saved for next mailbox.
- Browser recovery: appended the next original readable sample #126210 to the scratch copy only; stale notice disappeared, Taillow selection stayed open, both members remained correct after leaving/reopening party and two polling cycles. Taillow screenshots at all three widths inspected.
- Build/lint passed. First full test attempt lacked the ignored .env in the fresh worktree: Python ROM-dependent tests failed with POKEBENCH_ROM not set. Linked the existing configuration without printing it and reran; no source/test/gate changes.

- Guard refinement: started=false can also occur in an unread field transition; clear only on the decoder PRE_GAME screens when not started. Added exact transition-retention regression.
- Final focused suite: 312 passed. Full test: agent/viewer suites passed (viewer 1743 before the extra field-transition regression), Python 4044 passed. Build/lint passed after guard refinement. Full coverage running.
- Synced with executable main 67137a3e5 and its docs-only evidence 7d550557d. Final full gates: build/lint/vendor PASS; test agent 4053, viewer 1745, Python 4050 PASS. Coverage PASS with unchanged original time limits: agent lines99.13/branches92.93/functions97.61%; viewer lines98.01/branches91.53/functions95.10%; Python lines97.37/branches93.30/functions100%. Two earlier coverage attempts timed out in pre-existing agent tests (map-cycle recovery on old base; battle readiness on synced base); final complete standard coverage passed. No test/gate settings changed.
- Deleted the PRE_GAME screen guard alone: uninitialized-field-transition regression failed; restored byte-identical source and 313 focused tests passed. Final browser scripts reran after the completed build; before/after + Taillow screenshots at all widths inspected again, recovery and leave/reopen party selection passed, no page errors. Earlier recovery script initially attempted desktop navigation at phone width and timed out on its hidden button; corrected the test viewport and repeated successfully. Original operator tab remains untouched.
- Canonical ignored evidence: runs/reviews/viewer-party-state-20261023 and runs/mockups/viewer-party-state/shots. Coordination with campaign owner: main and8790 held through their actual launch proof; normal board is currently empty, but honoring the source-window hold until release.
- Frozen review next: exact main-to-branch binary diff, boundary and PB1-PB13/nine-test-quality artifacts. No implementation changes after freeze without re-review.
