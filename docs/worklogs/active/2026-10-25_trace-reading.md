# Preserve trace reading position

User: phone trace refresh jumps to the newest turn. Approved fix: scrolling back or expanding a trace holds the reading position; new activity can be reached with Jump to latest. User clarified that scrolling to the top should also resume following.

Single milestone: regression tests, implementation, background desktop/phone browser proof, gates, cloud review, landing board and live proof. No gameplay or trainer-card changes.

## Invariants
- New events preserve the visible row and offset while reading older content, including after more than 50 turns arrive.
- Returning to top by user scrolling or Jump to latest resumes following.
- Expanded rows remain expanded; touch works without hover; programmatic compensation does not resume follow.
- Run/replay resets clear reading state.

## Progress
- [x] RED regression: phone reading test fails because no trace-latest control exists.
- [ ] GREEN implementation
- [ ] Gates and browser proof
- [ ] Cloud review
- [ ] Landing and live proof

## Evidence
Pending.
