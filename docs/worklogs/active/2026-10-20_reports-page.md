# Reports page

## Problem Statement

The operator wants the run-analysis reports in the viewer: a navigable index, newest first, linked from the stats page (Runs & Comparisons), that opens each full report inside the viewer so it works on a phone over Tailscale. The operator picked round 2, option 2 ("Pokédex list + trainer card"), with the trainer centered on the Poké Ball and no party boxes or party band showing (mockup `runs/mockups/viewer-reports/round2.html#o2`). The operator said "build it" at 12:14 PM EDT 2026-10-20.

## Architecture

- **`reports.ts` (server).**
  - `listReports(runsRoot)` returns every `reports/run-analysis/<YYYY-MM-DD_slug>/index.html`, newest first.
  - Metadata comes from an optional validated `report.json` in the folder: title, kind, verdict, frontier milestone id, facts, trainer. Without it, the title comes from the page's `<title>` and the date from the folder name.
  - `reportFile` resolves a file inside one report folder: segment allowlist, extension allowlist, and a realpath kept inside the folder.
- **Routes.** `/reports` serves the page, `/api/reports` the list, and `/reports/<slug>/<path>` the report's own files.
- **`reports-view.ts` (pure).**
  - The numbered Pokédex list.
  - The detail card: the trainer card's top cut off just above the party band, a type badge per kind, a STORY bar when the report names a frontier milestone, and a plain sheet with the verdict and facts plus OPEN REPORT.
  - The opened view: a slim bar (all reports, newer, older) over the report in a frame.
- **`reports-main.ts` (boot).** The page works without the art: the card falls back to a plain header.
- **Links.** The Runs & Comparisons header links to REPORTS.

No harness change, so no feature switch.

## Milestones

**M1: report list and serving**
- [x] RED ba791db1 / GREEN: listReports (order, metadata, fallback, invalid report.json), reportFile (traversal, symlink escape, extensions), routes /reports, /api/reports, /reports/<slug>/<path>

**M2: the page**
- [x] RED 43ca3db5 + c9628691 / GREEN: list, detail card (trainer on the ball, cut above the party band), type badges, tier and STORY bar, selection, opened view with newer and older, phone order via data-phone, stats-page link. Reports are served sandboxed (their inline scripts run in an opaque origin), and 127.0.0.1:8790 links are rewritten to the viewer's own origin in the top window
- [x] Gates: viewer 1380 (95.11/91.05/93.9/97.71), agent pass, Python 2896 (96.95/92.46/100; needs the .env link in a fresh worktree)
- [ ] Browser proof at 1280/1440/375 on the real reports (read-only)

**M3: land**
- [ ] Reviews (round cap 2), ff-only land, restart, live check
- [ ] report.json for the existing reports (data under runs/); propose the run-analysis skill edit
