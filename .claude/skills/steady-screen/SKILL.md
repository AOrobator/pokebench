---
name: steady-screen
description: Keep the screen still when PokeBench viewer content auto-updates, so a poll, stream, timer or late fetch never moves the reader's scroll position, focus or open sections. Use when adding or changing any viewer surface that redraws by itself, including PokéNav pages, lists that gain rows, cards and comparisons; not for redraws the reader asked for by clicking.
---

# Steady screen

Operator rule (the operator, 2026-11-05): if something is auto-updating, the screen does not jump around. The operator often reads on a phone, so a surface is not finished until it holds still in Safari's engine as well as Chromium.

Only the reader moves the reader. A click, a tap, a key press, a picked run or an explicit "jump" control may scroll or move focus. A poll, stream event, clock tick, late fetch or viewer restart never may.

## Why this keeps coming back

- 2026-10-25, `docs/worklogs/active/2026-10-25_viewer-scroll-refresh.md`: the party page restored focus without `preventScroll`, so a live update pulled the page down to PokéNav.
- 2026-10-25, `docs/worklogs/active/2026-10-25_viewer-refresh-scroll-audit.md`: card focus, closing disclosures, the probes reader and the version list. That audit proved panes with fixed content, and later pages were never held to it.
- 2026-11-05, `docs/worklogs/active/2026-11-05_viewer-scroll-steady.md`: the splits race is newest first, so a new milestone pushed the row being read down 235px on desktop and 308px on a phone, while `scrollTop` never changed. A pane-offset check would have called that a pass.

## Rules

1. **Hold the row, not the number.** `scrollTop` staying the same proves nothing when rows arrive above the reader. Put the row they were reading back where it was.
2. **Do not rely on the browser.** Safari has no scroll anchoring, and Chromium's loses its anchor when `innerHTML` replaces the row.
3. **Use `steady-scroll.ts`.** Call `readPlace` before the first real change and `returnToPlace` after the last one. A reader at the top stays at the top, so `readPlace` holds nothing there. Give readable rows `data-keep` and controls `data-focus`, with values taken from data (a milestone name, a badge index), never from a list position. `renderRace` in `app.ts` is the pattern.
4. **The list outranks the panels.** The anchor is the first visible keyed row. Mark a whole panel with `data-keep-box` so a list row beats it, because holding a panel above the list would let the rows move. In a multi-column layout, a static column earlier in DOM order stays unkeyed, as the race rail is.
5. **Never blank what is on screen.** A refresh of the same run keeps the last page until new data arrives. An empty page collapses the pane and the browser clamps the scroll to the top. Show "Loading" only for a run that has not painted yet, and clear the page if the run is gone.
6. **A refresh is not a new selection.** Filters, folded sections, open details, selected tabs and focus survive a same-run refresh. Reset them only when the run changes. Nothing folds by itself either: a section open by default stays open once shown, as `openLegs` does when a badge moves the race on.
7. **Skip what did not change.** Compare before writing the DOM (`setHtml` does), and do not write `scrollTop` when nothing moved, because that stops a touch scroll's momentum.
8. **Restore focus with `{ preventScroll: true }`.** Bare `focus()` and `scrollIntoView` belong only in code a click started.
9. **Reserve space for late content.** A ticking clock or changing sentence that wraps differently moves everything below it. Images and async panels need a fixed box, or a keyed row below them.
10. **Follow modes are opt-in.** Thinking and trace may follow the newest text only while the reader is at the live edge, and they stop as soon as the reader scrolls away.

## Testing

**Unit:** the logic lives in pure helpers tested in memory. happy-dom has no layout, so stub `getBoundingClientRect` as `steady-scroll.test.ts` does. No test does I/O.

**Browser:** follow `viewer-e2e`, headless only, and never take desktop focus. Waiting and hoping is not proof, because a live run can go minutes without the update that moves the page. Force it:

1. Open the page in Playwright against a live run at a desktop size and a phone size (390 wide, `isMobile`), in both `chromium` and `webkit`.
2. Scroll the document and the pane so the reader sits mid-list, and record one specific row by its text, not by position.
3. Sample that row's `getBoundingClientRect().top` on every animation frame.
4. Use `page.route` to change the polled answer, such as adding entries to the run's `splits` in `/api/cards`. This stays inside the test browser and writes nothing.
5. Wait through two polls. Confirm the new rows arrived, then require the tracked row to have moved no more than 1px.

Run that first on the old build so the failure is on record. To try a branch before it lands, route the changed `/app/*.js` modules to the branch's `packages/viewer/dist`, rewriting `@pokebench/agent/<name>` imports to `./<name>.js` as the server does.

Also check that the reader's filter, folds and focus survive, that a click on a jump control still scrolls, that a page at the top stays at the top, and that the page opens at the top the first time. Force the largest update too, such as a badge landing while the reader is in that leg.
