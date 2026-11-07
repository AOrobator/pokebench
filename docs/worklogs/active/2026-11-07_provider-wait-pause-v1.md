# Pause the run during provider waits

The November 7 operator request is to suspend gameplay and its active wall
budget while the gateway holds a rate-limited model request.

## RED

The seven new no-I/O run-control cases failed on the missing call hooks.
The 29 existing cases passed. The pinned Pi loop and state-only loop also
have in-memory cases that drive a provider pause from the transport and
observe the completed reply before either loop can execute its tool.

## Scope

The switch defaults on for all lanes. The gateway keeps its existing backoff.
This change does not authorize a run launch or a viewer restart.

## GREEN

Focused no-I/O tests passed on the run controller, regular Pi loop, and
state-only decisions. Removing the production factory's hooks failed all
three loop assertions on pause_pending vs paused. Restoring the hooks
restored the behavior. Agent type checking and changed-file ESLint passed.
The vendored game server passed its pin check. The explainer passed the
offline-page check and rendered in headless Chromium at widths 375, 1280
and 1440. The served Harness Config click remains pending the authorized
viewer refresh.

An in-flight pause starts charging paused time as soon as it is applied.
Emulator confirmation is asynchronous and its result is retained in the
applied event. An adjacent pause and resume already present in the same
poll batch cancel without a freeze round trip.

## Review round 1

The initial review packet compared base `3585c57e6` with head
`d70a1b89b` and diff SHA-256
`4cf08853946227465c1696c90ffb58d46dac0692b54a843073444ac19eb0b8a6`.
GPT and the Terra fallback reproduced a same-poll pause and resume
separated by a budget extension. GPT also identified the difference
between when the harness suspends its clock and when freeze
confirmation reaches the viewer. Astra fallback returned LGTM on the
initial packet. Both Grok attempts were rejected by Cursor's account
usage limit, so neither returned a verdict.

The correction treats budget extensions as transparent when identifying
same-poll cancellations. The pause event now carries the time taken to
confirm the freeze, which the viewer uses to reconstruct the start of
the hold. All three regression assertions failed before the correction.
Afterward, 141 focused agent and 238 focused viewer tests passed. The
viewer tests used branch source imports because the branch build is
pending the shared CPU window. The combined gates and served Harness
Config click remain pending.

A duplicate pause within the same poll now also leaves a completed
hold cancelled. A stop or abort before the resume still takes effect.
The duplicate-pause regression failed before the correction and the
focused agent count is now 142.

## Integration with main

Main advanced to `5ad4882bc`. Its Rayquaza checkpoint switch shared the
feature catalog, preset schema and viewer defaults with this branch.
The merge preserves both switches and appends the provider switch after
main's existing registry entries. The broadcast header changes are
separate from the run controller. Focused integration reruns passed
153 agent and 260 viewer tests. The viewer reruns still used source
imports. Full branch gates require the pending CPU window.

## Landing status

GPT returned LGTM on integration head `197c6577d`, base `5ad4882bc`,
diff SHA-256 `89df22b79caf9b76ebfa0325eb630a10a532f95788b6dd12a8c6430847193d46`.
Agent type checking, changed-file lint and generated-schema comparison
passed on that head. Claude's preliminary review of the corrected
pre-integration packet has not yet returned a verdict. Grok is blocked
by Cursor's usage limit, and the relay has not granted the requested
CPU window. The relay acknowledged delivery of the blocked handoff.
No changes landed on main.

## Landing correction

The full test gate exposed four assertions tied to the historical four-flag
mapping. That mapping keeps the switch off, while actual flag-only launches
enable it at the live entry point. Current recipes and omitted v2 settings
still default on, and explicit v2 OFF is preserved. The failing tests were
left intact. Integrated main at db3d713df, retaining its new switch entries.
The scheduler relayed the operator's standing Grok waiver. Landing requires Claude,
GPT and a distinct fallback reviewer, with the reduced diversity recorded.

The 9:57 CPU window on 2550c565d passed build, agent coverage and full
lint. Viewer coverage stopped on the default-next-run preset fixture.
CPU RELEASE was delivered. Claude and Astra approved that candidate.
GPT identified a qualified archived continuation compatibility issue.
A new no-I/O regression failed at the migration check before the fix.
Qualified baselines now inherit the recorded provider-wait setting if
the field is absent, and the measured launcher carries the resolved
value through preset normalization. All 88 focused tests passed.

Claude, GPT and Astra (distinct fallback under the standing Grok waiver)
returned LGTM after the archived-continuation delta. No local inference
reviewers were used. The operator explicitly approved updating the viewer fixture's
expected default to ON at 10:03 AM EST and waived re-review of that fixture
change. The full preset assertion is preserved.

Main advanced to 96bde9f72 before the final CPU window. Route Summary
shares registry and preset wiring. Resolved those edits by retaining
main's switch entries and appending the provider switch. The runtime
pause, event schema and archived-continuation changes remain identical.

Main advanced again to 9b3f537f2 during the first build. Cancelled that
build and integrated the model-stream logging changes before rerunning.
The shared live path now has both stream logging and the pause hooks.

## Landed on local main

Fast-forwarded main from `9b3f537f2` to `893dd4bd6` in landing slot 1.
The final integration diff SHA-256 was
`3bf350f822bb305c011bff3cee2f93bc9d867cc82368b9c19e27fe6f31d841ce`.
Claude, GPT, and Astra returned LGTM on the integration. Astra served
as the distinct fallback under the operator's standing Grok waiver, with reduced
reviewer diversity and no local inference reviewer. The viewer fixture's
one expectation change had separate operator approval.

Pre-landing build, full test, full lint and vendor verification passed.
The combined post-merge test on main passed, including coverage and
no-I/O proof. CPU RELEASE was delivered after both windows. No runs
were launched and the live viewer was not refreshed or exercised.
