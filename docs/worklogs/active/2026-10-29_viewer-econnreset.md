# Viewer ECONNRESET recovery

Authorized bounded repair relayed from human request to recover viewer. Source scope server.ts socket error containment; no gameplay/UI/design changes. Preserve shared services 44575/18986/37156. One final viewer-main after reviewed landing and postmerge tests; headless browser proof only.

RED: deterministic reset emitted at socket.end in actual registered upgrade handler, exercising 403/404/409 rejection paths. Must contain error, destroy socket, keep HTTP responding. Review/gates/landing pending.

RED confirmed: all four rejection cases throw read ECONNRESET from production upgrade handler (receipt /tmp/pb-socket-red.log); preexisting built dependencies copied from same-head canonical tree for cheap tests, no build/CPU window consumed. Initial missing-dist attempts are setup failures, not RED evidence.

GREEN: raw upgrade socket installs persistent error listener before all rejection/upgrade work, destroys failed socket. Full server file 173/173 PASS, changed files ESLint PASS, viewer tsc --noEmit PASS. Performed destroy-only deletion: 4/4 fail socket.destroyed exact assertion; restored 4/4 PASS. Original RED is listener-deletion proof. No extra clientError listener: Node retains default HTTP parser/socket error containment; existing SharedFrameHub has upstream and downstream error handlers.

CPU full gates requested, queue #3. Final one combined-main viewer refresh reserved by Claude. Grok waiver independently read native Claude record 00000000-0000-4000-8000-1bb4e739f4f4.jsonl lines 4145/4964/6309: user yes dont wait for grok and land without grok; coordinator reconfirmed this repair. Selected roster Claude CLI + normal GPT + distinct fallback, reduced vendor diversity disclosed, no Grok LGTM claimed.
