# Viewer ECONNRESET recovery

Authorized bounded repair relayed from human request to recover viewer. Source scope server.ts socket error containment; no gameplay/UI/design changes. Preserve shared services 44575/18986/37156. One final viewer-main after reviewed landing and postmerge tests; headless browser proof only.

RED: deterministic reset emitted at socket.end in actual registered upgrade handler, exercising 403/404/409 rejection paths. Must contain error, destroy socket, keep HTTP responding. Review/gates/landing pending.

RED confirmed: all four rejection cases throw read ECONNRESET from production upgrade handler (receipt /tmp/pb-socket-red.log); preexisting built dependencies copied from same-head canonical tree for cheap tests, no build/CPU window consumed. Initial missing-dist attempts are setup failures, not RED evidence.
