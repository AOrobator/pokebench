# Remove legacy live-run bars

The operator explicitly requests complete deletion of the green live-run bars because trainer cards own this display. Single milestone: remove legacy markup, styles, rendering and selection handlers; preserve trainer cards and the Run dropdown, including missing-art fallback. No harness, experiment, run data or playback behavior changes.

- [x] RED: absence assertions fail against existing legacy bars.
- [x] GREEN: remove obsolete picker and migrate its selection checks to the Run dropdown.
- [ ] Verify viewer suite, lint/build/coverage and desktop/phone browser proof.
- [ ] Cloud review, local landing and live check subject to repository gates.

## Evidence
Existing tab 1657055772 at inference.example:8790 selects 2026-10-19T16-13-42-317Z_qwen36-gpu1_petalburg2h-r6-visited-map and shows four legacy bars. Listener PID 28981 serves build 4ea38e4078f96bf7b0071915d6b3cc1e0a1ef911. The implementation retains bars as fallback when trainer cards cannot be assembled. Complete deletion is the requested correction.

RED receipt: 6 failed / 110 passed across four focused files; absence checks found the obsolete container. Workbench currently reports loading 233/365 recordings; selected live runs not yet in projection.

GREEN: full viewer coverage suite passes 1,230 tests / 85 files. Coverage: 97.72% lines / 91.38% branches / 93.98% functions; lint and recursive build passed. First test attempts preceded agent workspace build, causing import failures; dependency-correct rerun above passed. COMMIT: RED 9e7da378.

Principles self-review saved at /tmp/remove-bars-principles.md; all PB1–PB13 scored PASS or reasoned N/A. No code or domain growth.
