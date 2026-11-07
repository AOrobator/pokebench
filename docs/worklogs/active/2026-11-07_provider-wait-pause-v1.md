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
