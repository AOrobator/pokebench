# Viewer: battle choices off the timeline; no timeline additions without the operator's OK

Requested by the operator (2026-10-16 03:33 New York): "I don't really want battle choices at all ... remove the battle presses because it's noise", and update the skills so nothing is ever added to the timeline view without the operator's explicit permission.

Viewer-only removal plus docs; no feature switch (viewer-only). Battle choices stay recorded and stay in Activity History and the raw-event inspector. Branch `claude/timeline-no-battle-choices` in `/private/tmp/pokebench-timeline-no-battle`.

## M1

- [x] RED: `battle-choices.test.ts` asserts a recorded battle choice draws nothing on either timeline (full and human `presses,milestones`) while history still shows it. Fails: the SVG contains "WATER GUN". COMMIT: `test(viewer): RED battle choices stay off the timeline` (e5aa2669)
- [x] GREEN: removed the `battleChoices` loop from `timeline.ts`. Viewer: 60 files, 821 tests pass; coverage 95.19 / 90.66 / 93.55; tsc and eslint clean.
- [x] Docs: CLAUDE.md, agent-observability and viewer-e2e skills say the timeline gets no new marks, lanes or labels without the operator's explicit permission; diagnostics default to Activity History.
- [x] COMMIT: `fix(viewer): GREEN battle choices leave the timeline; ...` (2d658934)
- [x] the operator, 03:34 New York: "In general, just seeing the button presses should be sufficient." The only other non-button mark on the presses lane is the host WAIT (`wait_input`), so it leaves too; WAITs stay in Activity History and the inspector.
- [x] RED: `state-decision-events.test.ts` asserts no WAIT mark and no bare `m-press` on the timeline; fails (1 WAIT mark). COMMIT: `test(viewer): RED the presses lane shows only button presses, no WAIT marks` (dbcf3db8)
- [x] GREEN: `wait_input` no longer draws on the timeline; `app.test.ts` mount test updated to expect no WAIT lane mark while the trace row keeps it. Viewer: 60 files, 821 tests pass; coverage 95.19 / 90.65 / 93.55; tsc and eslint clean.
- [x] Review round 2 on 70453992 (base d339b5e7): Claude CLI LGTM, Grok LGTM, Codex (gpt-5.6-sol) LGTM. (Round 1 on 2d658934, before the WAIT change: all three LGTM.)
- [x] main moved to 755da34e; synced; `git diff --binary main HEAD` sha256 01912004… equals the reviewed packet; viewer 821 tests pass. Landed fast-forward: main = ad9171b8.
- [x] `just viewer-main`: viewer at ad9171b8, 0 live gameplay processes (cook run #2 had ended). Live: cook run's final window has 20 presses-lane marks, all button presses, 0 battle, 0 WAIT; 4 red errors. The live build renders 0 battle-choice marks across all 6 recorded choices.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-16). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
