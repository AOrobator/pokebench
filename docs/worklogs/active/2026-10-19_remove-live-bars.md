# Remove legacy live-run bars

The operator explicitly requests complete deletion of the green live-run bars because trainer cards own this display. Single milestone: remove legacy markup, styles, rendering and selection handlers; preserve trainer cards and the Run dropdown, including missing-art fallback. No harness, experiment, run data or playback behavior changes.

- [x] RED: absence assertions fail against existing legacy bars.
- [x] GREEN: remove obsolete picker and migrate its selection checks to the Run dropdown.
- [x] Verify viewer suite, lint/build/coverage and desktop/phone browser proof.
- [x] Operator explicitly authorized landing despite unavailable cloud reviews; fast-forward landing and live check completed.

## Evidence
Existing tab 1657055772 at inference.example:8790 selects 2026-10-19T16-13-42-317Z_qwen36-gpu1_petalburg2h-r6-visited-map and shows four legacy bars. Listener PID 28981 serves build 4ea38e4078f96bf7b0071915d6b3cc1e0a1ef911. The implementation retains bars as fallback when trainer cards cannot be assembled. Complete deletion is the requested correction.

RED receipt: 6 failed / 110 passed across four focused files; absence checks found the obsolete container. Workbench currently reports loading 233/365 recordings; selected live runs not yet in projection.

GREEN: full viewer coverage suite passes 1,230 tests / 85 files. Coverage: 97.72% lines / 91.38% branches / 93.98% functions; lint and recursive build passed. First test attempts preceded agent workspace build, causing import failures; dependency-correct rerun above passed. COMMIT: RED 9e7da378.

Principles self-review saved at /tmp/remove-bars-principles.md; all PB1–PB13 scored PASS or reasoned N/A. No code or domain growth.

## Operator-approved landing and live verification

The operator explicitly approved the concrete reviewed-scope candidate: “yes, land it and restart the viewer”. Claude standalone auth was unavailable; Cursor Claude Opus/Sonnet and GPT hit usage limits; no complete Grok verdict was obtained. This is operator-authorized landing, not normal-roster review approval.

Landed by fast-forward to `65abf6854ed74b9f7d2d8a7b7c97903c485e2004`, matching the frozen diff SHA256 `842db1e02a57d5d601384466f1834b0baa4149cd5b63c7d1471aaf8785fab5d5`. Post-landing `just test` passed 2,567 agent / 1,230 viewer / 2,724 Python tests.

`just viewer-main` built the clean detached viewer at that exact SHA. Its first background child exited when its tool launcher ended; live verification caught the missing listener. Relaunched the same repository restart helper under a detached session. At 12:22 PM EDT, one listener PID 42598 serves 8790 with build stamp `65abf685`, dirty false. The standard gameplay-PID matcher returned none before restart; `/api/runs` afterwards still identifies both current GPU trial IDs and two older dryrun IDs as live. No gameplay commands or run data changed.

Reloaded the operator's original tab 1657055772; selected GPU1 run `2026-10-19T16-13-42-317Z_qwen36-gpu1_petalburg2h-r6-visited-map` reaches RUNNING and uses its `/screen` endpoint. After workbench warmup, two trainer cards are visible and the legacy container count is zero. Screenshot opened and saved at `runs/mockups/remove-live-bars/shots/live-after-restart.png`. Preview checks from the preceding turn covered desktop pointer/keyboard switching, phone sheet switching, polling and missing-art dropdown fallback. Current workbench has no build-skew problem (initial recorded-run warmup was disclosed).
