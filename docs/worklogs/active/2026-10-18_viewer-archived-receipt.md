# Archived comparison receipt survives checkout cleanup

## Problem

The Runs & Comparisons page shows `Comparison receipt: ENOENT` for the retained `navigation-memory-think-fast-n4` receipt after its original execution worktree was archived. The receipt, ledger, and run logs remain under the canonical `runs/` store, but the loader dereferences the now-absent worktree before reading them.

## Invariants

- A receipt whose original checkout still exists is accepted only when that checkout's `runs` directory resolves to the viewer's run store.
- A receipt from an existing unrelated checkout remains rejected.
- An empty execution root and filesystem errors other than `ENOENT` remain rejected; only a nonempty recorded checkout path that is now absent qualifies as archived.
- A retained receipt may outlive its execution checkout. In that case, accept cohort membership only through its manifest digest, strict ledger order, and each present run's recorded source commit and model identity.
- No receipt, run log, or experiment state is rewritten.

## Milestones

- [x] RED: reproduce the missing archived checkout on the workbench snapshot.
- [x] GREEN: preserve live root-ownership validation while allowing a missing historical checkout.
- [x] Run focused tests, viewer gates, and browser failure/recovery verification against an owned preview.
- [ ] Complete review and land separately from the currently running experiments.

## Session log

- 2026-10-18: Reproduced in the operator's existing 8790 comparison tab. The visible error names `/Users/user/.codex/worktrees/navigation-evidence-memory/pokebench`, while the retained manifest and ledger live under the canonical `runs/launch-receipts/navigation-memory-think-fast-n4/` store. The archived path no longer exists.
- RED: the new retained-receipt test failed with the same `ENOENT` and no cohort. GREEN: a missing execution root is the one accepted archival state; an existing checkout still has to resolve `runs/` to the viewer store, and an existing root with a missing or unrelated `runs/` remains rejected.
- Gates after a clean build: `just test` passed 2,507 agent, 1,182 viewer and 2,709 Python tests; `just lint` passed both TypeScript stacks plus Ruff, formatting and mypy; `just coverage` passed with agent 99.24% lines / 94.18% branches / 98.31% functions, viewer 97.64% / 91.47% / 93.84%, and Python 97.64% / 93.77% / 100%. The first full test attempt was setup-invalid because the fresh worktree had no built viewer modules; `just build` repaired setup and the unchanged test rerun passed.
- Real-data before/after, without mutating the canonical recordings: shared 8790 returned one comparison-receipt `ENOENT`, zero runs in `navigation-memory-think-fast-n4`, and 347 total runs. An owned 8796 preview over a scratch copy of the exact retained receipt and its six run directories returned zero problems and all six runs in the cohort. Served `workbench-main.js` matched the completed build byte-for-byte.
- Browser proof on the owned preview: selected `navigation-memory-think-fast-n4`, waited through more than two polling cycles, and retained the cohort with no comparison-receipt error. Inspected 1280×900, 1440×900 and 375×812 screenshots; no clipping or overflow was introduced. Browser console had no page errors; its warnings came from an unrelated installed browser extension.
- First frozen review packet: GPT returned LGTM, while two independent fallback reviewers blocked. One identified that an empty `root` was incorrectly treated as an archived checkout; the other required performed adversarial guard-deletion evidence. The empty-root finding was fixed and covered alongside a deterministic `ENAMETOOLONG` case proving non-`ENOENT` filesystem errors fail closed.
- Adversarial guard proof on the focused six-test suite: deleting the empty-root guard failed only the new rejection test at its root-error assertion; broadening the `lstat` catch to accept every filesystem error failed the same test on the overlong path; bypassing live checkout ownership failed the existing unrelated-checkout assertion because the root rejection disappeared. Each mutation was restored, after which all six focused tests and viewer lint passed.
