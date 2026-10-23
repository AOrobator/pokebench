# Chrome favicon cache repair

User: Reloading Chrome still leaves the Poké Ball tab icon missing; smallest fix and deploy/restart authorized.

## Scope and invariants
Only version the existing favicon href on five viewer HTML pages; preserve artwork, server routes, gameplay and all other page behavior. Existing server test covers all five declarations and versioned delivery. No new asset/dependency/server behavior. No harness flag or explainer needed for viewer-only metadata.

## Diagnosis
Actual affected Chrome tab 1657055914 at 127.0.0.1:8790 has readyState complete and exactly one correct /favicon.svg link; no viewer errors in captured console. Fresh Chrome 155 downloads original icon and stores 16/32px bitmaps. In an isolated Chrome profile, reproduced negative caching: initial404 is requested once; changing server to200 and ordinary reload makes no request; changing link to /favicon.svg?v=2 immediately fetches again. Original profile cache cannot be inspected through available read-only browser tools, so negative caching is a supported diagnosis, not direct inspection of that cache. Receipt /private/tmp/pokebench-favicon-diagnostic/cache-repro.json; reproduction script alongside it. Earlier image-decode check did not prove a tab icon.

## Milestone
- RED: existing favicon test fails at index.html: expected versioned href, received unversioned href. Setup-only missing dist was resolved by build before this assertion failure.
- GREEN: five hrefs now use /favicon.svg?v=2; existing favicon test passes and serves both legacy paths plus the versioned path. No artwork or server changes.
- Actual viewer browser proof: isolated startViewer, scratch static/app/runs copies, actual Chrome155. First intercepted old URL404; normal reload after restoring server does not refetch; applying only candidate index href and normal reload requests versioned icon200. Chrome favicon database in this isolated test profile stores correct16px and32px PNGs, visually inspected. Receipt /private/tmp/pokebench-favicon-diagnostic/actual-viewer/receipt.json. No original-profile cache edit or desktop focus change.
- Initial setup failures: test run without local .env had245 ROM-setting failures; configured checkout with ignored .env link to canonical existing settings. Next stock test run hit one unchanged live-world-features5s timeout. Subsequent just test passes: agent4053, viewer1747, Python4050. No tests/timeouts/skips changed. just lint, just build, just coverage, just verify-vendor pass. Coverage lines/branches/functions: agent99.13/92.93/97.61; viewer98.01/91.51/95.10; Python97.37/93.30/100.
- Synced main e24abb6a4 (party-state viewer changes only); agent/Python source unchanged. Rechecked affected viewer coverage/tests, lint and build on combined tree. First synced viewer coverage hit unchanged server-stream malformed-lines5s timeout; stock recheck passes1752 tests, coverage98.01% lines/91.53% branches/95.10% functions. Synced viewer lint and full build pass. Initial all-stack receipts under /private/tmp/pokebench-favicon-diagnostic/gates.
- Reviews, board landing, coordinated restart and live versioned-icon proof pending.
