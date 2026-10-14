# Right D-pad highlight polish

User request: make the right D-pad highlight consistent with up, left and down while watching the agent play.

Scope: the existing RIGHT highlight SVG path in `packages/viewer/src/gba.ts`. Its final vertex incorrectly returned to the lower inner corner, making the polygon double back and leaving part of the arm unfilled. Return to the upper inner corner instead, mirroring LEFT around x=102. Shared highlight styling and input timing already treat all directions alike.

Validation: 327 viewer tests pass; viewer lint and build pass. Initial 79 suite failures were caused by stale agent build output; rebuilding the agent dependency cleared them. Geometry inspection confirms RIGHT is the exact reflection of LEFT about x=102 (same area and outline). This is a reversible one-coordinate artwork correction; no new tests or harness behavior changes are needed.

## Principles adherence (quick-fix tier)

| Principle | Result | Evidence |
| --- | --- | --- |
| PB1 | N/A | No progress measurement changes. |
| PB2 | N/A | No run outcome changes. |
| PB3 | N/A | No benchmark improvement claim. |
| PB4 | PASS | Artwork only; no gameplay assistance or vendor edits. |
| PB5 | PASS | One incorrect SVG vertex is the sole production change. |
| PB6 | N/A | No context or long-run behavior changes. |
| PB7 | PASS | Existing recorded inputs continue to drive highlights. |
| PB8 | N/A | No model validation or retry changes. |
| PB9 | PASS | User explicitly requested this visual correction. |
| PB10 | PASS | All viewer tests and lint/build pass; no gate changes. |
| PB11 | N/A | No integration or dependency API changes. |
| PB12 | PASS | No ROM access. |
| PB13 | PASS | Worklog and deterministic checks recorded; quick-fix reviewer pending before commit. |

Frozen review boundary: ad hoc one-vertex artwork repair in `gba.ts`; no input timing, CSS, game state, public API or new tests. Terminator: corrected mirrored polygon plus passing viewer checks and selected quick-fix reviewer. Split any adjacent findings into follow-up work.

Review availability: dedicated Claude CLI profile reports loggedIn=false; try Cursor Claude under the standing harness-switch authorization.

## Review synthesis and closeout

- Cursor `claude-sonnet-5-thinking-high` exited 1 with `ActionRequiredError: You've hit your usage limit`; approved Claude harnesses exhausted.
- Standing quick-fix fallback: independent read-only `/root/dpad_review_sol` (gpt-6.1-sol) and `/root/dpad_review_astra` (gpt-6-astra), both returned literal `VERDICT: LGTM`. Reduced vendor diversity; this is the quick-fix roster, not the full feature review roster.
- Frozen diff SHA-256: `7654d6b8770e9903d01bfe116fd4eccc76eb6206e66890e664602ff73c19cf01`. Both reviewers independently confirmed the corrected polygon exactly mirrors LEFT about x=102. No blockers, contradictions, scope expansions or follow-up findings; round one terminates without owner or contract growth.
- Test-quality review: existing SVG hook and button timing tests reach their consumers; no test changes, fixture loops, new globals, pollution selectors, concurrency, bounds or suppression. Adversarial deletion/load proof is not relevant to a single artwork coordinate. Geometry provides the decisive evidence for fill correctness. No live agent/browser playback verification claimed.
- Viewer coverage passes: lines 98.48%, branches 91.25%, functions 95.96%. All PB rows covered with zero FAIL. Disposition: green for this narrowly scoped artwork correction; refresh the viewer to load the rebuilt module.
