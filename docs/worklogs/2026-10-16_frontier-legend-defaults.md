# Story frontier legend defaults

Operator (2026-10-16 3:12 PM EDT): more space between the FRONTIER / FULL BASELINE toggle and the harness versions; harness versions and "What the marks mean" collapsed by default; collapsed "What the marks mean" and "How to read this chart" each on their own line.

- [x] RED (949aff54): legend and mark key start closed on every width; each bar is full width; the legend block sits 14px below the range toggle.
- [x] GREEN: legend and mark key default closed (the unused `wide` dependency removed), `.wb-fgx details.wb-bar` flex 0 0 100%, `.wb-fgx` margin-top 14px. Viewer 995 tests; coverage 95.56 / 91.31 / 93.95 / 97.74; lint clean. Browser (scratch startViewer, 3 copied runs): 1280 — all three bars closed, each full width on its own line, 14px under the range toggle; 375 — same, no overflow.
- [ ] Reviews (desktop and phone), reviews (Claude, grok, Codex), ff merge; 8790 restart via the coordinator.
