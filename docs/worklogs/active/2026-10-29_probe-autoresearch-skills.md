# Power-sized decision probes and autonomous research skills

## Scope and authorization
The operator requested updates to the original probe skill and a companion automation skill after approving power-based sizing. The design uses 90% target power, a per-question .01 false-positive threshold, small development batches, and one aggregate GPU hour for the whole research question; infeasibility is reported after design and before sampling. Follow-up: personal report presentation/delivery instructions belong in global skills, outside this repository.

One documentation milestone. No executable runner, statistical implementation, application behavior, inference, checkpoint play, recipe activation, viewer refresh or production promotion. No changes to the experiment-design skill's general cohort defaults; the probe-specific policy explicitly scopes its override. Creating these skills is not launch authorization.

## Deliverables
- [x] Original probe skill owns validity, sizing, grading, one-hour accounting and experiment provenance.
- [x] Companion skill owns research, trace-grounded candidate lineage, bounded adaptation and durable resume records using existing authorized tools.
- [x] Global reporting skill handles personal report requirements; project files contain no personal delivery configuration.
- [x] Discovery metadata and repository-relative links validated.
- [x] Documentation checks and independent behavioral review completed; required external Grok lane unavailable, so full landing gate remains incomplete.
- [ ] Branch commit, applicable independent landing reviews and coordinated local landing.

## Validation boundary
Prose and discovery metadata only: diff whitespace checks, skill validator, local reference/link checks, realistic GPU-free forward tests, independent review. No application build/lint/coverage or service refresh. Existing publisher scripts remain byte-identical. A prose skill describes an agent-led process, not an implemented unattended scheduler/controller.

## Review and landing
Read CLAUDE.md, skill-creator, execute-worklog and talk-to-claude. Keep frozen review identity and distinguish branch commit, review and landing. Record any unavailable required review lane; never label a fallback a required cloud-lane approval. Do not archive this worklog without the operator's instruction.

## Progress
- Research and primary-source examples are in canonical ignored report artifacts from this chat; only maintained, qualified lessons enter instructions.

- Validation: three skill quick validators PASS; Markdown reference checks, UI prompt/description checks, both discovery symlinks and personal-delivery boundary checks PASS. Existing executable publisher files untouched. Independent review pending.

## Frozen review evidence
- Source commit: `b93f910e3a0fce75406f0782513cd6c314daf007`; base `f442c91ffa38e90bf4d091dd94b9c502a74e08a8`; binary diff SHA-256 `ddab3167273d6745dd9c8fccac51a11fcabc3c504ebb5f6c446e42074e488dfa`. Packet, full Claude result, failure receipts and global-file snapshots are in `/tmp/probe-skills-review/`; this worklog preserves the decision if temporary artifacts expire.
- Claude CLI dedicated read-only review: exit 0, terminal `VERDICT: LGTM`, frozen source and global hashes verified before and after. No blockers. Non-blocking observation: the existing independent-reference planner caps its search at 400 per arm, so the illustrative 768-per-arm row needs a separate fixed-N calculation; it is not a universal minimum or a promise that the planner finds it.
- Three fresh no-history read-only native GPT reviewers: `/root/probe_stats_review`, `/root/probe_resume_review`, `/root/probe_scope_review`. Each independently verified the exact frozen head, diff hash, clean source and all global snapshot hashes before/after; each ended `VERDICT: LGTM`. None edited source or performed application/inference work. These satisfy normal GPT-family review and supplementary independent scenario coverage, not a Grok-family substitute.
- Statistics forward tests: a 192-per-arm confirmation at 30 seconds/call needs 3.2 aggregate GPU hours before development/overhead, so flag before launching; two related source families do not establish transfer power. Pilot ties do not establish no effect. A significant primary p-value cannot waive missing regression controls.
- Resume forward test: 47 spent minutes plus 20 protected confirmation minutes exceeds the cap; preserve uncertain requests and failed grading, reconcile occupancy, never duplicate samples or silently shrink confirmation. Design-only and single-comparison requests do not authorize an optimization campaign.
- Scope forward tests: project discovery links and global Claude discovery resolve; personal delivery settings stay global. Four request-routing scenarios passed.
- Grok via discovered `cursor-grok-4.5-high`: exit 1, empty reviewer stdout; stderr: `ActionRequiredError: Increase limits for faster responses You're out of usage. Switch to Auto, or ask your admin to increase your limit to continue.` This is unavailable, not approval. No credentials or account limits changed.
- Repository-specific execute-worklog rule says an unavailable cloud lane prevents self-merge and requires the operator. This more specific landing rule is retained despite the generic review skill's availability fallback. Asked the operator for a concrete Grok waiver after completing the reviewed skills. No landing slot joined, no main merge, no activation. Awaiting his decision.
- Final frozen source/global integrity recheck PASS. Validation remains prose-only; no build, application tests, GPU calls, gameplay, refresh or scheduler installation.

## Existing authorization and integration
- Verified the coordinator's cited native transcript at `[private transcript]`, records 4145/4964/6309: server-attributed user messages include “yes dont wait for grok” (2026-10-21 20:35:35Z) and “land without grok. you're not a very good coordinator if you force me to go into chats” (2026-10-22 14:47:31Z; project message `[private message reference]`). The attached coordination context specifies the standing all-branch Claude + GPT + independent fallback roster. This pre-existing human authorization resolves the redundant fresh waiver question; no new permission is inferred from agent opinion alone. Grok remains unavailable and vendor diversity is reduced.
- Added fresh no-history distinct-model fallback `/root/probe_astra_fallback`, `gpt-6-astra`, read-only exact frozen packet review. Existing three independent GPT reviews remain retained. Awaiting fallback verdict before board entry.
- Integrated main `66cfdda0fabbf3bf1bd4f58f5ffb27e81b0afd53` into branch at `a9fbb6cfa55277d08a3356a4dc165df6b0f676ce`. Upstream paths since frozen base: map-visibility explainer/worklog, feature-config README/current recipe, viewer map-visibility test. Upstream changes alter current recipe defaults and viewer assertions; they do not change the skill discovery, probe sampling/scoring, resource accounting, publisher APIs, statistical planner or documentation validation contracts. Future research must freeze its actual current incumbent as already required. No runtime change is introduced by these prose skills. Retain frozen reviews and checks.
- Compared the seven feature paths (excluding evidence worklog) against new main: binary diff remains byte-identical to frozen feature delta; feature-only SHA-256 `5b4ca3706e7453371057a39dadfd9fa7fb448373a1614f4143a6a26742be017e`. Original complete packet digest includes the original worklog and remains preserved separately. Only worklog evidence has changed within this feature scope.
