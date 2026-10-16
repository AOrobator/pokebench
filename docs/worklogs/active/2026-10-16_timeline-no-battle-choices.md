# Viewer: battle choices off the timeline; no timeline additions without the operator's OK

Requested by the operator (2026-10-16 03:33 New York): "I don't really want battle choices at all ... remove the battle presses because it's noise", and update the skills so nothing is ever added to the timeline view without the operator's explicit permission.

Viewer-only removal plus docs; no feature switch (viewer-only). Battle choices stay recorded and stay in Activity History and the raw-event inspector. Branch `claude/timeline-no-battle-choices` in `/private/tmp/pokebench-timeline-no-battle`.

## M1

- [x] RED: `battle-choices.test.ts` asserts a recorded battle choice draws nothing on either timeline (full and human `presses,milestones`) while history still shows it. Fails: the SVG contains "WATER GUN".
- [ ] GREEN: remove the `battleChoices` loop from `timeline.ts`.
- [ ] Docs: CLAUDE.md, agent-observability and viewer-e2e skills say the timeline gets no new marks, lanes or labels without the operator's explicit permission; diagnostics default to Activity History.
- [ ] Review (Claude, Grok, Codex; no local reviewers), land, restart viewer, live check.
