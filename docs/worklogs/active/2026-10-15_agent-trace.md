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
- [ ] COMMIT: `feat(viewer): agent trace model and uniform rows` (GREEN)
- [ ] Review

**M2 — AGENT TRACE page replaces ACTIVITY HISTORY**
- [ ] Write tests:
  - chips toggle, with counts
  - newest first
  - row click fills the inspector
  - open state survives live updates
  - collapse all / expand all
  - nav button renamed
- [ ] COMMIT (RED)
- [ ] Implement in app.ts, index.html and style.css
- [ ] Gates
- [ ] COMMIT (GREEN)
- [ ] Review

**M3 — Side panel Emerald box + earlier rows + identity strip**
- [ ] Write tests:
  - live thinking streams into the Emerald box, always expanded
  - earlier rows newest first, without emulator or memory rows
  - identity strip for experiment, preset and plain runs
- [ ] COMMIT (RED)
- [ ] Implement
- [ ] Gates
- [ ] COMMIT (GREEN)
- [ ] Review

**M4 — Browser verification + explainer**
- [ ] Separate viewer on its own port against a real run, including a live run streaming its current turn, at 1440x900. Real clicks:
  - a chip
  - a supervisor row
  - a tool result fold
  - the inspector
- [ ] Screenshots page and explainer HTML (zero network) under `runs/mockups/agent-trace/`, served at http://127.0.0.1:8791/agent-trace/
- [ ] Review: Claude lane plus the Cursor Grok lane. Per the operator's brief, the local inference lanes are skipped this time.

## Closing the Loop

- [ ] ASK USER: merge `claude/agent-trace` into main
- [ ] ASK USER: restart the 8790 viewer on main

## Session Log

- 2026-10-15: worklog drafted from mockup 20; operator approved ("ok", 06:05Z). M1 RED: `src/trace.test.ts` fails to load (no `trace.ts`, no `eventText` export).

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
