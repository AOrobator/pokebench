---
name: close-the-loop
description: Prove a PokeBench change works where the operator will use it before calling it done — tests for code, real-browser screenshots and clicks for viewer pages and mockups, fake-data rehearsals for runners, schedules and launches, and a live check after every merge. Use before any "done", "fixed", "merged", "launched" or "ready to pick" message; not a substitute for the multi-model review.
---

# Close the loop

"Done" means the operator can use the result, not that a step ran. Before any message that says done, fixed, merged, live, launched or ready, prove the change at the surface the operator will touch, with the evidence that surface needs, and say plainly what you did not prove.

A subagent's report is a claim, not proof. Check its evidence yourself (open the screenshot, rerun the command, read the output) before repeating it.

## Pick the proof by the surface

| Change | Proof required before "done" | Never enough on its own |
|---|---|---|
| Logic, parsing, scoring, runner code | Failing test first, then green; `just test`, `just coverage` (≥90), `just lint`; a check on real data read-only when the code reads `runs/` | Coverage percent; "tests pass" for code the test never reaches |
| Viewer UI (stats page, run viewer, plates, legend) | Real browser on the built page: click every changed control with real input, wait through two polling cycles, screenshot desktop (1280 and 1440) and phone (375), and look at every screenshot | Mounted DOM tests; HTTP 200; a screenshot you did not open |
| HTML mockups, explainers, reports | `just pages-check <file>` prints nothing; the 8791 link returns 200; screenshots at 1280, 1440 and 375 opened and looked at, expanded and collapsed states included | The generator ran; one width checked |
| Data shown in the viewer (dropdown, frontier, splits, cohorts) | A before/after table on the real `runs/`, read-only: entries, run counts, which run is the record, nothing lost, nothing listed twice; `just experiments-audit` prints nothing | Fixture tests alone |
| Runner, scheduler, queue, fixed-run launch | A rehearsal on fake data (below) that shows trials chaining, the schedule finishing inside its window, and the status, ledger and dropdown agreeing | Reading the code; a `--dry-run` that launches nothing |
| Harness behavior (what the model sees or does) | `.claude/skills/agent-observability/SKILL.md`: the recorded event, model delivery, timeline, Activity History and replay | A unit test of the helper |
| Merge to main | The live viewer at the merged build shows the change on real data (below) | "Merged" |

## Viewer and page proof

1. Build what you will serve. For a branch, serve the built page from a scratch server or a scratch copy of the run dirs. **Never start the viewer CLI against `~/dev/pokebench/runs`**: its launcher also starts the experiment queue runner.
2. Open the page in the browser tools. Click each changed control with real input, both pointer and keyboard where the control supports it. Confirm the outcome you claimed, for example that the filter removed the runs, the plate shows the lane, or the card expands.
3. Take screenshots at 1280×900, 1440×900 and 375×812, with the legends and details in their default state and again opened. Open every image and check it: no text wrapping into a sliver, no column squeezed to a letter, no overflow past its card, nothing cut off, and the mobile header short enough that the chart is on the first screen.
4. Put screenshots under the 8791 pages root (for example `runs/mockups/<slug>/shots/`) and link them as `http://127.0.0.1:8791/...` after checking each returns 200. Never use `SendUserFile` or `/mnt/project-files` for pages or screenshots.

## Rehearse runners and schedules on fake data

Anything that launches, chains or schedules runs is proven on a fake-data rehearsal before it touches the GPU lanes.

1. Use a scratch runs root in a gitignored folder and fake lanes: a stub model endpoint and fake game ports. Use short caps (`--wall-ms`), or an injected clock when the code takes one. Never send traffic to a lane that a running experiment owns. Check the active worklog for the frozen ports.
2. Show that the trials chain. Trial N+1 launches when trial N ends, with the expected arm, lane, phase and start, and nothing overlaps on a lane. Show also that an invalid trial is replaced at the end of its phase and a paused lane resumes.
3. Show that it finishes on time. Compute the end from the caps and the plan, then compare it with the rehearsal's real timestamps. A schedule meant to finish by a given New York time must show the margin.
4. Show that the surfaces agree. `status.json`, the ledger, `just fixed-run status <id>`, the viewer's experiment card and the EXPERIMENT dropdown must name the same trials and counts. `just experiments-audit` must print nothing.
5. Delete the scratch runs root afterwards, or leave it gitignored and say where it is.

A real launch still follows `.claude/skills/fixed-run-launch/SKILL.md`. Its dropdown and audit checks are this skill's checks on the real data.

## After a merge: prove it live

1. Restart the viewer with `just viewer-main` only when no launch window is open. Coordinate with whoever owns 8790 restarts, and restart only once. A viewer busy with its first scan delays SIGTERM, and a second restart collides with it.
2. Confirm one viewer is listening on 8790, its `dist/build-stamp.json` names the merged commit, and every gameplay process that was alive before is still alive.
3. On the real page, show the change working: the same click or check as before, now on live data. Then confirm that live runs still show, with no "viewer build … is older than this run's build" problem.
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
