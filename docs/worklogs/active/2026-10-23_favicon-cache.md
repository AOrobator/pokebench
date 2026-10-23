# Chrome favicon cache repair

User: Reloading Chrome still leaves the Poké Ball tab icon missing; smallest fix and deploy/restart authorized.

## Scope and invariants
Only version the existing favicon href on five viewer HTML pages; preserve artwork, server routes, gameplay and all other page behavior. Existing server test covers all five declarations and versioned delivery. No new asset/dependency/server behavior. No harness flag or explainer needed for viewer-only metadata.

## Diagnosis
Actual affected Chrome tab 1657055914 at 127.0.0.1:8790 has readyState complete and exactly one correct /favicon.svg link; no viewer errors in captured console. Fresh Chrome 155 downloads original icon and stores 16/32px bitmaps. In an isolated Chrome profile, reproduced negative caching: initial404 is requested once; changing server to200 and ordinary reload makes no request; changing link to /favicon.svg?v=2 immediately fetches again. Original profile cache cannot be inspected through available read-only browser tools, so negative caching is a supported diagnosis, not direct inspection of that cache. Receipt /private/tmp/pokebench-favicon-diagnostic/cache-repro.json; reproduction script alongside it. Earlier image-decode check did not prove a tab icon.

## Milestone
- RED: existing favicon test fails at index.html: expected versioned href, received unversioned href. Setup-only missing dist was resolved by build before this assertion failure.
- GREEN, gates, review, landing and live proof pending.
