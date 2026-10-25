# Restore milestone display after a clock warning

Authorized outcome: user said "fix it" after the card incorrectly reported no milestones. Preserve native-validated milestones for presentation while retaining the clock warning, exclusion from timing competition, deleted grading measurement and strict timing-reader rejection. No card design, schema, recorder, recipe, timeline, game control or source-recording changes. Active runs/controllers must not be interrupted or restarted.

Production boundary: frontier-recording.ts and workbench-store.ts only. Keep the existing qualified-native milestone predicates and incremental tailer. Tests must traverse reader -> loader -> card facts and prove no frontier/timing admission, before and after the clock anomaly. The prior repair conflated earned progress with trusted split timing; this patch corrects that regression rather than inventing milestones.

Single milestone: RED tests, GREEN, full gates, read-only real-data headless browser proof, frozen independent review, serialized landing and one coordinated viewer-only refresh. Existing standing Grok waiver and current repair authorization apply if the cloud lane remains quota-blocked; preserve real available Claude/GPT approvals and distinct-model fallback review. No new confirmation needed for already authorized work.

- [x] RED: restored milestone expectations fail at reader and both loader callers; existing no-measurement assertions retained. Receipt /tmp/milestone-red.log.
- [ ] GREEN
- [ ] Gates and browser proof
- [ ] Review
- [ ] Landing/live proof
