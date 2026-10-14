# Visible press timeline labels

User request: “the timeline for presses should show the button being pressed not just a blob of a rectangle”. Small viewer presentation change only.

Show directional arrows and A/B/START/SELECT text over existing duration bars. Sequential agent inputs get individual labels; simultaneous human holds get a combined label. Keep exact bar positions, durations, tooltips and accessible button names. Clamp labels inside the plot, honor hidden lanes and the existing time window. Shared CSS covers agent and human views. No game or model changes, active process restarts or benchmark claims.

Validation complete: all 337 viewer tests pass; viewer lint/build pass. Coverage lines 98.52%, branches 91.19%, functions 96.02%, above the independent 90% floors. Browser preview verified all ten button labels and combined A+↑ holds in both layouts. Existing timing/alignment/window/hidden-lane tests remain green. Initial type check caught omitted human shoulder buttons L/R; corrected before the successful gate run.

Source/build updated in the current checkout. No running viewer restart: the existing 8793 process points at a removed serving checkout and returns 404 for its browser timeline module; restoring that unrelated server is outside this small presentation change. No live-serving claim. Unrelated worklog edits preserved. This is a small reversible presentation edit, not a benchmark milestone or nontrivial landing.

Landing: operator explicitly requested “land your work”. Commit only the timeline renderer, shared stylesheet and this worklog on main; leave both unrelated dirty worklogs untouched. Prior viewer checks cover the final renderer; final diff whitespace check passes.
