# Viewable trainer-card membership

User request October 28: live gameplay must not be crowded by replay/probe trainer cards; cards represent viewable runs. Bounded viewer-only correction; preserve recordings, game processes and approved card appearance/identity.

Reproduced on served 2308380fd238: one healthy live GLM run and ten unrelated REPLAY cards (manual probes, human session, dry-run sessions). Snapshot-first current summaries retain unreachable unended sessions; cardInputs promotes all known sessions and renders unresponsive sessions as replay.

- [ ] RED regression for unrelated unresponsive and probe summaries.
- [ ] Filter membership to reachable live/paused sessions, suppress unselected probes; retain explicitly opened ended replay.
- [ ] Focused checks, independent review, full gates, isolated browser proof.
- [ ] Landing and separately coordinated viewer activation/live proof.

RED: two current-app membership regressions fail on unrelated unresponsive and healthy probe summaries (red.log). GREEN: reachable live/paused only; unrelated probe recognition uses native current header or legacy probe exclusion, while selected game/probe and explicit ended replay remain available. Comparison current-run links also exclude probes. No protected fixtures/assertions/baselines/card renderer edits. Cross-worktree symlink type identity was corrected by offline local dependency installation; initial no-dist focused run and missing argument corrected openly before full gates.
