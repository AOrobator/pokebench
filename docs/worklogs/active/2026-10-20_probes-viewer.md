# Probes viewer

## Problem Statement

The operator (2026-10-20, thread "Get a local model to catch rayquaza via pokeagent"): there is no good way to watch ongoing probes. Decision probes (`just probe-decision`, the positive-supervisor held-out checks, the ablations, and the cited-destination-v1 study Codex ran tonight) never touch the emulator; they rebuild one recorded turn and sample the model's next call per arm. Their results land in several file shapes and nothing in the viewer reads them.

After four mockup rounds the operator picked design **N** (`runs/mockups/probes-viewer/n.html`, served at http://127.0.0.1:8791/probes-viewer/n.html) and said "yeah, then execute the worklog. n looks good" at 8:09 PM New York.

Design N:
- The big Pokédex header: one tile per lane (completed/planned, HP bar, done time or ETA/ceiling) plus a held-out summary tile.
- A lane switch (models are never pooled) and an ARM-BLIND toggle.
- Party-style case slots on the left: ON/OFF HP pills plus a thin gap (effect) bar.
- The selected case as a battle scene: the source run's frame between the ON and OFF boxes.
- One square per sample (green departs from the recorded call, red repeats it, grey error/text), a GAP bar under the squares with a one-line reading hint, a plain-language verdict, the recorded call and a sample reader (call, citation, thinking).
- A folded "Is the difference real?" effect plot over all cases with a how-to-read guide.

## Skills Loaded

- feature-worklog, execute-worklog (this file, the loop)
- close-the-loop, viewer-e2e (browser proof at 1280/1440/375)
- frontend-design / Emerald design language memory (theme from the existing viewer CSS)

## Architecture

**Ledger contract.** A probe is a directory with a `manifest.json` and one folder per lane:

```
<probe dir>/manifest.json            id, cases[{id, run, turn, split, category}], optional question/changedFeature/tier/arms
<probe dir>/<lane>/samples.jsonl     {case, arm, sample, at, elapsedMs, decision:{key, thinking}}
<probe dir>/<lane>/status.json       {lane, state, completed, planned, started, ended?, case?, split?}
<probe dir>/<lane>/provenance.json   optional {model:{id}}
```

This is the layout the cited-destination-v1 runner already writes (`runs/launch-receipts/cited-destination-ablation-20261020/`), so it needs no conversion. Probes are listed from `runs/probes/`: a real folder `runs/probes/<id>/`, or a pointer file `runs/probes/<id>.json` = `{version: 1, dir: "<path under runs/>", title?}` whose real path must stay inside the real `runs/` (no symlinked folders, matching the reports page's jail). The viewer reads only those fixed file names.

**Server (`packages/viewer/src/probes.ts`).**
- `listProbes(runsRoot)`: every valid entry under `runs/probes/`, newest first, with lane progress.
- `readProbe(runsRoot, id)`: the validated manifest, lanes, samples (malformed lines are counted, not fatal), and per case the recorded call and frame.
  - The recorded call is the first `tool_call` of the case's turn in the source run's `events.jsonl`.
  - The frame is the newest `frames/` PNG whose seq is at or before that turn's `turn_start`.
  - Both are cached per (run, turn, file size).
- Routes:
  - `/probes`: the page
  - `/api/probes`: the list
  - `/api/probes/<id>`: one probe
  - Frames are served by the existing `/api/runs/<run>/frames/<file>`.

**Pure logic (`probe-stats.ts`).**
- `tally` and the auto grade (same call as recorded = repeat; differing = departs; `(text only)`/`(model error…)` = error).
- Fisher exact (two-sided).
- The gap interval (smoothed Wald, clamped to ±1).
- Lane ETA and ceiling projection.
- The verdict sentence.

**View (`probes-view.ts`, pure HTML strings) and boot (`probes-main.ts`, `probes-boot.ts`).**
- `static/probes.html` holds the page.
- The page refetches every 5 s while any lane is running and stops when all are done.
- Selection lives in the hash (`#<probe>/<case>`).
- NAV chips gain PROBES on the comparisons and reports pages.

No harness behavior changes, so no feature switch. The TIMELINE is untouched.

## Invariants

- **INV-1: lanes are never pooled across models.**
  - Rationale: the Mac lane runs a different model.
  - Test: the view's tallies filter by the selected lane group; a two-model fixture shows distinct counts.
- **INV-2: the viewer reads only the ledger's fixed file names inside a probe dir.** It never reads a path taken from file contents, except the source run, and that goes through `validateRunId` under `runsRoot`.
  - Rationale: probe dirs may be symlinks into `launch-receipts/`.
  - Test: traversal ids and a case whose `run` is `../x` are rejected.
- **INV-3: a malformed sample line or a missing lane file never hides the rest of the probe.**
  - Test: a fixture with a bad line shows the other samples plus a problem count.
- **INV-4: times on the page are New York time.**
  - Test: the formatter uses `America/New_York`.
- **INV-5: the auto grade is labelled as an automatic stand-in, never as the rubric.**
  - Test: the rendered page contains the stand-in note.

## Security Review

- Read-only routes.
- Probe ids pass a segment allowlist (`^[A-Za-z0-9._-]+$`, no `..`).
- Source run ids pass `RUN_ID_PATTERN` (the agent's run-id allowlist).
- All model text (thinking, citation, tool args) is HTML-escaped before rendering.
- No new listeners; the viewer still binds only 127.0.0.1.

## Milestones

**M1: ledger reader and routes**
- [x] (tests listed above)
  - list order and symlinked entries
  - manifest validation (missing cases, bad split)
  - malformed sample lines counted
  - lanes without status
  - recorded call and frame lookup
  - traversal ids rejected
  - routes /probes, /api/probes, /api/probes/<id>
- [x] Write tests: `probes.test.ts` (list, pointer jail, malformed entries, recorded call and frame, lanes, problems, ids) and a server route test
- [x] COMMIT: `test(viewer): probe ledger reader and routes` (RED) fe14b879 — fails: no `probes.js`, no routes
- [x] Implement `probes.ts`, the server routes and a stub `static/probes.html`. The RED route test also expected the four browser modules; that one assertion moved to M2 (the modules do not exist until then)
- [x] Gates: agent 2989 pass; viewer 1447 (one pre-existing git-heavy experiment-cli test timed out under load, passes alone 11/11); lint TS clean, ruff clean, mypy clean with the main venv (fresh worktree venv has no mGBA binding); build OK; coverage viewer 95.08/91.02/93.9 (probes.ts 94.5/89.2/96.9), agent 97.19/92.97/97.55; Python 96.92/92.22/99.55 (1 test needs POKEBENCH_ROM in the shell, fails the same on main)
- [x] COMMIT: `feat(viewer): probe ledger reader and routes` (GREEN) ff1093d7

**M2: probe stats and the page (design N)**
- [ ] Write tests:
  - Fisher and gap interval against known values
  - auto grade
  - verdict wording
  - ETA and ceiling
  - lane switch filtering (INV-1)
  - arm-blind labels
  - squares, hint and stand-in note present (INV-5)
  - escaping
  - hash selection
  - polling stops when complete
  - nav chips
- [x] Tests: `probe-stats.test.ts`, `probes-view.test.ts` (parsing, hash, INV-1 groups, header, slots, scene, squares, verdict, reader escaping, arm-blind, folded plot and guide, ungraded case, problems, nav chips on all three pages, mount/clicks/polling/empty); the reports header test now expects three chips; the server test again expects the four browser modules
- [x] COMMIT: `test(viewer): probes page` (RED) a5be6a77
- [x] Implement `probe-stats.ts`, `probes-view.ts`, `probes-main.ts`, `probes-boot.ts`, CSS and nav chips. The gap range is Newcombe's (from Wilson intervals): the mockup's add-a-half Wald range excluded zero for 5/8 vs 8/8 while Fisher gives p=0.20, which would contradict the reading guide. Added tests for the picker, the real-window boot and a missing mount point. The SVG click test dispatches a MouseEvent, because happy-dom SVG elements have no click()
- [x] Gates: agent 2989; viewer 1473; TS lint clean; build OK; viewer coverage 95.17/90.95/94.14 (probe-stats 100/97.2/100, probes-view 99.0/87.9/100, probes-main 94.2/83.3/89.5, probes.ts 94.5/89.2/96.9; probes-boot is the 2-line entrypoint, 0% like reports-boot); Python unchanged (1 test needs the mGBA module, missing from the worktree venv)
- [x] COMMIT: `feat(viewer): probes page (design N)` (GREEN) 600d08b3
- [x] Browser proof (runs/reviews/2026-10-20-probes-viewer-e2e/receipt.md): clicks, keyboard, lane switch, arm-blind, plot, hash, frame load, live refresh then polling stop, at 1280/1440/375, no overflow, errors or off-host requests. Fix from the proof: a turn whose call is found is cached by (log, turn) alone, so a growing source log is not rescanned on every 5 s refresh (test added). Plan was: scratch viewer on a scratch runs root holding a copy of the cited-destination probe and its 5 source runs' needed files. Clicks (case, sample, lane, arm-blind, plot) and screenshots at 1280/1440/375, saved under `runs/reviews/2026-10-20-probes-viewer-e2e/`

**M3: land**
- [x] Sync with main (merge 81918993 of main 563cbaad), gates on the tip: build OK; agent 3013, viewer 1475; TS lint clean, ruff clean, mypy clean (main venv); viewer coverage 95.16/90.95/94.14; Python 3014 pass + 1 needing the mGBA module (missing in the worktree venv, unrelated)
- [x] Guard deletions went red, then restored: pointer realpath jail (new test: a pointer through a symlink that leaves runs/), run-id check, INV-1 group filter, thinking escape
- [ ] Review: Claude, Grok and GPT cloud lanes on one frozen packet
- [ ] Land ff-only; `just test` on main
- [ ] Register cited-destination-v1 at `runs/probes/` (data, not git)
- [ ] Coordinate `just viewer-main`; prove /probes live on 8790

## Closing the Loop

The proof is /probes on the live 8790 viewer showing cited-destination-v1 with all three lanes, with clicks verified at desktop and phone widths.

## Session Log

- 2026-10-20 8:35 PM: coordinator cannot hold main (story-progress-clock-v1 holds the landing slot; this branch is next). Review proceeds; landing will ask for the slot, then sync, gates and land.

- 2026-10-20 8:15 PM: worklog written after the operator's pick (design N) and "execute the worklog".

## Surprises

- A fresh worktree needs `git submodule update --init` and the main venv for mypy/pytest (no mGBA binding in the worktree's uv venv).

## Multi-Model Review Log

- Round 1 (packet 6fc5ee9f, head 2b7b41ac, base main 563cbaad; files under runs/reviews/probes-viewer/):
  - Lanes:
    - Claude: claude -p (default login) failed with OAuth expired; Cursor Opus and Sonnet are usage-capped. Ran a read-only Claude subagent, per the operator's standing word (memory claude-review-lane).
    - Grok: Cursor cursor-grok-4.5-high.
    - GPT: Cursor GPT-5.6 is usage-capped; Codex gpt-6.1-sol was rejected for a ChatGPT account.
  - Verdicts: Grok BLOCKING, Claude BLOCKING, GPT no verdict.
  - Fixes:
    - (B1, both lanes) A non-integer or negative `sample` passed the server but failed the page's parser, hiding the whole probe. The server now lists such lines as problems; a test round-trips readProbe output through parseProbe.
    - (B2, Claude) Ungraded samples counted as non-departures in every rate. They now count in no denominator, and an all-ungraded case says "Ungraded.".
    - (hardening, both) Lanes must be real folders, never links (test).
    - (hardening, Claude) Invalid timestamps render as — instead of throwing.
    - (hardening, Claude) A refresh reply for a probe the user switched away from is dropped.
  - Rebutted: PB12 wording (the evidence names the path jail; no TCC paths are touched, which is the PASS reason). turnCache growth and turn-restart speculation: follow-up.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
