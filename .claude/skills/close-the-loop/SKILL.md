---
name: close-the-loop
description: Prove a PokeBench change works where the operator will use it before calling it done — tests for code, real-browser screenshots and clicks for viewer pages and mockups, fake-data rehearsals for runners, schedules and launches, and a live check after every merge. Use before any "done", "fixed", "merged", "launched" or "ready to pick" message; not a substitute for the multi-model review.
---

# Close the loop

"Done" means the operator can use the result, not that a step ran. Before any message that says done, fixed, merged, live, launched or ready, prove the change at the surface the operator will touch, with the evidence that surface needs, and say plainly what you did not prove.

A subagent's report is a claim, not proof. Check its evidence yourself (open the screenshot, rerun the command, read the output) before repeating it.

All browser and screenshot proof follows [viewer-e2e's desktop-focus boundary](../viewer-e2e/SKILL.md#preserve-desktop-focus): use an agent-owned headless browser or documented focus-preserving context. "Open" a page or screenshot below means inspect it through background browser/image tools, not activate an application or tab. Do not use global mouse/keyboard input or foreground the operator's browser to satisfy these gates. If background browser control is unavailable, leave the affected check pending and report it; do not claim browser proof from an HTTP or mounted-DOM substitute. Relay this rule to subagents.

## Pick the proof by the surface

| Change | Proof required before "done" | Never enough on its own |
|---|---|---|
| Logic, parsing, scoring, runner code | Failing test first, then green; `just test` (also enforces coverage ≥90), `just lint`; a check on real data read-only when the code reads `runs/` | Coverage percent; "tests pass" for code the test never reaches |
| Viewer UI (stats page, run viewer, plates, legend) | `.claude/skills/viewer-e2e/SKILL.md` for click-throughs, plus: a real browser on the built page: click every changed control with real input, wait through two polling cycles, screenshot desktop (1280 and 1440) and phone (375), and look at every screenshot | Mounted DOM tests; HTTP 200; a screenshot you did not open |
| HTML mockups, explainers, reports | explainers, reports and reviews carry the Emerald theme (`just pages-theme`); `just pages-check <file>` prints nothing; the 8791 link returns 200; screenshots at 1280, 1440 and 375 opened and looked at, expanded and collapsed states included | The generator ran; one width checked |
| Data shown in the viewer (dropdown, frontier, splits, cohorts) | A before/after table on the real `runs/`, read-only: entries, run counts, which run is the record, nothing lost, nothing listed twice; `just experiments-audit` prints nothing | Fixture tests alone |
| Fixed-run runner or scheduler | A rehearsal on fake data (below) that shows trials chaining and the schedule finishing inside its window | Reading the code; a `--dry-run` that launches nothing |
| A real fixed-run launch | `.claude/skills/fixed-run-launch/SKILL.md`: status, ledger, run cards and recorded run identities agree, and `just experiments-audit` prints nothing | The runner process starting |
| Harness behavior (what the model sees or does) | `.claude/skills/agent-observability/SKILL.md`: the recorded event, model delivery, Activity History, the raw-event inspector and replay. The TIMELINE is closed to additions; check it only for marks that already exist | A unit test of the helper |
| Merge to main | The live viewer at the merged build shows the change on real data (below) | "Merged" |

## Viewer and page proof

1. Build what you will serve. For a branch, serve the built viewer on a scratch port against a scratch copy of a few run dirs. **Never start the viewer CLI against `~/dev/pokebench/runs`** except through `just viewer-main`. Keep the scratch root isolated from active run state. Stop the scratch server when done.
2. Open the page in a background browser context under viewer-e2e's desktop-focus boundary. Click each changed control with context-scoped pointer and keyboard input where the control supports it. Confirm the outcome you claimed, for example that the filter removed the runs, the plate shows the lane, or the card expands.
3. Take context-scoped screenshots at 1280×900, 1440×900 and 375×812, with the legends and details in their default state and again opened. Inspect every image with the image-reading tool: no text wrapping into a sliver, no column squeezed to a letter, no overflow past its card, nothing cut off, and the mobile header short enough that the chart is on the first screen. Do not resize or foreground the operator's window for these captures.
4. Put screenshots under the 8791 pages root (for example `runs/mockups/<slug>/shots/`) and link them as `http://127.0.0.1:8791/...` after checking each returns 200. Never use `SendUserFile` or `/mnt/project-files` for pages or screenshots.

## Rehearse runners and schedules on fake data

Anything that launches, chains or schedules runs is proven on a fake-data rehearsal before it touches the GPU lanes. `just fixed-run …` writes to the main checkout's real `runs/`, and the default `just experiments-audit` reads that real root, so neither is the rehearsal.

1. Drive the real code through its injected seams: `runFixed` takes a `runsRoot` (where the ledger, status and run dirs go) and a `FixedHost` (clock and sleep, build and serving checks, port checks, run ids, launches, liveness), as `packages/viewer/src/fixed-runner.test.ts` does. Use a test, or a scratch script that passes a scratch runs root in a gitignored folder and a stub host with a fake clock, stub serving receipts and stub launches that write fake run events. Never send traffic to a lane a running experiment owns. The lanes and ports are in `experiments/fixed/<id>.json`. `runs/experiments/runner.json` and `lsof -iTCP -sTCP:LISTEN` show what is live.
2. Show that the trials chain. Trial N+1 launches when trial N ends, with the expected arm, lane, phase and start, and nothing overlaps on a lane. For fixed runs, also show that a trial that never began is replaced at the end of its phase, that a crashed or gateway-failed trial counts without replacement while its lane backs off, and that a paused lane resumes.
3. Show that it finishes on time. Compute the end from the caps and the plan, then compare it with the rehearsal's (fake-clock) timestamps. A schedule meant to finish by a given New York time must show the margin.
4. Show that the surfaces agree on the scratch root. The scratch `status.json` and ledger must name the same trials and counts, and `node packages/viewer/dist/experiments-audit.js <scratch-runs-root>` must print nothing.
5. Delete the scratch runs root afterwards, or leave it gitignored and say where it is.

## After a merge: prove it live

1. Restart the viewer with `just viewer-main` after every merge, as CLAUDE.md says. Restarting keeps live runs running (`viewer-restart.sh` checks this). The real dangers are two restarts at once and a restart in the middle of someone's launch check. So ask whoever owns 8790 restarts first, and restart only once: a viewer busy with its first scan delays SIGTERM, and a second restart collides with it.
2. Confirm the restart: `just viewer-main` prints `viewer at <sha>` naming the merged commit, and the actual 8790 listener's compiled CLI tree has `packages/viewer/dist/build-stamp.json` naming it too. Resolve the listener's tree with `pokebench_env.current_runtime.serving_viewer_tree` as shown in `docs/current-run-snapshots-operations.md`; never infer it from a temporary directory, current main, or an existing cached build. A worktree's own `dist/build-stamp.json` proves nothing about 8790. Confirm also that one viewer is listening on 8790, and that every gameplay process that was alive before is still alive.
3. On the real page, show the change working: the same click or check as before, now on live data. Confirm that live runs still show and that `/api/workbench` lists no "viewer build … is older than this run's build" problem.
4. Report the merge SHA, the restart time in New York time, and what you saw.

## The receipt

End with a receipt that separates each claim from its evidence:

- **Proven:** what, how, and where to see it (command and result, a screenshot link, a before/after table).
- **Not proven:** what you could not check, and why.
- **Changed but not live:** merged but waiting on a restart, a launch or the operator's pick.

If any proof in the table is missing, the work is not done. Say which proof is missing, not "should work".

## Why this exists

Each rule comes from a real miss on 2026-10-16:

- A mockup went out with its desktop legend crushed into a one-letter column, because only the phone view had been checked.
- A viewer built before a pinned harness hid a live run, because nobody checked that the viewer's build was at least the runs' build.
- The experiment filter dropped runs whose ledgers had been moved, because nobody compared before/after counts on real data.
- Two threads restarted 8790 at the same time and left it down.
