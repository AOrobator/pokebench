# Story Frontier run date range

User request: compare bundle whole-map and control across separate experiments by an inclusive date range.

Viewer-only milestone: From / Through date inputs, either bound optional, clear action, Eastern run-start dates, combined with existing filters. Preserve global human/frontier references and current-run cards; exclude unknown dates only while a date bound is active. Reversed range shows a validation message and no overlays. No harness/recording/experiment changes.

- [x] RED mounted interaction tests: two new tests failed on absent controls; RED commit 72012958.
- [x] Implementation and focused checks: 27 mounted tests pass; viewer lint/build pass.
- [ ] Gates and real-snapshot inventory
- [ ] Browser clicks, polling and desktop/mobile screenshots
- [ ] Frozen multi-model review; local landing only under repository review rules

Initial binding: main clean; shared 8790 comparisons tab 1657055914 belongs to another browser-control session and could not be acquired. Preserve it; candidate verification will use an owned tab and GET-only snapshot server. Existing 8799 preview belongs to another task and is preserved.
