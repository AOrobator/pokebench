---
name: viewer-e2e
description: Verify PokeBench viewer navigation, playback and polling interactions in the real browser. Use for viewer UI fixes and before claiming a click-through works; not gameplay automation or benchmark evaluation.
---

# Viewer end-to-end verification

Use the available browser-control tools against the actual candidate server. Take the happy/failure/recovery approach from local inference stack's playwright-e2e skill, but follow the tools and safety boundaries available in this session. Mounted DOM tests and HTTP 200s support browser proof; they do not replace it.

## Preserve desktop focus

Operator decision 2026-10-22: all routine verification runs in the background. Before operating a browser, check the tool's documented focus behavior. Prefer an agent-owned headless Playwright/Chromium context; use another context only when its documented operations preserve desktop focus. A hidden tab alone is insufficient if the next click, keyboard operation, screenshot or viewport change activates its window. Do not probe this by stealing focus once.

Do not bring an app/window/tab to the foreground, select the operator's working tab, use global mouse/keyboard input, run `open` or an application-activation command, or open screenshots in desktop apps for proof. Use context-scoped browser actions and screenshots; inspect saved screenshot pixels through the image-reading tool. DOM focus and keyboard tests inside an isolated background page remain valid; OS/application focus must stay with the operator. Give subagents these same constraints.

If the tool only supports foreground/native interaction, do not use it for routine testing. Keep the affected browser check pending and state the limitation separately from completed tests; HTTP/DOM-only checks do not replace the missing browser proof. An explicit user request to show a page or interact with a foreground surface authorizes only that operation, not later focus-taking verification. A generic request to test, fix, land or capture screenshots grants no such permission.

## Timeline is closed to additions

Never add new marks, lanes, labels or colors for new kinds of events to the TIMELINE swimlanes without the operator's explicit permission (operator decision 2026-10-16). Put new diagnostics in Activity History and the raw-event inspector instead. Fixing how an existing mark is drawn is allowed.

## Bind the check

Identify the user's existing tab, URL, selected run and the server PID/source before editing or testing. Read the active worklog and preserve shared servers, original recordings and frozen benchmark checkouts. Use the owned preview for candidate changes. Confirm served HTML/modules/styles match completed build artifacts; avoid testing while a build is rewriting those files.

For an existing-tab report, inspect and try the reported interaction there first only if the tool can do so without changing desktop focus or disrupting the operator's working tab. Otherwise reproduce it in an agent-owned background context and record that the original-tab check remains pending. Record tab-control failures separately from application failures. A fresh tab is a diagnostic comparison, not proof that the original tab recovered. Do not close a user's tabs, reset their browser or switch to another app to bypass a blocked control surface. If the original remains uninspectable, disclose that limitation instead of declaring it repaired.

## Click through to the outcome

For **Watch this run**:

1. Capture the visible card's run identity and href. Click its visible Watch control with real browser input; do not substitute direct URL navigation.
2. Confirm the destination selects that exact run. A changed URL or LOADING shell is not success.
3. Wait for the actual viewer readiness label: RUNNING or PAUSED for live sessions, or replay readiness for ended recordings. Do not wait for an invented label such as literal LIVE when the UI says RUNNING.
4. Inspect the game image and its source plus screenshot pixels. Require a visible game frame belonging to that run; record whether it is live or recorded fallback. Check visible problems and console errors, identifying any intentionally disabled preview capability separately.
5. Use the viewer's comparison link to return and repeat the click. Exercise multiple polling cycles and an updated snapshot; preserve the href, focus and click target while the clock updates. Verify keyboard activation as well as pointer activation for the changed control.

Keep navigation timing separate from time to playback/frame readiness. Measure each only when the available tools expose suitable evidence; otherwise report readiness without inventing latency. Preserve before/after screenshots and structured receipts under ignored runs/ with run, URL, source identity, mode and image source.

## Failure and recovery

Exercise concrete loading, failed snapshot and unavailable-run paths through isolated fixtures or an owned test server; do not stop the real benchmark or shared backend. For polling changes, prove stable focused/clicked elements across unchanged and changed data, then disappearance/status changes. For anything that redraws by itself, also prove the reader's row stays put with [steady-screen](../steady-screen/SKILL.md). For performance fixes, show which expensive requests leave startup and verify they remain reachable through the relevant UI.

If browser control or the page becomes unresponsive, inspect the documented troubleshooting state and available surface. Do not count a timed-out click, an unresponsive old tab, a new-tab-only success or a later screenshot as the missing transition proof. Fix the demonstrated owner or retain an explicit unresolved finding.

## Completion receipt

Record the exact interactions and observed outcomes, repeated return-path result, errors, screenshot paths and remaining gaps. Re-run after the final build. Report implementation, tests, browser proof, visual approval and landing separately. Keep user-requested visual approval holds intact. Route viewer interaction changes through this skill from CLAUDE.md so future tasks can discover it.
