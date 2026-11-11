# Progress-aware cycle warnings

> Markdown twin of [progress-aware-cycles-v1.html](../progress-aware-cycles-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`progress-aware-cycles-v1` · Default OFF · Bundle candidate

A healing gate can tell the player to leave a battle and heal. The cycle guard should allow that round trip while it makes observable progress.

## Follow the whole trip

![Illustrative route using fd95's actual maps. Routes come from the game's directed map table, including a separately checked return path.](progress-aware-cycles-v1/fig-1.svg)

*Illustrative route using fd95's actual maps. Routes come from the game's directed map table, including a separately checked return path.*

## Bounded permission

- Only a recorded healing-gate refusal starts protection. Low HP alone does not.
- Travel stays on a recorded route to one of the healing places the gate offered. A deviation ends protection.
- Full party HP must be verified at that destination before return protection begins.
- At most 48 completed tool calls for the entire trip. Four consecutive calls without a new position or HP state end protection. Errors and unpaired observations count toward this limit.
- Repeated refusals cannot renew the allowance. A confirmed override or a battle ends it.
- Observation, rejection and ineffective-action guards keep working. The exemption only affects cycle feedback.

## Progress has precedence

A newly observed milestone clears stale cycle evidence and protects its turn. Startup facts and milestones present in a loaded checkpoint do not qualify. A recovered cycle says why it ended, rather than repeating a stale instruction to change course.

Suppressed cycle warnings are recorded as diagnostics in Activity History and the raw-event inspector. They add no timeline marks and no instruction to the model.

## OFF and ON

**OFF:** Existing cycle checks, gate events and model feedback stay unchanged.

**ON:** The healing gate records outward and return routes. The loop coordinator and map-cycle briefing use the same bounded rules and retire the trip's old cycle evidence.

Evidence: fd95 s6821/s6908 are healing-trip map-cycle warnings. 0ced s6798/s12633 are recovery records on milestone turns; s12424 follows a confirmed override and receives no healing exemption.

Implementation candidate. Diagnostic replay proves the mechanism, not improved gameplay results. Review, landing and measured evaluation have separate receipts in the worklog.
