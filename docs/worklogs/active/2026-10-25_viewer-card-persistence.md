# Persistent last-known trainer cards

User explicitly requests persisted last-known state across browser refresh and viewer restart so large recordings cannot hide cards while loading. One viewer-only milestone, extending the preceding retained-state repair. Save validated display snapshots using the existing atomic disk-cache owner; serve them only on the card path while fresh reduction runs. Current discovery/health owns live identity. Fresh data and real reset replace saved display data; rewritten/replaced/truncated logs invalidate it. Never use a saved display snapshot for grading/frontier validation. No trainer artwork, protected baselines, gameplay, prompts, tools, new service or launch changes.

Frozen production boundary before implementation: baseline-store.ts (saved display store), workbench-store.ts (persist/recover and card-only fallback), server.ts (production wiring). Tests may cover these adapters and HTTP consumers. No browser storage or separate state owner is needed. Terminate after RED/GREEN, required gates, independent review, queued local landing and focus-preserving live proof. A new persistence format is explicitly authorized by this user request; not review-driven scope expansion.

- [x] RED HTTP restart regression committed.
- [ ] GREEN persistence, freshness and invalidation; gates and background browser proof.
- [ ] Independent review, queued local landing and one coordinated refresh/live proof.

Preflight: existing exact-signature/code-keyed disk cache persists ended runs only. In-memory last-known state already survives missing battle samples and partial responses, but a fresh process cannot recover it while live logs reduce. Shared main is a39ad79b9 at start. Owned worktree reused with new branch codex/viewer-card-persistence. Coordinator notified; shared viewer and gameplay untouched.

RED: production HTTP first viewer loads TorchicLv5, closes, recording grows with empty battle sample, second viewer holds fresh compute. GET/api/cards expected exact saved-live identity but returns[]; one failed regression in869ms, no timing sleeps or weakened assertions. Receipt /tmp/viewer-card-persistence-red.log. COMMIT: restart regression RED.
