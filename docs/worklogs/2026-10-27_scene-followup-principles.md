# Principles adherence: scene-followup-prompt-v1 (M1)

| ID | Verdict | Evidence |
|---|---|---|
| PB1 | PASS | Prompt only; grading (native milestones) untouched. |
| PB2 | N/A | No run accounting or result code changed. |
| PB3 | PASS | No effect is claimed. The explainer says "Measured effect: none yet"; the probe is a decision screen, not a benchmark result. |
| PB4 | PASS | The advantage is declared: a registered switch recorded in harness_features (`...when(id)` last), with an explainer and copy saying what OFF does. Wording is generic, with no names or foreknowledge (asserted by a test). |
| PB5 | PASS | One switch, one paragraph. Hypothesis in the worklog: after a scene, talk to its people before following older plans (Astra vs 9e33). OFF is byte-identical (tests in legacy, control and bundle sets). |
| PB6 | PASS | Static text; no state or accumulation over long runs. |
| PB7 | PASS | The switch is recorded in run_start harness_features; the system prompt is recorded in request_context. |
| PB8 | N/A | No guard or misbehavior handling. |
| PB9 | PASS | Followed existing prompt-switch patterns; current.json edited after the promote landing (ff88c3a03). |
| PB10 | PASS | No skipped tests and no threshold or exclude changes. Pinned-count updates are the registry growth only. |
| PB11 | PASS | Vendor at its pin (just verify-vendor OK); no vendor change. |
| PB12 | N/A | No new file access outside the repo. |
| PB13 | PASS | Tests at the production builder (playSystemPrompt, used by live.ts and decision-probe.ts). Wiring was deleted once and went red. The probe context rebuild shows the flipped context differs only in the system prompt. |

FAIL rows: 0

Archived 2026-10-27 with the scene-followup-prompt-v1 worklog (landed 360c0ee41).
