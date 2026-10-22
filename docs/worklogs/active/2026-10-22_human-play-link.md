# Human play link points at the viewer (2026-10-22)

`just run-human` printed `http://127.0.0.1:8791/play#run=<id>`. Port 8791 is the static pages server, so the link returned 404. The viewer that serves `/play` runs on 8790. The probe link had the same wrong port.

- Fix: `humanPlayUrl` and `viewerRunUrl` in `packages/agent/src/human.ts` build `http://127.0.0.1:8790/play?run=<id>#run=<id>` and `http://127.0.0.1:8790/#run=<id>`, the shape the viewer's `human-main.ts` uses. COMMIT: `fix(human): print the viewer's /play link on 8790, not the pages server` (b975dde1a)
- Reproduced before the fix: `8791/play` returned 404 and `8790/play` returned 200 for live run `2026-10-22T12-35-14_human_f8d7`. A headless Chrome load on 8790 and on the Tailscale origin showed status "Recording" with no console errors.
- Gates: agent coverage passed with 4507 tests; tsc and eslint were clean. After the ff-only merge to `e441abb1d`, `just test` on main passed: agent 4507, viewer 1690, Python 3960.
- Review on packet sha256 `2f140385…3ede`: the Claude lane (subagent, because the `claude -p` OAuth had expired) returned LGTM. The Codex lane (`codex exec -m gpt-5.6-sol`, because config `gpt-6.1-sol` was rejected) returned LGTM. Grok was not required for this thread.
