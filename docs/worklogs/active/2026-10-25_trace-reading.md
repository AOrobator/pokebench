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
- [x] GREEN implementation: explicit reading hold, top/jump resume, retained oldest displayed turn, native anchoring disabled, hover snap removed.
- [ ] Gates and browser proof
- [ ] Cloud review
- [ ] Landing and live proof

## Evidence
Pending.

Initial full test attempt: 4389 agent and 1915 viewer tests passed. Python failed because isolated worktree lacked ROM env and native mGBA package; supplied the existing ROM configuration and read-only native package link in the isolated worktree, then reran via coverage. Inherited lint issue at workbench-store.test.ts:599 will be rechecked after synchronization with the milestone owner.
