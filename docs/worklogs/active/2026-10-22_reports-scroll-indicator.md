# Reports scroll indicator

## Problem Statement

The operator (2026-10-22, 1:05 PM): an opened report gives no sense of where you are. The page is locked to the window (c16b1ad92, so the page and the report never both scroll), only the report frame scrolls, and on macOS its overlay scrollbar hides until you scroll. The operator picked design B (Emerald HP bar in the gap between the header and the date bar) with design C's percent readout, and no extra vertical scrollbar (runs/mockups/reports-scroll-indicator/index.html).

## Architecture

The report runs sandboxed in an opaque origin, so the viewer cannot read its scroll. The viewer appends a small script (`reportScrollProbe`) to every report HTML it serves; it posts `{ pokebenchReportScroll: 0..1 }` to the parent on scroll, resize, load and size change. The opened-report view draws a 12px HP bar under the header and a percent in the date bar, and accepts only messages whose source is its own report frame and whose value is a number in [0, 1]. Viewer display only: no switch.

## Invariants

- INV-1: only the opened report's own frame moves the bar; malformed or foreign messages are ignored.
- INV-2: the injected probe is self-contained (runs from its source text alone) and sends only a number.
- INV-3: the page lock stays; no second scrollbar is added.

## Security Review

The probe sends one number to `parent` with target `*`; it carries no report content. The parent checks `event.source`. Report CSP and sandbox are unchanged.

## Milestones

**M1 — Scroll indicator**
- [x] Tests (RED): 8 failing (view 4, probe 3, server 1)
- [ ] Implement (GREEN)
- [ ] Gates: `just test`, `just lint`, `just build`, `just coverage`
- [ ] Headless desktop and phone proof on a candidate viewer
- [ ] Review: Claude and GPT lanes (Grok not needed, per coordinator brief)
- [ ] Land, viewer-main, live check

## Multi-Model Review Log
