# Reports in the phone bottom sheet (2026-10-20)

The operator: "The reports page also needs to be accessible on mobile, so it should go in the bottom sheet."

Before: on a phone, the run viewer's bottom sheet offered RUNS & COMPARISONS but no way to reach Reports.
After: the sheet's ALL RUNS block ends with RUNS & COMPARISONS ↗ and REPORTS ↗ side by side.

## M1

- [x] RED: run-head.test.ts expects reports-link after comparisons-link in the sheet
- [x] GREEN: gates pass (agent 2833, viewer 1388, Python 2896; lint; coverage)
- [x] Browser check: runs/reviews/2026-10-20-sheet-reports-e2e/receipt.md
- [ ] Reviews and land
