# refusal-ledger-bound-v1 (bounded navigation refusal history)

Operator decisions, relayed from the project thread:

- The operator 2026-10-28 picked bound 3 (refusal ledger) with bounds 1, 2, 4 and 6. Each is its own default-OFF switch on its own branch off main.
- The operator: "they all need to be on in the bundle". The activation commit puts it in current.json `switches` (bundle arm only); control stays OFF.
- Coordinator 11:51 AM NY: nothing given to the model may grow unbounded. Keep a running list of other lines that grow with run length, and report it at the end.
- Don't land or activate until the coordinator returns with the operator's OK. Full suites only on a relayed CPU grant.

## Why

refusal-ledger-v1 sends "Navigation refusal history" in the belief ledger message, with one entry per refused target on the current map. Each entry quotes the whole latest navigation result. Water and wall refusals carry their departure alternatives, so one entry runs about 3,000 chars. Qwen run 9e33 at T2417 had 10 entries and 24,803 chars.

An entry's "at turns …" list also grows with every repeat of the same refusal.

## Rule (whole entries; quoted results are never cut)

- Whole entries, newest first, are kept while the kept entry lines, joined with newlines, fit in 4,000 chars. The newest entry always stays. Kept entries are shown in their usual order (oldest first). A line under the header counts the rest: `N older refusal entries on this map are left out.`
- A repeated refusal lists its latest 10 turns. The full count stays in the line, and the rest are counted: `40 times navigation returned this reason, at turns 31, …, 40 (and 30 earlier turns).`
- The header, the evidence seqs and the recorded `entries` count are unchanged.

**OFF:** byte-identical. **ON with nothing over a bound:** also byte-identical.

## M1

- [x] RED: `packages/agent/src/refusal-ledger-bound.test.ts`, 5 tests. OFF passes; the 3 ON tests and the registry test fail.
- [x] GREEN: `refusal-ledger.ts` (REFUSAL_LEDGER_CHARS 4000, REFUSAL_TURNS_SHOWN 10); registry index 295 (after main's new neutral-yes-no-readout-v1; main moved to 0df1c0a1f after the bound-1 and bound-2 branches cut from eb4d388be), guidance, needs refusal-ledger-v1; preset, next-run. 5/5; with refusal-ledger, disproved-beliefs, features 91 passed; agent and viewer tsc clean; eslint clean.
- [x] Replay of recorded events through the built `RefusalLedger`. OFF matches every recorded refusal history: 9e33 1,284, a702 408, 88ea 830, all byte for byte. Largest recorded → same turn ON → largest ON in the run: 9e33 T2417 24,803 → 3,212 → 4,723; a702 T852 10,310 → 2,664 → 3,440; 88ea T843 15,065 → 3,231 → 3,509. 88ea was read only.
- [x] Explainer `docs/explainers/refusal-ledger-bound-v1.html` (theme, pages-check clean, headless screenshots), README, `FEATURE_EXPLAINERS`; panels/server link tests 2/2.
- [x] Activation commit (this branch only; not landed): appended to current.json `switches` (bundle ON) and `features` false (control OFF). Recipe sha256 on main 0df1c0a1f is 5188c278…; on this branch 6fb2ac82…. Once several bounds land, the final sha is computed on main. Launch definitions with featureRecipe "current" need `just fixed-run approve` again. Config readers: viewer 51 passed, agent 61 passed.
- [x] Merged main 780154405 (the cap landed). Registry conflicts were resolved by keeping main's entries and adding these switches after instruction-memory-cap-v1. Indexes: refusal 295 → 296, disproved 296 → 297. current.json: both switches are in `switches`, and cap stays true. Focused: 123 passed.
- [ ] Gates on a CPU grant; three-lane review.

## M2: disproved-beliefs-bound-v1 (coordinator 2026-10-28 12:00 PM NY)

The other half of the same belief-ledger message is "Things the game has contradicted", from `disproved-beliefs.ts`. It is a different class, so it gets its own small switch here, needing disproved-beliefs-v1. Same rule: whole entries, newest first, within 4,000 chars, under `N older entries are left out.`, and each turn list shows its latest 10 `(and N earlier turns)`.

- [x] RED: `disproved-beliefs-bound.test.ts`, 5 tests. It replays sh02's recorded turn-146 push-back (TWIN, LITTLEROOT TOWN), shifted east once per entry. The 2 OFF tests pass; the 2 ON tests and the registry test fail.
- [x] GREEN: `disproved-beliefs.ts` (BELIEF_LEDGER_CHARS 4000, BELIEF_TURNS_SHOWN 10); registry index 296 (guidance, needs disproved-beliefs-v1), preset, next-run. 5/5; with the refusal-ledger, disproved-beliefs and features tests, 96 passed; tsc and eslint clean.
- [x] Explainer section in `refusal-ledger-bound-v1.html` (same message), with the card link mapped to that page. Activation: in current.json `switches` (bundle ON) and `features` false (control OFF). The fixed-run launch approval was removed on main (979b004e6), so no approve step is needed.

## Lines that grow with run length (running list)

- Supervisor "Exits to maps you have not entered": bounded in supervisor-briefing-bound-v1 (M2).
- Refusal ledger entries and the per-entry turn list: this switch.
- Disproved beliefs ("Things the game has contradicted", the other half of the belief ledger): entries last until a story flag changes, and each push-back or misplaced-person entry's turn list grows with repeats. It never appeared in 9e33, a702, 88ea or 429f. Bounded in M2.

## Review round 1 (head 3a7507a85, base main 90b351b55)

Roster: Codex gpt-5.6-sol, a Claude opus subagent and a sonnet fallback subagent. The CLI's OAuth has expired, Cursor is out of usage, and Codex's default model is refused.

- Claude: LGTM, with a hardening note: disproved-beliefs picks the newest by creation, not by latest repeat.
- Fallback: LGTM, with the same note plus the wording "1 earlier turns".
- Codex: BLOCKING:
  - Recency after a repeat: accepted.
  - UTF-16 units vs code points: accepted.
  - No production-path test, and no durable replay artifact: accepted.
  - Superlinear fixture: rebutted. The O(entries) scan per result is DisprovedBeliefs.result()'s pre-existing production path, not fixture setup. 40 rows is about 1,600 visits, and the assertions need more than 4,000 chars of whole entries, which takes about 40 push-backs.

- [x] RED:
  - Code points: one test per ledger.
  - Disproved recency: entry A is created first and repeated last, and must be kept.
  - `contextTools` tests per switch: they pass against the wiring and go RED when `disprovedBeliefs()` forces either bound off (checked, then restored).
- [x] GREEN:
  - Both ledgers count code points through the cap's `codePoints` (one owner).
  - DisprovedBeliefs picks the newest by each entry's latest evidence seq. Both kinds append seqs on repeat. Display order is unchanged.
  - "(and 1 earlier turn)" is now singular.
  - Results: 101 passed with the ledger and registry tests; tsc and eslint clean.
- [x] Codex's round-2 fixture point, taken: the contradiction fixtures now use six entries of long pages to cross 4,000 chars, not 40 short ones. The 20-entry OFF check is now 5 entries. 8/8 pass, and the left-out count is still asserted.
- Worklog correction (round-3 Claude lane): the next entries were first appended by mistake to docs/worklogs/active/2026-10-28_neutral-yes-no.md (a `ls | head -1` slip) in the round-2 fix commit and the main 606bf6d24 merge. They are moved here and that file is restored to main.
- [x] Round 2: Claude LGTM, fallback LGTM. Codex BLOCKING on a stale explainer status line and on the missing frozen-head gate. Status corrected: activation is committed on the branch, and the change takes effect only after landing and a new launch. The first round-2 gate attempt on the compact head failed only on an unrelated 5 s timeout (serial-comparison.test.ts, under parallel load) and was stopped; the gate reruns on the final head.
- [x] Merged main 606bf6d24 (pokenav-call-auto-advance-v1 landed). Registry conflicts were resolved by keeping main's entries and adding this branch's switch after it. Index pins +1. The resolver had dropped the single-line FEATURES on() entry for compact and supervisor; it was restored and the resolver hardened. Focused agent tests plus viewer panels/server/next-run/feature-config/fixed-definition (421) pass.
- [x] Round 3: Codex flagged stale explainer evidence (test counts / fixture shape); corrected from the exact focused run, with the receipt in runs/analysis/bounded-input-20261028/replays/refusal-ledger-bound-v1.focused.txt.
