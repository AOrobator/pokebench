---
name: pokebench-probe-autoresearch
description: Research and optimize a PokeBench strategy, prompt or task policy using broad mechanism search, thinking/action traces, bounded experiments and power-sized confirmation. Route explicitly authorized checkpoint validation through the native experiment skills; not a single frozen comparison, passive analysis or implicit gameplay launch.
---

# PokeBench probe autoresearch

Find the best-supported intervention within the authorized question, or report rejection, inconclusive evidence or infeasibility. This is an **agent-led workflow using existing tools**, not an installed unattended controller. Read [decision-probes](../pokebench-decision-probes/SKILL.md) first: it owns request fidelity, scoring, power, compute accounting and publication. This skill owns research breadth, branch selection, policy lineage and adaptation.

## Scope and research contract

Design/discussion and skill-edit requests stay offline. A request to run research authorizes the requested search inside its budget and launch rules. It does not by itself authorize gameplay, interrupting another run, production activation, a new scheduler or a future reservation. If the user explicitly authorizes conditional checkpoint testing, record its gates and limits and use the [checkpoint handoff](references/checkpoint-validation.md); do not ask again at ordinary transitions already covered by that contract.

Default: **one aggregate GPU hour for the whole question**, including every candidate, stage, endpoint, failed call and time holding reserved compute. Record whether a later grant replaces a cap, expands an active cap or starts a new campaign allowance. Closed/expired allocations do not carry forward without explicit authorization; keep historical spend separate and never add unused old allowance twice. Two GPUs reduce wall time, not aggregate cost. Coordinate each actual window with [run-coordination](../pokebench-run-coordination/SKILL.md).

Before inference, use [research-record](references/research-record.md) to fix the claim, development/exposure ledger, primary and regression rules, protected final resources, candidate/batch ceiling and stop conditions. Read [power sizing](../pokebench-decision-probes/references/power-sizing.md) before allocating confirmation or native reserves. Cost the **complete** search and validation, including planner/executor stages, from comparable mixed-workload timings. Flag infeasibility before launch; do not relax evidence or consume protected reserves to keep searching. More budget does not imply an obligation to spend it or find a winner.

## 1. Map the problem before narrowing

Read [strategy search](references/strategy-search.md). Audit the failure's delivered observation, exposed reasoning, request, execution and native state. Inventory recoverable earned successes in the declared corpus and compare their relevant decision windows across models with failures. Separate inherited progress, automatic/human assistance, differing harnesses and unavailable private reasoning. Search results are an inventory, not proof every transcript was read.

Build a **strategy-space map**: plausible mechanisms, supporting/counter-evidence, tested branches, offline exclusions, deferred branches and remaining uncertainty. Consider task priority, context/memory, action binding, preparation, planner/task/actor organization and persistence when relevant; do not force a fixed number of arms. Reuse prior positive, null and invalidated studies, official model/prompting guidance and relevant harness/game references. Research may verify game truth; it does not authorize injecting unobserved walkthrough facts into a benchmark.

Before narrowing, explain why the next comparison is more informative than a materially different branch. Preserve a bounded opportunity to escape the current branch. At a plateau or new failure mode, reconsider the map instead of automatically rewriting the same sentence.

## 2. Define policies and qualify their delivery

A candidate is a versioned **policy**: prompt/template, context and tool contract, placement, eligibility, task/actor/action ownership, planning cadence, and activation/suspension/resumption/retirement. Save its parent, exact rendered differences, observation-derived slots, predicted stage change and counterexample. A single prompt can have a simple one-request lifetime; do not invent lifecycle machinery where unnecessary.

Keep a small, budgeted **portfolio of component nominees**: useful task framing, reliable action binding, persistence, cost and regressions need not have the same winner. Better reasoning can justify a targeted component test; it never substitutes for the primary outcome or promotes a policy. Isolate a mechanism when attributing cause; label inseparable composites honestly.

Qualify the actual caller, serialization, relevant model-template behavior, tools, observation/image retention and fit. Source assertions are not historical wire proof. A replay/runtime repair is correctness work: preserve the old study, requalify and sample a fresh comparable incumbent/parent bridge before relying on old rankings. A serializer fixture alone does not establish that every historical recorder hook or native continuation works.

Use existing tooling. Any necessary custom runner or native delivery code needs its applicable tests, fake-data rehearsal, immutable inputs, durable attempts, lease/budget handling and review before measured use. Writing this skill does not create those capabilities.

## 3. Screen complete batches, then inspect every arm

Choose a few genuinely distinct hypotheses from the map, a matched incumbent/parent and contrast cases where intervention would be wrong. Follow the core skill's development sizes and any explicit user minimum; do not turn one campaign's count into a universal rule. Balance every arm across equivalent devices, independently seed logical trials and record actual model/serving groups.

Freeze each complete batch: policy, runtime, model/sampling, schedule, N, endpoint and scorer. Plan enough authorized resources for fixed N to finish; a soft time estimate is not an early-stop rule. Do not add convenience timers against an explicit no-time-limit instruction. Preserve hard aggregate/ownership limits and reconcile a resource-only continuation when needed. Publish and verify its real operator surface. Inspect only operational health/counts while running; no arm dropping, wording edits, early winner selection or model-setting changes. Persist attempts before calls, retain failures and release GPUs before offline analysis.

**Do not choose the next candidate from scores alone.** Lock primary grades, then perform the [stage-wise trace audit](references/trace-analysis.md) for every completed arm, including controls, nulls, malformed plans and available executors. Preserve missing stages as unavailable. Keep graders blind to treatment/aggregate outcomes until the applicable labels lock; distinguish later exploratory interpretation. Thinking is a stated belief, not proof of causal cognition.

## 4. Revise, branch or combine from the evidence

For each completed batch record which stage moved: evidence recognition, task/actor choice, intended operation, actual request, legal execution, or temporal continuation. Distinguish missing evidence from evidence explicitly overridden by a self-created priority; distinguish a useful plan from a usable handoff. Record unsupported claims even when an action succeeds.

Update the component portfolio and choose a discriminating next test: revise a mechanism, investigate another branch, replicate, test a combination, freeze a finalist or stop. Do not eliminate a plausible branch solely because a small screen is nonsignificant, or promote one because its explanation sounds better. A new batch samples the relevant parent/incumbent freshly; selected old scores are not its control.

Combine only when traces predict complementary mechanisms and their ownership/eligibility/lifetimes are compatible. Compare constituents and their combination with matched ablations or a targeted factorial under the approved contract. Do not assume effects add, silently stack prompts, or call an initial sparse-planner handoff evidence of sustained replanning. Preserve all nulls, harms, lineage and costs.

## 5. Confirm the claim; validate native behavior when authorized

Freeze one finalist by default, its whole delivery/lifecycle contract, endpoint, N, analysis and complete benefit/regression rule before final sampling. Maintain the question's combined error budget across final candidates/looks and probe/native claims. The default is 90% target power and two-sided family alpha .01; size the actual decision, not a sample-size ladder or a feeling of confidence.

Fresh draws on inspected contexts can test a predeclared **conditional reliability** claim; they do not create unseen source families. Transfer confirmation requires a protected family reserve and a family-aware design. If that reserve or sufficient budget is unavailable, report the limitation or explicitly define a narrower claim before testing. Do not rename exposed cases held-out.

When conditional native validation is authorized, qualified delivery plus completed replicated action-level evidence and acceptable predeclared controls can trigger a frozen matched checkpoint test through the owning skills. This is the experiment that collects gameplay evidence, not a requirement to have already proved gameplay. Qualification, feasible N/caps and the escalation rule must precede it. Test real persistence/resumption and retirement separately from a single next call; follow [checkpoint-validation](references/checkpoint-validation.md).

Save the full search, component/whole-policy evidence, uncertainties, regressions, native results and remaining budget. Report proposal, source implementation, landing, measured behavior and activation separately. No checkpoint result automatically authorizes production activation or a whole-game claim. Follow personal reporting preferences through global skills; keep delivery configuration out of project skills.

## Stop and resume honestly

Stop dependent work on fidelity/scoring failure, unclear ownership, an exhausted window, infeasible next complete stage, missing qualified continuation or exhausted search limits. Save the blocker and next executable decision; release resources rather than poll indefinitely. Do not create a recurring automation unless requested.

After interruption reconcile worker/lease, journal, response and occupancy records under the same question/exposure ledger. Unknown begun work remains uncertain or failed under the declared rule; never regenerate it for convenience. Resume only unbegun positions with unchanged measurement inputs and sufficient authorized resources. Resume failed grading from saved responses under its frozen protocol; a correction gets a disclosed version. Resumption never resets spend or replenishes confirmation.
