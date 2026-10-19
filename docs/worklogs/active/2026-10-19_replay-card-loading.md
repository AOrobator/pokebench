# Replay Trainer Card loading

Contract: remove avoidable waits before the selected replay's existing Trainer Card appears. Keep dotless replay state, existing full renderer, live defaults, and full comparisons behavior. Scope: app card request sequencing and workbench partial-card projection only. No new endpoint, cache owner, dependencies, gameplay or event-stream changes. Complete with RED/GREEN, viewer gates, independent subagent review, browser proof and local landing.

Evidence: current main uses `/api/cards?run=` but the app serializes a new selection behind the prior selection's unresolved request. Partial server snapshots omit a cold selected run and cache that empty response for five seconds; the client polls every five seconds. Warm real replay response measured0.4s; this does not prove cold-load time. Deterministic deferred requests will isolate avoidable waiting rather than invent a timing claim.

Principles: PB1-8 N/A viewer-only loading/no result claims; PB9 PASS preserve operator-approved cards and selection; PB10 PASS retain gates and test real callers; PB11 PASS existing typed loader and request contracts; PB12 PASS no ROM edits; PB13 PASS this worklog tracks review/landing/browser separately. No FAIL rows.
