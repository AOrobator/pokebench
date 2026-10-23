# Starter decision salience: diagnostic protocol and annotation rubric

## Frozen question

Does the neutral menu reminder change recorded deliberation and preserve commitment/execution consistency? This is a diagnostic, not a starter-quality, gym-performance or promotion experiment. A considered Torchic choice is valid; a switch to Mudkip alone earns no reasoning credit.

## Trial contract

- Fixed definition: experiments/fixed/starter-decision-salience.json. Eight trials per arm total; each lane executes four per arm, balanced seeded blocks. Sixteen planned outcomes, one final analysis. No interim adaptation, early cohort stopping or best-run selection.
- Trial cap 300000 ms; maxTurns 20000 (declare any actual turn-cap hit). No replacement reserve. Model errors/crashes remain outcomes; a launcher fault or operator stop holds for review rather than silently replacing a trial.
- Shared first-arrival ROUTE_101 save, source frontier-acq-a, sha1 0c34433cc305ea5de6fa69aa4a5612bf434a5714. Capture at seq900/901: Route101 (11,19), empty party. Model history starts fresh and identically in both arms. All present-at-start progress earns no credit.
- Shared broad play goal, full instructions, tools, sampling and effective flags. `target:null` retains the goal; `stopAt:STARTER_CHOSEN` only controls the native stopping boundary. Metadata records evaluation.target=STARTER_CHOSEN and evaluation.goal_target=null. No starter selection tool or additional Pokémon facts.
- Only starter-decision-salience-v1 differs. ON appends the exact reminder to image-bearing observations whose same-snapshot state verifies started, starter_choice, empty party, no battle, ready starter_selection, known selected species and no diagnostic. Repeated ready-selection observations retain the reminder; confirmation, transitions and owned-party results add none. OFF tools and observations are unchanged.
- Exact text: “Starter decision: This choice determines your starting Pokémon and affects later play. Before confirming, consider the alternatives and briefly explain how your choice supports your goal. Distinguish what you know from what you are uncertain about.”
- Native STARTER_CHOSEN (validated state + observed milestone) ends a trial before further battle play; cap, crash, model error and administrative endings remain visible. Run metadata, individual native inputs, returned observations, complete assistant thinking, frames and raw RAM are retained.

## Outcomes

The runner's technical outcome is native STARTER_CHOSEN within 300 seconds, with elapsed time and failure reason. Technical completion is not good judgment.

The primary mechanism annotation is a recorded, factually supportable goal-related consequence used to justify the final choice. Count the denominator over all sixteen planned/started trials; distinguish no reasoning opportunity (never reaches the menu), no recorded justification, and unresolved factual claims rather than conflating them. Report per-arm counts with the complete trace ledger. Do not use a p-value or promotion verdict for this small diagnostic.

Separately annotate these fields; do not sum them into an invented quality score:

1. opportunity: menu was actually delivered before commitment; cite tool-result seq and paired frame.
2. recognition: identifies a lasting/consequential choice; a bare species list or copied reminder is insufficient.
3. consequence: absent / concrete and source-supported / unsupported-or-wrong / uncertain. Cite the pre-commit assistant seq and the game source for asserted mechanics. General “balanced,” popularity and “currently highlighted” are not strategic consequences.
4. uncertainty: distinguishes observation, remembered knowledge and uncertainty; an honest knowledge gap is different from a fabricated comparison.
5. alternatives: none / names only / consequential comparison. Clicking every option is not required when reasoning already identifies them accurately.
6. intention: initial and final intended species, or unknown. Preserve changes of mind. The final choice can be Torchic, Treecko or Mudkip.
7. consistency: final rationale matches the stated final species; acquired species matches that intention. A confirmation mistake and deliberate reconsideration are different episodes.
8. execution: native selected cursor changes, confirmation/decline/retry, final player-party species, native milestone proof. Cite seqs; do not infer intent from button presses alone.
9. cost: time to menu and acquisition, model calls, thinking/output tokens, invalid/refused actions, missing observations, infrastructure failures. Longer thinking by itself earns no credit.

## Interpretation and review

Retain all trials; report success, failure, unknown/censored and opportunity counts explicitly. Historical 33/33 Torchic controls are contextual evidence, not a substitute for the contemporary fresh-context control. Review all traces together after fixed N finishes, using the same rubric; have a second reviewer check all claimed strategic successes and all intention/execution discrepancies. Reviewers should see neutral trial codes before the arm key when feasible, but prompt copying can unblind them and must be disclosed.

The diagnostic may show that the reminder changes expressed reasoning, has no visible effect, or creates unsupported rationalization/cost. It cannot show which starter is optimal, that a species change helps, latent model capability, a gym benefit or whole-run improvement. No automatic promotion is authorized. A selection tool and equal-facts treatment require separate designs.

## Baseline and budget

Historical completed Qwen samples: 77, Route101→STARTER_CHOSEN median29.690s/p90 43.072s/max311.100s. Completed control subset:33, median28.564s/max43.612s. One additional arrival was censored by its whole-run budget after13.502s. Conditional timing is not a selection success rate. Evidence: canonical runs/reports/run-analysis/2026-10-19_starter-census/scratch/route101-starter-times.json.

Sixteen × five minutes = 80 GPU-minutes (1.333 GPU-hours) maximum trial budget, approximately40 trial minutes with two lanes, plus setup/availability overhead. Eight per arm is a fixed diagnostic sample, not an 80%-powered confirmatory claim. Measured execution remains unapproved until the operator explicitly launches it and lanes are free and qualified.
