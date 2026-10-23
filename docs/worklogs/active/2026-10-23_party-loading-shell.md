# Party loading shell

User asks to delete the legacy plain-bar party UI entirely. Loading and true empty parties must show the current six-slot party screen with empty blocks. Preserve existing recorded-party retention and battle-health projection.

Production scope: app.ts lifecycle/rendering, party-view.ts shared screen, panels.ts removal of legacy renderer, style.css removal of legacy-only rules. No game, model, schema, recording, flag, timeline or benchmark changes.

Invariants: one current party renderer; six noninteractive empty slots before data/art readiness and for zero members; missing art settles to current layout with recorded facts rather than hiding a known party; successful loading retains existing slot/tab/move interactions and stale-sample/battle-health notices.

Verification: deferred art integration test and true-empty test RED first; existing no-art fallback becomes current layout; independent review, complete gates, background desktop/phone browser proof with delayed/missing art, normal landing board and coordinated single viewer refresh. Preserve all live processes and desktop focus.

- RED: deferred-art, true-empty, no-art current-layout and partyPage empty-shell regressions: 4 failed / 120 passed. The initial fresh-tree run preceded the agent distribution build; reran after build and observed the four intended assertion failures.

- GREEN: 318 focused tests pass. Party tests await the actual asset-load promise instead of a fixed microtask count. Legacy-only renderer tests were removed with that renderer; notice retention and projected battle HP remain covered through the current party screen.
- Background browser proof: delayed data.json, genuinely empty party and missing data.json at 1280, 1440 and 375px. All nine screenshots inspected. Loading/empty show six empty modern slots; missing art settles to two recorded members in the modern layout; successful load retains slot, tab and keyboard interactions. No page errors or legacy elements. Receipt: runs/mockups/party-loading-shell/receipt.json. Preview uses an owned scratch runs root and headless Chromium; no game actions or desktop focus changes.

- R1 review: Claude and both distinct fallback reviewers LGTM; GPT found one accepted battle-health caller-test gap (PB10/evidence), no production defect. Grok4.7/4.5 unavailable at account limit; general 2026-10-21 outage waiver independently verified in f7406a93 history4145/4964 (human quote plus coordinator scope), distinct from this chat's earlier commit-specific waiver. Reduced vendor diversity recorded.
- R2 fix: added native 39/39→22/39 App integration assertion through actual renderParty and notice. Mutated only renderParty's partyMembers operand to retained state.party: new22/39 assertion failed (1 failed/1783 passed); restored correct operand: full viewer1784 passed, focused319. No production changes. R1 synthesis/receipts at runs/reviews/party-loading-shell-20261023.

- Main advanced during R2 to281175a7e (recovery landing). Synced cleanly; panels additions preserved. Own patch rebinds to updated base; rerun gates and reviews before landing. R2Claude LGTM on previous base is retained as supplementary evidence, not new-packet approval. No additional blocker/production change. Holding heavy checks and viewer restart during the campaign's brief activation-proof window.
