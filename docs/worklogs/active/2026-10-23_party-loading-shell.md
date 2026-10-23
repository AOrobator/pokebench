# Party loading shell

User asks to delete the legacy plain-bar party UI entirely. Loading and true empty parties must show the current six-slot party screen with empty blocks. Preserve existing recorded-party retention and battle-health projection.

Production scope: app.ts lifecycle/rendering, party-view.ts shared screen, panels.ts removal of legacy renderer, style.css removal of legacy-only rules. No game, model, schema, recording, flag, timeline or benchmark changes.

Invariants: one current party renderer; six noninteractive empty slots before data/art readiness and for zero members; missing art settles to current layout with recorded facts rather than hiding a known party; successful loading retains existing slot/tab/move interactions and stale-sample/battle-health notices.

Verification: deferred art integration test and true-empty test RED first; existing no-art fallback becomes current layout; independent review, complete gates, background desktop/phone browser proof with delayed/missing art, normal landing board and coordinated single viewer refresh. Preserve all live processes and desktop focus.

- RED: deferred-art, true-empty, no-art current-layout and partyPage empty-shell regressions: 4 failed / 120 passed. The initial fresh-tree run preceded the agent distribution build; reran after build and observed the four intended assertion failures.
