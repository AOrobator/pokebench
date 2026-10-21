# Metric definitions and interpretation

Use a declared pool and immutable cutoff. Counts below use independent launched runs as the unit; decisions within a run are correlated. Never imply that thousands of tool calls are thousands of independent trials.

## Progress and reliability

**Earned frontier.** Deepest kept required-story split in the served viewer's `FRONTIER_MILESTONES` order. The served order may include optional pre-clear gym trainers: preserve that displayed frontier rather than inventing a second grader. Maintain a separate required-story order for progress/drought that excludes optional trainers; catches, heals and already-true-at-load facts do not raise that required-story frontier. A first badge is a different achievement from entering a gym.

**Reach at a common turn budget B.** For each required milestone: S = reached by B; F = known stuck/stalled terminal behavioral noncompletion before B or observed through B without reaching; U = incomplete follow-up, administrative abort or infrastructure interruption before B; N/A = milestone present at the start or outside the declared eligibility. The current bundled extractor supports boot/unstarted MAIN_MENU only and refuses checkpoint/other-save or present-at-start recordings before aggregation; it does not compute checkpoint denominators. Report S/F/U/N, S/N delivered share, lower/upper unknown-outcome bounds [S/N,(S+U)/N], and S/(S+F) observed-outcome rate with Wilson95 interval. Bounds are not confidence intervals. Retain earlier verified successes in interrupted runs. Do not treat two-hour noncompletion as four-hour failure.

**Progress curve.** Use milestone-specific completion probability over fixed decision-turn budgets, or cumulative turns to each required milestone. Do not divide arbitrary milestone index by turns and call it intelligence: intervals have unequal difficulty. Missing splits are missing, never zero.

**Turns to milestone.** Cumulative recorded decision turns from the common start. Show reached/eligible beside survivor median, IQR/range and individual points. More capable batched tools can do more per turn; preserve tool schemas/flags and add action counts. Fewer turns can conceal longer responses or higher token expenditure.

**Time to milestone.** Cumulative wall time and, only if acknowledged pause evidence exists, active time with pause basis explicit. Serving throughput, contention, hardware and token lengths affect elapsed time. Never call pause-adjusted human time directly comparable to unadjusted model wall time.

**Cost to milestone.** Sum assistant usage up to the milestone: input, output, cache-read and cache-write separately if recorded. Input tokens include repeated context; do not conflate unique information with billed processing. A dollar/energy estimate needs measured prices/power and runtime; otherwise unavailable. Treat uncertain cumulative-token boundaries as an upper bound at first observed split.

**Reference comparisons.** Include the human's recorded start, exploration/training status and timing basis. Identify the best valid actual run under frontier-first, arrival-time-second selection. Include a prior baseline cohort matching conditions or label it historical/incompatible. A combined fastest-per-milestone envelope is not an achieved run.

## Stalls and recovery

**Longest frontier drought.** Largest interval in turns and elapsed time between new kept required-story frontiers, including start→first and last→observed end. A censored terminal interval is an observed lower bound. Drought is not measured wasted time: training, wild battles, travel and preparation can be useful without raising frontier. Story-only and required-navigation definitions must be named, not mixed.

**Repeated negative-feedback attempts.** Candidate: a delivered explicit rejection/no-effect result followed by the same canonical tool+arguments under the same relevant state. Remove non-action explanatory fields such as `because` only with a declared canonicalization rule. Normalize JSON key order, not semantic differences. Preserve map/position, UI owner/readiness, battle turn, inventory/HP and target where relevant. A changed state, completed chunk or repeated damaging attack is not automatically a failure. Report candidate calls/affected runs; manually validate representative and costliest episodes before labelling mistakes. No feedback text or no state linkage means unavailable, not zero errors.

**Recovery latency.** For a reviewed mistake episode, start at the first delivered failure plus a subsequent inappropriate repeat; end at a predefined objective recovery. Report local control recovery and task/story recovery separately, in turns and seconds, with right-censoring if no end is observed. Episode boundaries and supporting seqs are required. Do not sum overlapping episodes, infer counterfactual time lost or assume every intervening turn was wasted.

**Type-specific loop outcomes.** Use current compatible `recoveryCollector` (30-turn window,20-turn navigation lookback) without changing gameplay. Navigation: reaches a tile absent from the prior fixed point or story progress; dialogue: closes and unlocks; battle menu: battle turn executes or battle ends; interface: closes menu/naming; story character: character talks or story progress. Safe means no recorded blackout or stuck/model-error/crash in the follow-up window, not absence of battle losses. Retain recovered/eligible, safe/eligible, relapsed/eligible and own-run baseRecovered/baseN for each loop type/source. State/window shortages are censored or unavailable. The existing collector's binary result is a local proxy, not proof of downstream story recovery or warning benefit.

**Recurrence.** Define same failure signature and a follow-up horizon before counting it. Distinguish repeated detector triggers from a manually verified return to the same unsuccessful strategy. Report observed follow-up and censoring. A restored UI immediately followed by another healing loop is local recovery with strategic recurrence.

**Assistance.** Separate unsignalled model changes, routine tool feedback, delivered supervisor warnings, deterministic automatic dialogue/navigation and human input. `would_warn` diagnostic events were not sent. A row in the viewer does not prove model delivery. Routine automated execution is part of the configured agent; do not credit the language model alone for it. Report assistance exposures per100 decisions if coverage is known, but rates depend on detector thresholds.

## Accuracy and failure attribution

**Decision quality.** Observe action consequences: damaging battle turns, HP changes, successful interactions, changed targets after refusal, explicit game-owned wins/losses. Do not grade plans by eloquence or rely on private reasoning to infer causes. Game knowledge, spatial planning, interface use, evidence updating and long-horizon control are separate dimensions.

**Taxonomy.** Model-action error, confirmed wrong observation/harness message, observability gap, infrastructure failure, administrative stop, behavioral stop and budget expiry remain separate. Mixed-cause episodes can have multiple contributors. Suspected harness defects need paired frames/raw-memory/source audit before confirmation. Keep affected outcomes visible; do not blame them solely on the model or silently delete them.

**Statistical interpretation.** Use Wilson95 intervals for run-level proportions and bootstrap intervals only with an adequate independent run unit. Stratify by model/arm/pin/start/runtime; don't pool adaptive moving-main bundles into one fixed treatment. Small N, shared saves, output caps, quantization and survivor selection constrain inference. A historical ranking is provisional performance, not a causal intelligence result. Hypotheses identify the cheapest future test; they do not authorize it.
