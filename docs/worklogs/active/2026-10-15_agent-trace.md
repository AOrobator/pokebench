# Agent trace + Emerald thinking box (2026-10-15)

Branch `claude/agent-trace`, worktree `/private/tmp/pokebench-agent-trace`.

## Problem Statement

Operator picked thinking-view mockup 20 (`runs/mockups/thinking-view/round3/20-newest-first.html`) to build in the real viewer, with one change: the milestone row uses a real star icon (inline SVG), not a `★`/`*` text glyph.

The agreed design:

- **Side panel:** the current turn's thinking sits on top in an Emerald text box, always expanded and streaming. Below it are earlier agent steps, newest first, as uniform rows.
- **PokéNav AGENT TRACE page:** replaces ACTIVITY HISTORY.
  - It keeps every event type, including emulator rows, and keeps seq order within a turn.
  - Clicking a row shows its raw event in the inspector.
  - Turns are listed newest first, and the live turn opens on its thinking.
- **Uniform rows:** every row is the same size and style, including supervisor, milestone, retry and loop guard. Click a row to expand it. Tool results fold under their call and can be folded on their own.
- **Filter chips:** chips with counts sit at the top of the trace (emulator off by default), next to COLLAPSE ALL and EXPAND ALL. There is no search box.
- **Experiment strip:** an experiment / arm / trial strip goes in the header.

This is a viewer-only change. It does not touch what the model sees, so it needs no feature switch.

## Skills Loaded

- feature-worklog
- viewer-e2e: verify real clicks on a separate port
- agent-observability: trace rows must still show every recorded diagnostic

## Architecture

- **New `packages/viewer/src/trace.ts`:** pure functions, no DOM.
  - `traceTurns(events)` groups `RunEvent`s into turns. Within each turn, events keep seq order. A tool call carries its `button_press` and `tool_result`.
  - Every other event type becomes its own step, and its text falls back to the existing `rowBody`. That keeps nothing that ACTIVITY HISTORY showed today from being lost.
  - Each step gets a category for the chips.
  - `traceRow(step)` renders the uniform row HTML. `traceHtml(turns, filter, opts)` renders the page, newest first. `chipCounts(turns)` returns the counts. `STAR_SVG` is the milestone icon.
- **`panels.ts`:**
  - `thinkingDialog` stays the source for the Emerald box.
  - New `sideTrace(view)` renders the earlier rows, newest first, with no emulator or memory rows.
  - New `runIdentity(view)` renders the experiment / arm / trial strip.
- **`app.ts`:**
  - Renders the trace page and side rows on each render, but only when the event count changes.
  - Open/closed state is kept across rerenders by step key (the first seq).
  - Chip state and inspector selection are kept the same way.
  - The current ACTIVITY HISTORY log, `renderLog` and `actionRow`, is removed along with its tests. The inspector is reused.
- **`static/index.html` + `style.css`:** restructured side panel, AGENT TRACE nav page, uniform row CSS taken from the mockup, Emerald box CSS.

## Invariants

- **INV-1:** every event type that `actionRow` rendered before also appears in the trace.
  - Why: replacing ACTIVITY HISTORY must not drop diagnostics.
  - Test: a table test over a fixture with every `RunEvent` type. Each type must appear as a step or inside its tool call.
- **INV-2:** within a turn, steps follow seq order. Only the turn order is reversed for newest first.
  - Test: seq order assertion.
- **INV-3:** the supervisor row has the same markup shape and classes as any other row. The only difference is the icon.
  - Test: snapshot of the class list and no special background class.
- **INV-4:** the milestone icon is an inline SVG with no `★` or `*` text.
  - Test: markup assertion.
- **INV-5:** live updates keep the rows the user opened open.
  - Test: an app test that opens a row, feeds more events and checks the row is still open.
- **INV-6:** the current turn's thinking is always visible and expanded. It is not a `<details>` element.
  - Test: markup assertion.

## Security Review

Every recorded string goes through `esc`. Tool result text is shown in `<pre>` only after escaping. No new endpoints and no network requests.

## Milestones

**M1 — Trace model + row rendering (`trace.ts`)**
- [x] Write tests:
  - grouping
  - seq order
  - every event type covered
  - chip categories and counts
  - uniform supervisor row
  - SVG star
  - collapsible tool result
  - escaping
- [ ] COMMIT: `test(viewer): agent trace model and rows` (RED)
- [ ] Implement
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage` (≥90)
- [x] COMMIT: `feat(viewer): agent trace model and uniform rows` (GREEN) (af6a3fb)
- [ ] Review round 1 (032d206..af6a3fb): Claude CLI BLOCKING, Grok 4.5 BLOCKING. Findings and fixes are in the Multi-Model Review Log.
- [ ] Review

**M2 — AGENT TRACE page replaces ACTIVITY HISTORY**
- [x] Write tests (also migrated 11 app tests from `ui("log")`/`.ev`/`data-seq` to `ui("trace")`/`[data-key]`/`data-seqs`; added loop-label unit test). RED: 17 failing:
  - chips toggle, with counts
  - newest first
  - row click fills the inspector
  - open state survives live updates
  - collapse all / expand all
  - nav button renamed
- [x] COMMIT (RED): `test(viewer): agent trace page replaces activity history` (dbcaf25)
- [x] Implement:
  - `app.ts`: `renderTrace`, `replacePreserving`, chip/collapse/expand/more handlers, `inspectRow` shows every grouped event
  - `index.html`: AGENT TRACE nav button first, `page-trace` replaces `page-activity`
  - `style.css`: `.ev`/`.history-note` rules replaced by trace row + chip rules
  - `actionRow` removed; its tests moved to `eventText` + `test-support/trace.ts` `stepOf().status`
  - `trace` added to `BROWSER_MODULES`
- [x] Gates:
  - build ok; `pnpm -r lint` clean
  - agent 1066 passed; viewer 615 passed (95.2/91.0/94.3), `app.ts` 95.1/84.9/94.6, `trace.ts` 99.3/92.9/100
  - Python unchanged since M1 (1877 passed)
- [x] COMMIT (GREEN): `feat(viewer): agent trace page replaces activity history` (6bd997c)
- [x] Review round 2 (032d206..92f27d6): Claude BLOCKING, Grok BLOCKING. Fixed in `fix(viewer): stable live trace updates and review round 2` (see the log)

**M3 — Side panel Emerald box + earlier rows + identity strip**
- [x] Write tests (`runIdentity` unit test; app: Emerald box on top, side rows newest first without memory/run rows, side row → inspector, FULL TRACE link, identity strip). RED: 4 failing:
  - live thinking streams into the Emerald box, always expanded
  - earlier rows newest first, without emulator or memory rows
  - identity strip for experiment, preset and plain runs
- [ ] COMMIT (RED)
- [ ] Implement
- [ ] Gates
- [x] COMMIT (GREEN): `feat(viewer): emerald thinking box, earlier steps and run identity strip` (b6a2062)
- [x] Review round 3 (whole branch): both BLOCKING, fixed. Round 4 runs on the fix.

**M4 — Browser verification + explainer**

Browser verification so far, at 1440×900:
- Setup: a viewer built from the worktree on 127.0.0.1:8797 (`startViewer` with no autorun and no queue), reading symlinks to three real runs. The 8790 viewer and the experiment chain were untouched.
- Live run `…21bc`:
  - the Emerald box streams the current turn
  - the trace's live row streams
  - real clicks: THINKING/ACTIONS chips toggle; a press row expands to its full result; folding the result alone works; a supervisor row expands like any other; the inspector shows the grouped raw events
  - the list holds still while the pointer is over it
- Finished run `…c0b8`: replays; side panel reads FINAL.
- [ ] Separate viewer on its own port against a real run, including a live run streaming its current turn, at 1440x900. Real clicks:
  - a chip
  - a supervisor row
  - a tool result fold
  - the inspector
- [x] Screenshots page and explainer HTML (zero network) under `runs/mockups/agent-trace/`, served at http://127.0.0.1:8791/agent-trace/
- [x] Review: Claude lane plus the Cursor Grok lane, 8 rounds; LGTM from both on bc1f66c. Per the operator's brief, the local inference lanes were skipped.

## Closing the Loop

- [ ] ASK USER: merge `claude/agent-trace` into main
- [ ] ASK USER: restart the 8790 viewer on main

## Session Log

- 2026-10-15: worklog drafted from mockup 20; operator approved ("ok", 06:05Z). M1 RED: `src/trace.test.ts` fails to load (no `trace.ts`, no `eventText` export).

## Surprises

- **Live rebuilds broke clicks.** Rebuilding the whole trace on every event lost real clicks in the browser: the clicked element was replaced between mousedown and click. That happened on a live run several times a second, and the chips were rebuilt too. The fix:
  - Turn-level stamps, so only turns whose rows changed are redrawn.
  - Chip buttons built once, with counts updated in place.
  - A scroll anchor on the row being read.
  - Lists hold still while the pointer is over them.
- **1440×900 was cramped before this branch.** On `main` at that size the side panel's thinking box gets about 80px and spills onto the timeline: the splits table takes about 220px. Mockup 20 had no timeline and only split chips. The fix:
  - The side panel shows the split chips; the times-vs-best table folds under "SPLIT TIMES VS BEST" (the SPLITS page still has the full table).
  - The identity strip is one compact row.
  - `.side` scrolls instead of overflowing.

- The fresh worktree had no vendor submodule (`git submodule update --init` fixed 5 pytest failures) and no mGBA binding in `env/.venv`, so `just lint`'s mypy step can't import `mgba._pylib`. I ran mypy with `~/dev/pokebench/env/.venv/bin/mypy` from the worktree's `env/` instead. No Python changes on this branch.

## Multi-Model Review Log

**Round 8 (032d206..bc1f66c): Claude LGTM, Grok LGTM.** Review loop clean.

DEFERRED minor follow-ups, none of which loses information or affects correctness at normal use:
- a wheel inside a scrollable child (live thought box, long result) or at the top cancels the snap back; the `scroll` comparison alone may suffice
- `reconcile` records its position even for a 0px shift
- the mirror's echo toggle costs one no-op pass
- a replay rewind clears `RowState` even though seq keys survive
- a stale comment ("not one reconcile made")
- a clamped `scrollTo` value could cancel a hold when the browser fires scroll synchronously
- `touchmove` cancel is untested
- the bulk toggle isn't asserted on the side list
- the test's `scrollTop` descriptor isn't restored
- `sideHtml` re-describes on each side redraw (by design, 30 turns)

**Round 7 (032d206..e71f9f0)**

Claude: **LGTM** (minor items).

Grok: BLOCKING. The viewer recorded its own scroll position only after setting `scrollTop`. A browser that fires `scroll` synchronously would cancel the hold-at-top, and the test only fired `scroll` afterwards.

Fixed in `fix(viewer): agent trace review round 7`:
- `scrollTo(list, top)` records the position before setting it, then records the clamped value. `reconcile` and the snap back both use it.
- The test list's `scrollTop` setter fires `scroll` synchronously. The test also covers the late scroll event after a snap back and the reader's wheel cancelling the snap.
- `wheel`/`touchmove` cancel the snap too.
- COLLAPSE/EXPAND ALL loop over both lists. The test now blocks toggle events, so the per-row record is really what keeps the state (correcting my round-6 note that this couldn't be shown in happy-dom).
- The mirror searches only the other list. Test added for a folded result.
- Guards deleted once, each test went red, then restored:
  - order of record vs set (1 red)
  - bulk record (1 red)
  - wheel (1 red)
  - no own-scroll record (1 red)
- Gates: viewer 642 passed (95.4/91.1/94.4), agent 1066 passed, lint clean, build ok.

**Round 6 (032d206..19a273a)**

Grok: **LGTM** (minor items only).

Claude: BLOCKING. Round 5's claim that the scroll comparison was guarded was wrong: my deletion check had disabled the cancel itself rather than removing the comparison, so no test covered ignoring a redraw's own scroll. Correction recorded here.

Fixed in `fix(viewer): agent trace review round 6`:
- New test: hold at the top → a redraw shifts `scrollTop` → its `scroll` event is ignored → mouseleave snaps to 0. Replacing the comparison with an unconditional cancel turns it red.
- COLLAPSE ALL / EXPAND ALL record row state per row, with a test that both survive a redraw. happy-dom fires toggle synchronously, so removing the per-row record can't be shown red there; the race exists only in browsers.
- `autoScroll` set to 0 on the snap back.
- Copies of a row on the trace page and side panel mirror each other, from the toggle event only (mirroring from the click fought the native toggle and was caught by 2 tests). Disabling the mirror turns its test red.

DEFERRED (Claude r6 #5): after many SHOW OLDER clicks, `anchorOf` and stamp building scale with the turns on screen. That only bites with thousands of turns opened by hand; revisit if someone pages that deep on a live run.

Gates: viewer 642 passed (95.3/91.1/94.4; `app.ts` branches 86.0), agent 1066 passed, lint clean, build ok.

**Round 5 (032d206..62b4c67)**

Claude: **LGTM**. It verified the round-4 fixes and judged the deferral acceptable.

Minor items, fixed in `fix(viewer): agent trace review round 5`:
- side rows no longer cached (the cache held a second copy of results)
- the toggle race really is fixed now: row state is recorded on the summary click, before the queued toggle event; the test cancels the native toggle to isolate it, and removing the recorder turns 1 test red
- any user scroll (touch included) cancels the snap back to the top, instead of wheel/keydown; it compares against the scroll reconcile set itself, and disabling the check turns 1 test red
- the mirror loop was removed

Grok: the Cursor connection was lost three times (`RetriableError: [unavailable]`), so I re-ran it on the final head.

Gates: viewer 639 passed (95.3/91.1/94.4), agent 1066 passed, lint clean, build ok.

**Round 4 (032d206..73d7a12)**

Claude and Grok, both BLOCKING on the same regression: the side list redrew only on trace version bumps, so when `turn_start` moved the Emerald box on, the previous thought vanished from both panels until thinking ended.

Minor:
- side rows re-described entries and re-held the step
- leaving a list after scrolling could snap to the top
- a toggle racing a redraw could lose state
- (Grok) hidden events still bump the version, so groups are recomputed (but not redrawn)

Fixed in `fix(viewer): agent trace review round 4`:
- the side list redraws when `boxTurn` changes (`sideBox`), with an app test feeding `turn_start` after an answer; reverting the fix turns 1 test red
- `Entry.sideHtml(gutter)` caches the side row
- wheel/keydown/scrollbar pointerdown cancel the snap back to the top (test)
- the toggle handler syncs every copy of the row

DEFERRED (Grok r4 #2): hidden-category events still bump `version`, so `traceGroups` runs one O(turns) pass per event. Stamps already prevent any DOM change, and the pass is cheap next to the stream parse, so a separate dirty flag isn't worth the extra state now.

Gates: viewer 638 passed (95.3/91.1/94.4), agent 1066 passed, lint clean.

**Whole branch round 3 (032d206..ce40d70)**

Claude (BLOCKING):
- `navigate_to` showed only its first press, titled as a press
- O(all turns) filter per update
- step + row caches double-held result text
- open state lost on newly created groups
- a hover hold at the top never released
- turn times included pauses
- `panels.ts` chip didn't escape the button
- unsorted chip key

Grok (BLOCKING):
- stamps bumped by hidden rows (hidden emulator events still redrew the live turn)
- the stamp test didn't cover hidden rows
- chip escaping
- the side list repeated the Emerald box's thought
- unsorted key

All fixed in `fix(viewer): agent trace review round 3`:
- every press listed, `· N presses` in the desc
- stamps built from visible entries only (`TraceTurn.version` removed)
- turns past the limit counted with `some`
- step cache dropped once the row is built
- app-level `RowState` (open/folded/selected) applied to every drawn turn, recorded from `toggle` events
- mouseleave returns a top-held list to the newest turn
- pause-aware `elapsed` passed in
- `esc(button)`
- sorted key
- `sideGroups(…, boxTurn)` skips the thought the box shows
- Guards deleted once, each test went red, then restored: state on new turns (1 red after making the chip test hide the whole turn), side dedupe (2 red), visible stamps (1 red), press title (1 red)
- Gates: viewer 638 passed (95.3/91.1/94.4); agent 1066 passed; lint clean
- Browser on live run `…939e`: 21 rows in on-screen turns kept their elements through 10 s of live updates; a `navigate_to` row reads "2 presses"

**M1+M2 round 2 (032d206..92f27d6)**

Claude (BLOCKING):
- the scroll fix wrongly assumed every change happens above the reader (SHOW OLDER, chips)
- SHOW OLDER label wrong after the first click
- `harness_bug` hidden behind EMULATOR
- whole-trace rebuild per hidden event
- unchecked chip cast
- chip focus lost
- guard message printed twice
- live thought not following its text
- no scroll tests

Grok (BLOCKING):
- `innerHTML` wipe at 10 Hz
- INV-3 compared against an error row
- orphan body not asserted
- `eventText` used only as a visibility check
- reuse test misnamed
- empty answer gets an empty `<details>`
- `harness_bug`

All fixed:
- `traceGroups`/`sideGroups` with per-turn stamps; `reconcile()` redraws only changed turns and anchors the reading row
- pointer hold; chips built once
- `harness_bug` → ERRORS
- `moreButton(more, page)`
- chip id lookup instead of a cast
- loop label without the message
- live text follows (fixed-height live box)
- `showsInTrace` type set, with a parity test against `eventText`
- empty body → null
- INV-3 compares a recovered guard and checks for no pill
- tests: scroll anchor and pointer hold (deleting the anchor turned 1 test red; deleting reuse turned 2 red), stamps, more label, orphan body, empty answer

**M1 round 1 (032d206..af6a3fb)**

Claude CLI (BLOCKING, 11 findings):
- INV-1 test doesn't cover all types
- per-render rebuild cost
- unescaped tool-name icon
- html/plain field naming
- loop-guard error status lost
- `#seq` and "first observed" lost
- orphan tool_result body
- `tools` map growth
- "Replied" on an error-only answer
- magic-number test
- INV-3 test only compares the outer class

Grok 4.5 (BLOCKING, 7 findings, overlapping):
- `activity` hidden behind the EMULATOR chip
- loop-guard attribution lost (already added in M2 via the `TraceBuilder` labeler)
- more escaping tests

All are fixed in `fix(viewer): address agent trace review round 1`:
- Exhaustive `SAMPLES` table, typed by `RunEvent["type"]`, checking:
  - shown/hidden parity with `eventText`
  - default-chip visibility
  - escaping of every string
- Steps cached per entry and invalidated on push. `traceHtml` builds HTML only for the turns on screen (2,000-turn test). Summaries clipped to 300 chars.
- Icon escaped. Fields renamed to `iconHtml`/`titleHtml`/`summaryHtml`.
- Guards flagged as errors again when unrecovered and enforced. The supervisor row stays plain: this is an operator design decision, recorded here.
- Rows show `#seq`; emulator rows say "first observed". Orphan tool_result gets a full body. Tool map entries are dropped once the result arrives. "Model error" title. Exact-kinds test. INV-3 compares every descendant's class.
- `activity` moved to RUN (on by default).
- Guards deleted once, each test went red, then restored:
  - icon escape (2 red)
  - step cache (1 red)
  - limit skip (2 red)
- Gates: lint clean; viewer 623 passed (95.2/91.0/94.3), `trace.ts` 99.4/93.8/100; agent 1066 passed.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
