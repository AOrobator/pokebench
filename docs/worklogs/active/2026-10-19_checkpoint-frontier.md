# Checkpoint starts on the Frontier

The operator requests missing runs that reached Rustboro, with Clock set style not-from-zero provenance, two self-review rounds and landing on main. This explicitly replaces the usual cloud review requirement for this change.

Evidence: the missing Oct 19 runs load PETALBURG_CITY.state; the old loader recognizes only MAIN_MENU.state and CLOCK_SET.state. The plot also hardcodes the Clock set origin.

Plan: recognize exact known story-checkpoint filenames; show dashed hollow series from each checkpoint onward; preserve fresh-start record selection; label tooltips, details, plates and legend. No harness behavior changes.

Validation and self-review receipts pending.

## Self-review round 1
Reviewed loader, series eligibility, clipping, scale, live marks, record selection and legends. Found that a live later-save run with only recovered pre-save Clock set data could zoom before its own checkpoint and falsely suppress the waiting label. Fixed zoom lower bound to include the saved checkpoint and applied the same clipping to the waiting label. Added a regression. No earlier points or synthetic zero-time completion are added.

## Self-review round 2
Reviewed the complete diff for provenance, escaping, fresh-start record contamination, exact filename boundaries, current/overlay deduplication, sparse splits and responsive origin tags. Recognition is an allowlist from the existing required-story axis, labels use escaped canonical names, and fresh-start ranking remains unchanged. Unknown saves remain unclassified. Added Petalburg/Rustboro plate and detail tests. No remaining blocking findings.

## Validation
- RED: four new checkpoint regressions failed against old source (plus an unrelated transient server-human test); GREEN full viewer suite passes. Final: 1203 viewer tests, 2529 agent tests; viewer coverage lines 97.65%, branches 91.38%, functions 93.88%; agent 99.25/94.14/98.32. TypeScript lint/build pass. Python unchanged: 2492 passed, 229 ROM-dependent tests skipped without POKEBENCH_ROM; coverage 96.96/92.48/99.44. Python ruff/format/mypy pass using canonical environment.
- Real-data read-only before/after: all eight Petalburg-save runs previously ineligible become eligible; zero duplicate identities; record remains 2026-10-18T07-32-23_qwen36-gpu1_4865 in the captured snapshot. wholemap-probe-a has the native Rustboro split (22:47.284, seq 5434). Full archive scan was still filling; comparison is explicitly the captured 78-run snapshot plus re-read affected logs.
- Experiments audit prints nothing.
- Browser on candidate 8808 with isolated copies of eight real logs: dashed/hollow Petalburg and Clock set series, both origin rules; clicked Rustboro and confirmed exact selected checkpoint, save notice and settings; pointer FULL BASELINE then keyboard FRONTIER; multiple polling cycles retain points. Opened desktop and phone screenshots at configured 1280/1440/375 sizes and expanded phone legend; no page overflow. Evidence: canonical runs/mockups/checkpoint-frontier/shots/. Candidate omits human baseline assets; live verification follows landing.
- PB1-PB13: evidence stays native and logs untouched; no benchmark benefit claim, gameplay change, new dependencies or hidden fallback. Work isolated in its own branch/worktree. Two self-reviews explicitly authorized by the operator.

## Landing receipt
Implementation landed fast-forward as fca4f69b. Viewer-main refreshed successfully on Oct 19 at approximately 02:16 EDT, clean served build stamp fca4f69b; both live gameplay processes survived. Browser reload uses the merged implementation. This receipt-only follow-up corrects the Rustboro millisecond timestamp against the actual split (1,367,284 ms); reviewed twice for evidence accuracy and scope.
